"""
API and integration tests for all Phase 1 and Phase 2 FastAPI endpoints.
"""

from __future__ import annotations

import json
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.serializers import serialize_state, serialize_metrics
from satellite_recovery.simulator.spacecraft import SpacecraftState, SpacecraftParams
from satellite_recovery.evaluation.metrics import MetricsRecord

client = TestClient(app)
REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_CSV_PATH = REPO_ROOT / "experiments" / "results" / "results.csv"


# ---------------------------------------------------------------------------
# Health Endpoint Tests
# ---------------------------------------------------------------------------

def test_health_endpoint():
    """Verify GET /api/health returns HTTP 200 and accurate system diagnostics."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] in ("ok", "degraded")
    assert "python_version" in data
    assert data["app_version"] == "0.1.0"
    assert data["app_name"] == "Risk-Aware Dynamic A* Satellite Anomaly Recovery API"
    assert data["scorer_loaded"] is True
    assert data["assets"]["scorer_model"] is True
    assert data["assets"]["nominal_dataset"] is True
    assert data["assets"]["experiment_results"] is True
    assert len(data["known_issues"]) >= 1
    assert "H3" in data["known_issues"][0]


# ---------------------------------------------------------------------------
# Catalog Endpoints Tests
# ---------------------------------------------------------------------------

def test_list_scenarios_endpoint():
    """Verify GET /api/scenarios returns all 6 canonical scenarios with metadata."""
    response = client.get("/api/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert isinstance(scenarios, list)
    assert len(scenarios) == 6
    names = {s["name"] for s in scenarios}
    assert "single_thermal" in names
    assert "single_power" in names
    assert "single_load" in names
    assert "cascade" in names
    assert "single_thermal_sun" in names
    assert "single_power_sun" in names

    first = scenarios[0]
    assert "fault_name" in first
    assert "description" in first
    assert "orbit_phase" in first


def test_list_commands_endpoint():
    """Verify GET /api/commands returns all 8 recovery commands with costs."""
    response = client.get("/api/commands")
    assert response.status_code == 200
    commands = response.json()
    assert isinstance(commands, list)
    assert len(commands) == 8
    cmd_map = {c["name"]: c for c in commands}
    assert "payload_off" in cmd_map
    assert "safe_mode" in cmd_map
    assert cmd_map["payload_off"]["nominal_cost"] > 0.0
    assert cmd_map["safe_mode"]["nominal_cost"] > 0.0


# ---------------------------------------------------------------------------
# Simulation Step Endpoint Tests
# ---------------------------------------------------------------------------

def test_simulate_step_legal_command():
    """Verify POST /api/simulate/step executes a legal command and advances physics."""
    state_payload = {
        "time": 0.0,
        "soc": 0.75,
        "temp_battery": 20.0,
        "temp_payload": 25.0,
        "temp_bus": 20.0,
        "heater_on": False,
        "payload_on": True,
        "transmitter_on": True,
        "mode": "nominal",
        "fault_heat_payload": 0.0,
        "fault_heat_battery": 0.0,
        "fault_extra_load": 0.0,
    }
    response = client.post(
        "/api/simulate/step",
        json={"state": state_payload, "command": "payload_off"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["command"] == "payload_off"
    assert data["command_cost"] > 0.0
    assert data["next_state"]["payload_on"] is False
    assert data["next_state"]["time"] == 60.0  # advanced by dt
    assert data["is_infeasible"] is False


def test_simulate_step_illegal_precondition_rejection():
    """Verify POST /api/simulate/step rejects command whose precondition is violated."""
    # payload is already on; applying payload_on is illegal
    state_payload = {
        "time": 0.0,
        "soc": 0.75,
        "temp_battery": 20.0,
        "temp_payload": 25.0,
        "temp_bus": 20.0,
        "heater_on": False,
        "payload_on": True,
        "transmitter_on": True,
        "mode": "nominal",
    }
    response = client.post(
        "/api/simulate/step",
        json={"state": state_payload, "command": "payload_on"},
    )
    assert response.status_code == 400
    assert "precondition" in response.json()["detail"].lower()


def test_simulate_step_unknown_command_rejection():
    """Verify POST /api/simulate/step rejects unknown command names."""
    state_payload = {
        "time": 0.0,
        "soc": 0.75,
        "temp_battery": 20.0,
        "temp_payload": 25.0,
        "temp_bus": 20.0,
        "heater_on": False,
        "payload_on": True,
        "transmitter_on": True,
        "mode": "nominal",
    }
    response = client.post(
        "/api/simulate/step",
        json={"state": state_payload, "command": "boost_thrusters"},
    )
    assert response.status_code == 400
    assert "unknown command" in response.json()["detail"].lower()


def test_simulate_step_malformed_state_rejection():
    """Verify POST /api/simulate/step rejects malformed state dictionaries with HTTP 422."""
    response = client.post(
        "/api/simulate/step",
        json={"state": {"time": 0.0}, "command": "payload_off"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Simulation Initialization Endpoint Tests
# ---------------------------------------------------------------------------

def test_simulate_init_default_scenario():
    """Verify GET /api/simulate/init returns deterministic state, limits, and solar flux."""
    response = client.get("/api/simulate/init")
    assert response.status_code == 200
    data = response.json()

    assert data["scenario"] == "single_thermal"
    assert data["fault_name"] == "thermal_runaway"
    assert "single_thermal" in data["description"].lower() or "thermal runaway" in data["description"].lower()
    assert data["orbit_phase"] == 0.62
    # In eclipse at orbit_phase 0.62 (0.65 threshold)
    assert isinstance(data["solar_flux_w"], float)

    st = data["initial_state"]
    assert st["time"] == 0.0
    assert st["temp_payload"] == 58.0  # fault override
    assert st["fault_heat_payload"] == 35.0
    assert st["in_nominal_band"] is False  # 58°C > 55°C
    assert "temp_payload" in st["parameter_violations"]
    assert st["parameter_violations"]["temp_payload"] == 3.0  # 58 - 55

    limits = data["limits"]
    assert limits["soc_hard_min"] == 0.15
    assert limits["soc_nominal_min"] == 0.35
    assert limits["temp_pay_hard_max"] == 70.0
    assert limits["temp_pay_nominal_max"] == 55.0


def test_simulate_init_path_parameter():
    """Verify GET /api/simulate/init/{scenario_name} loads specific scenarios accurately."""
    response = client.get("/api/simulate/init/single_power")
    assert response.status_code == 200
    data = response.json()

    assert data["scenario"] == "single_power"
    assert data["fault_name"] == "battery_degradation"
    assert data["orbit_phase"] == 0.20
    assert data["solar_flux_w"] > 0.0  # sunlit arc
    assert data["initial_state"]["soc"] == 0.28  # low SoC override
    assert data["initial_state"]["temp_battery"] == 42.0  # warm battery override


def test_simulate_init_cascade_scenario():
    """Verify GET /api/simulate/init/cascade initializes multi-fault condition."""
    response = client.get("/api/simulate/init/cascade")
    assert response.status_code == 200
    data = response.json()

    assert data["scenario"] == "cascade"
    assert data["initial_state"]["soc"] == 0.28
    assert data["initial_state"]["temp_payload"] == 57.0
    assert data["initial_state"]["fault_heat_payload"] == 28.0
    assert data["initial_state"]["fault_extra_load"] == 20.0


def test_simulate_init_unknown_scenario_rejection():
    """Verify GET /api/simulate/init rejects non-existent scenario names with HTTP 400."""
    # Path parameter
    r1 = client.get("/api/simulate/init/invalid_scenario_xyz")
    assert r1.status_code == 400
    assert "unknown scenario" in r1.json()["detail"].lower()

    # Query parameter
    r2 = client.get("/api/simulate/init?scenario=nonexistent_scenario")
    assert r2.status_code == 400
    assert "unknown scenario" in r2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Recovery Planning Endpoint Tests
# ---------------------------------------------------------------------------

def test_plan_solve_successful_recovery():
    """Verify POST /api/plan/solve runs an A* search and returns a valid recovery trajectory."""
    payload = {
        "scenario": "single_thermal",
        "algorithm": "astar",
        "variant": "H2",
        "lambda_risk": 50.0,
        "budget_nodes": 1000,
        "max_depth": 10,
        "seed": 0,
    }
    response = client.post("/api/plan/solve", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["scenario"] == "single_thermal"
    assert data["algorithm"] == "astar"
    assert data["variant"] == "H2"
    assert data["success"] is True
    assert data["termination_reason"] == "goal_reached"
    assert data["solution_cost"] is not None
    assert data["solution_depth"] > 0
    assert len(data["path"]) >= 2

    # Step-level details verification
    first_step = data["path"][0]
    assert first_step["step"] == 0
    assert first_step["action"] is None
    assert first_step["step_cost"] == 0.0

    second_step = data["path"][1]
    assert second_step["action"] is not None
    assert second_step["step_cost"] > 0.0
    assert second_step["accumulated_cost"] >= second_step["step_cost"]
    # Risk score computed
    assert second_step["risk_score"] is not None
    assert 0.0 <= second_step["risk_score"] <= 1.0

    # Final state achieved nominal band
    assert data["path"][-1]["state"]["in_nominal_band"] is True


def test_plan_solve_budget_exhausted_unsuccessful():
    """Verify budget exhaustion returns success=False without claiming partial path is a goal."""
    payload = {
        "scenario": "cascade",
        "algorithm": "astar",
        "variant": "H2",
        "lambda_risk": 50.0,
        "budget_nodes": 1,
        "max_depth": 10,
        "seed": 0,
    }
    response = client.post("/api/plan/solve", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is False
    assert data["termination_reason"] == "budget_exhausted"
    # Even if path exists (best-partial), goal must not be reached
    assert data["path"][-1]["state"]["in_nominal_band"] is False


def test_plan_solve_local_search():
    """Verify local search algorithms execute without requiring heuristic variants."""
    payload = {
        "scenario": "single_thermal",
        "algorithm": "hill_climbing",
        "variant": "H2",  # accepted for uniform API, ignored internally for local search
        "lambda_risk": 50.0,
        "budget_nodes": 500,
        "max_depth": 10,
        "seed": 0,
    }
    response = client.post("/api/plan/solve", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["algorithm"] == "hill_climbing"
    assert "termination_reason" in data


# ---------------------------------------------------------------------------
# Benchmark Comparison Endpoint Tests
# ---------------------------------------------------------------------------

def test_benchmark_compare_valid_request():
    """Verify POST /api/benchmark/compare runs multiple algorithms and returns comparative metrics."""
    payload = {
        "scenario": "single_thermal",
        "algorithms": ["astar", "idastar"],
        "variants": ["H1", "H2"],
        "lambda_risk": 50.0,
        "budget_nodes": 500,
        "max_depth": 10,
        "seed": 0,
    }
    response = client.post("/api/benchmark/compare", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["scenario"] == "single_thermal"
    assert data["total_runs"] == 4  # 2 algorithms x 2 variants
    assert len(data["runs"]) == 4

    for run in data["runs"]:
        assert run["algorithm"] in ("astar", "idastar")
        assert run["variant"] in ("H1", "H2")
        assert run["nodes_expanded"] > 0
        assert run["wall_time_s"] >= 0.0
        assert run["termination_reason"] in ("goal_reached", "budget_exhausted", "unsolved")


def test_benchmark_compare_with_local_search():
    """Verify benchmark handles local search (which does not use heuristic variants)."""
    payload = {
        "scenario": "single_thermal",
        "algorithms": ["astar", "hill_climbing"],
        "variants": ["H2"],
        "lambda_risk": 50.0,
        "budget_nodes": 300,
        "max_depth": 10,
        "seed": 0,
    }
    response = client.post("/api/benchmark/compare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_runs"] == 2
    algos_run = [r["algorithm"] for r in data["runs"]]
    assert "astar" in algos_run
    assert "hill_climbing" in algos_run


def test_benchmark_compare_excessive_combinations_rejection():
    """Verify benchmark rejects requests exceeding the combination limit of 15."""
    payload = {
        "scenario": "single_thermal",
        "algorithms": ["astar", "idastar", "rbfs", "hill_climbing"],
        "variants": ["H0", "H1", "H2", "H3", "H4"],  # 3*5 + 1 = 16 combinations > 15
        "budget_nodes": 100,
    }
    response = client.post("/api/benchmark/compare", json=payload)
    assert response.status_code == 400
    assert "exceeds limit" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Telemetry Sample Endpoint Tests
# ---------------------------------------------------------------------------

def test_telemetry_sample_specific_window():
    """Verify GET /api/telemetry/sample returns exact 10-step window from nominal dataset."""
    response = client.get("/api/telemetry/sample?window_index=100&n_windows=1")
    assert response.status_code == 200
    data = response.json()

    assert data["dataset_total_windows"] == 10100
    assert data["window_length_steps"] == 10
    assert len(data["channels"]) == 8
    assert len(data["windows"]) == 1

    win = data["windows"][0]
    assert win["window_index"] == 100
    assert len(win["points"]) == 10
    assert win["anomaly_score"] is not None
    assert 0.0 <= win["anomaly_score"] <= 1.0

    first_point = win["points"][0]
    assert first_point["step_index"] == 0
    assert first_point["time_offset_s"] == 0.0
    assert "soc" in first_point["values"]
    assert "temp_payload" in first_point["values"]


def test_telemetry_sample_reproducible_seed():
    """Verify reproducible sampling when seed parameter is supplied."""
    r1 = client.get("/api/telemetry/sample?seed=42&n_windows=2")
    r2 = client.get("/api/telemetry/sample?seed=42&n_windows=2")
    assert r1.status_code == 200
    assert r2.status_code == 200
    d1 = r1.json()
    d2 = r2.json()

    assert d1["windows"][0]["window_index"] == d2["windows"][0]["window_index"]
    assert d1["windows"][0]["points"][0]["values"] == d2["windows"][0]["points"][0]["values"]


def test_telemetry_sample_out_of_bounds():
    """Verify error when window index is out of bounds."""
    response = client.get("/api/telemetry/sample?window_index=999999")
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Experiment History Endpoint Tests
# ---------------------------------------------------------------------------

def test_experiments_history_endpoint():
    """Verify GET /api/experiments/history reads existing results without modifying file."""
    stat_before = RESULTS_CSV_PATH.stat().st_mtime

    response = client.get("/api/experiments/history?limit=10")
    assert response.status_code == 200
    data = response.json()

    assert data["total_records"] > 0
    assert len(data["records"]) <= 10
    first = data["records"][0]
    assert "scenario" in first
    assert "algorithm" in first
    assert "solution_cost" in first

    # Verify file was not modified
    stat_after = RESULTS_CSV_PATH.stat().st_mtime
    assert stat_before == stat_after


def test_experiments_history_filtering():
    """Verify filtering by scenario, algorithm, or variant."""
    response = client.get("/api/experiments/history?scenario=single_thermal&algorithm=astar&limit=50")
    assert response.status_code == 200
    data = response.json()

    for rec in data["records"]:
        assert rec["scenario"] == "single_thermal"
        assert rec["algorithm"] == "astar"

    # Non-existent scenario returns empty list
    r_empty = client.get("/api/experiments/history?scenario=nonexistent_scenario")
    assert r_empty.status_code == 200
    assert r_empty.json()["total_records"] == 0
    assert r_empty.json()["records"] == []


# ---------------------------------------------------------------------------
# Input Validation & Serialization Tests
# ---------------------------------------------------------------------------

def test_input_validation_rejections():
    """Verify Pydantic input validation rejects illegal parameters with HTTP 422."""
    # 1. Invalid scenario
    r1 = client.post("/api/plan/solve", json={"scenario": "nonexistent_orbit_failure"})
    assert r1.status_code == 422

    # 2. Invalid algorithm
    r2 = client.post("/api/plan/solve", json={"scenario": "single_thermal", "algorithm": "genetic_algo"})
    assert r2.status_code == 422

    # 3. Invalid variant
    r3 = client.post("/api/plan/solve", json={"scenario": "single_thermal", "variant": "H99"})
    assert r3.status_code == 422

    # 4. Negative budget
    r4 = client.post("/api/plan/solve", json={"scenario": "single_thermal", "budget_nodes": -10})
    assert r4.status_code == 422

    # 5. Negative lambda_risk
    r5 = client.post("/api/plan/solve", json={"scenario": "single_thermal", "lambda_risk": -5.0})
    assert r5.status_code == 422


def test_serializers_safe_json_handling():
    """Verify serializers produce JSON-serializable dictionaries and handle inf/nan."""
    p = SpacecraftParams()
    s = SpacecraftState(
        time=0.0,
        soc=0.5,
        temp_battery=20.0,
        temp_payload=22.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode="nominal",
    )
    serialized_s = serialize_state(s, p)
    dumped_s = json.dumps(serialized_s)
    assert "temp_payload" in dumped_s

    # Metrics with float('inf')
    m = MetricsRecord(
        scenario="single_thermal",
        algorithm="astar",
        heuristic_variant="H2",
        lambda_risk=50.0,
        seed=0,
        success=0,
        time_to_stable_s=float("inf"),
        safety_margin=float("-inf"),
        solution_cost=float("inf"),
        path_length=0,
    )
    serialized_m = serialize_metrics(m)
    assert serialized_m["time_to_stable_s"] is None
    assert serialized_m["safety_margin"] is None
    assert serialized_m["solution_cost"] is None
    dumped_m = json.dumps(serialized_m)
    assert "time_to_stable_s" in dumped_m
