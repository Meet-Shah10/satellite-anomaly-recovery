"""
Research adapter service connecting API requests to the satellite_recovery engine.

Integrates simulator scenarios, search algorithms, the trained Isolation Forest
anomaly scorer, and experiment results without altering the core scientific implementation.
"""

from __future__ import annotations

import csv
import logging
import math
import platform
import threading
from pathlib import Path
from typing import Any, Optional

import numpy as np

from satellite_recovery.simulator.spacecraft import SpacecraftState, SpacecraftParams, Simulator
from satellite_recovery.simulator.orbit import OrbitSchedule
from satellite_recovery.simulator.commands import COMMANDS, apply_command, command_cost
from satellite_recovery.evaluation.scenarios import SCENARIOS
from satellite_recovery.evaluation.metrics import compute_metrics
from satellite_recovery.anomaly.scorer import BaseScorer
from experiments.run_experiment import build_algorithm

from .schemas import (
    PlanRequest,
    ScenarioInfoSchema,
    CommandInfoSchema,
    SimulateStepRequest,
    BenchmarkCompareRequest,
    BenchmarkRunResultSchema,
)
from .serializers import (
    serialize_plan_response,
    serialize_command,
    serialize_state,
    _sanitize_float,
)

log = logging.getLogger("satellite_backend.services")

# ---------------------------------------------------------------------------
# Path Resolution
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
SCORER_PATH = REPO_ROOT / "experiments" / "scorers" / "isolation_forest.joblib"
NOMINAL_DATA_PATH = REPO_ROOT / "experiments" / "data" / "nominal_windows.npy"
NOMINAL_META_PATH = REPO_ROOT / "experiments" / "data" / "nominal_windows_meta.npy"
RESULTS_CSV_PATH = REPO_ROOT / "experiments" / "results" / "results.csv"

# Known research discrepancy note
KNOWN_H3_NOTE = (
    "Research finding: Heuristic variant H3 currently applies augmented_g() to add "
    "lambda*risk to child.g, and then compute_f() adds lambda*risk again (computing "
    "g + 2*lambda*risk + h_d) rather than accumulating cumulative risk sum(lambda*R_i) "
    "along the path. This implementation is preserved unchanged for audit fidelity."
)

# Telemetry Channel Definitions
TELEMETRY_CHANNELS = [
    {"name": "soc", "index": 0, "display_name": "State of Charge", "unit": "ratio [0-1]", "description": "Battery charge fraction"},
    {"name": "temp_battery", "index": 1, "display_name": "Battery Temperature", "unit": "°C", "description": "Battery cell temperature"},
    {"name": "temp_payload", "index": 2, "display_name": "Payload Temperature", "unit": "°C", "description": "Science instrument temperature"},
    {"name": "temp_bus", "index": 3, "display_name": "Bus Temperature", "unit": "°C", "description": "Electronics bus temperature"},
    {"name": "heater_on", "index": 4, "display_name": "Heater Relay", "unit": "flag [0/1]", "description": "Thermal heater status"},
    {"name": "payload_on", "index": 5, "display_name": "Payload Power", "unit": "flag [0/1]", "description": "Payload power switch"},
    {"name": "transmitter_on", "index": 6, "display_name": "Transmitter Power", "unit": "flag [0/1]", "description": "RF transmitter status"},
    {"name": "mode_code", "index": 7, "display_name": "Operating Mode", "unit": "code [0-2]", "description": "0=nominal, 1=low_power, 2=safe_mode"},
]


# ---------------------------------------------------------------------------
# Research Engine Service
# ---------------------------------------------------------------------------

class ResearchEngineService:
    """Thread-safe adapter managing the scientific models and algorithm executions."""

    def __init__(self) -> None:
        self._scorer: Optional[BaseScorer] = None
        self._scorer_lock = threading.Lock()
        self._scorer_loaded = False
        self._nominal_windows: Optional[np.ndarray] = None
        self._nominal_meta: Optional[np.ndarray] = None
        self._data_lock = threading.Lock()
        self._load_scorer_safely()

    def _load_scorer_safely(self) -> None:
        """Attempt to load the trained anomaly scorer once upon initialization."""
        with self._scorer_lock:
            if SCORER_PATH.exists():
                try:
                    log.info("Loading anomaly scorer from %s", SCORER_PATH)
                    self._scorer = BaseScorer.load(str(SCORER_PATH))
                    self._scorer_loaded = True
                    log.info("Anomaly scorer successfully loaded.")
                except Exception as exc:
                    log.error("Failed to load anomaly scorer: %s", exc)
                    self._scorer = None
                    self._scorer_loaded = False
            else:
                log.warning("Anomaly scorer asset not found at %s", SCORER_PATH)
                self._scorer = None
                self._scorer_loaded = False

    def _get_nominal_dataset(self) -> tuple[np.ndarray, Optional[np.ndarray]]:
        """Lazy-load the nominal training dataset via read-only memory map."""
        with self._data_lock:
            if self._nominal_windows is None:
                if not NOMINAL_DATA_PATH.exists():
                    raise FileNotFoundError(f"Nominal dataset missing at {NOMINAL_DATA_PATH}")
                self._nominal_windows = np.load(str(NOMINAL_DATA_PATH), mmap_mode='r')
                if NOMINAL_META_PATH.exists():
                    self._nominal_meta = np.load(str(NOMINAL_META_PATH), mmap_mode='r')
        return self._nominal_windows, self._nominal_meta

    @property
    def scorer(self) -> Optional[BaseScorer]:
        """Access the cached anomaly scorer."""
        return self._scorer

    def get_health_status(self) -> dict[str, Any]:
        """Check availability of Python environment, model assets, and datasets."""
        assets_status = {
            'scorer_model': SCORER_PATH.exists() and self._scorer_loaded,
            'nominal_dataset': NOMINAL_DATA_PATH.exists(),
            'experiment_results': RESULTS_CSV_PATH.exists(),
        }

        # Health status is degraded if core scorer model is missing
        status = 'ok' if assets_status['scorer_model'] else 'degraded'

        return {
            'status': status,
            'python_version': platform.python_version(),
            'app_version': '0.1.0',
            'app_name': 'Risk-Aware Dynamic A* Satellite Anomaly Recovery API',
            'scorer_loaded': self._scorer_loaded,
            'assets': assets_status,
            'known_issues': [KNOWN_H3_NOTE],
        }

    def list_scenarios(self) -> list[ScenarioInfoSchema]:
        """Return available evaluation scenarios with metadata."""
        items: list[ScenarioInfoSchema] = []
        for name, sc in SCENARIOS.items():
            items.append(ScenarioInfoSchema(
                name=name,
                fault_name=sc.fault_name,
                description=sc.description,
                orbit_phase=float(sc.orbit_phase),
            ))
        return items

    def list_commands(self) -> list[CommandInfoSchema]:
        """Return available recovery commands with metadata and costs."""
        p = SpacecraftParams()
        items: list[CommandInfoSchema] = []
        for cmd in COMMANDS.values():
            serialized = serialize_command(cmd, p)
            items.append(CommandInfoSchema(**serialized))
        return items

    def init_simulation(self, scenario_name: str) -> dict[str, Any]:
        """
        Return the deterministic initial state, orbit parameters, and physical limits
        for the requested evaluation scenario.
        """
        if scenario_name not in SCENARIOS:
            raise ValueError(f"Unknown scenario: '{scenario_name}'. Available: {list(SCENARIOS.keys())}")

        scenario = SCENARIOS[scenario_name]
        params = SpacecraftParams()
        problem = scenario.build_problem(params=params)
        initial_st = problem.initial_state
        sim = problem.simulator
        solar_flux = float(sim.orbit.solar_flux(initial_st.time))

        limits = {
            'soc_hard_min': float(params.soc_hard_min),
            'soc_hard_max': float(params.soc_hard_max),
            'soc_nominal_min': float(params.soc_nominal_min),
            'temp_bat_hard_min': float(params.temp_bat_hard_min),
            'temp_bat_hard_max': float(params.temp_bat_hard_max),
            'temp_bat_nominal_min': float(params.temp_bat_nominal_min),
            'temp_bat_nominal_max': float(params.temp_bat_nominal_max),
            'temp_pay_hard_min': float(params.temp_pay_hard_min),
            'temp_pay_hard_max': float(params.temp_pay_hard_max),
            'temp_pay_nominal_min': float(params.temp_pay_nominal_min),
            'temp_pay_nominal_max': float(params.temp_pay_nominal_max),
            'temp_bus_hard_min': float(params.temp_bus_hard_min),
            'temp_bus_hard_max': float(params.temp_bus_hard_max),
            'temp_bus_nominal_min': float(params.temp_bus_nominal_min),
            'temp_bus_nominal_max': float(params.temp_bus_nominal_max),
        }

        return {
            'scenario': scenario_name,
            'fault_name': scenario.fault_name,
            'description': scenario.description,
            'orbit_phase': float(scenario.orbit_phase),
            'solar_flux_w': solar_flux,
            'initial_state': serialize_state(initial_st, params=params),
            'limits': limits,
        }

    def step_simulation(self, req: SimulateStepRequest) -> dict[str, Any]:
        """
        Advance a spacecraft state by one recovery command using the real simulator physics.
        """
        if req.command not in COMMANDS:
            raise ValueError(f"Unknown command: '{req.command}'. Available: {list(COMMANDS.keys())}")

        cmd = COMMANDS[req.command]
        raw_state = req.state

        # Reconstruct SpacecraftState domain object
        st = SpacecraftState(
            time=float(raw_state.time),
            soc=float(raw_state.soc),
            temp_battery=float(raw_state.temp_battery),
            temp_payload=float(raw_state.temp_payload),
            temp_bus=float(raw_state.temp_bus),
            heater_on=bool(raw_state.heater_on),
            payload_on=bool(raw_state.payload_on),
            transmitter_on=bool(raw_state.transmitter_on),
            mode=str(raw_state.mode),
            fault_heat_payload=float(raw_state.fault_heat_payload),
            fault_heat_battery=float(raw_state.fault_heat_battery),
            fault_extra_load=float(raw_state.fault_extra_load),
        )

        # Precondition check
        if not cmd.is_applicable(st):
            raise ValueError(
                f"Command '{req.command}' precondition not satisfied for current state "
                f"(mode={st.mode!r}, payload_on={st.payload_on}, heater_on={st.heater_on}, transmitter_on={st.transmitter_on})."
            )

        params = SpacecraftParams()
        period = OrbitSchedule.ORBITAL_PERIOD
        t0 = -req.orbit_phase * period if req.orbit_phase is not None else 0.0
        orbit = OrbitSchedule(t0=t0)
        sim = Simulator(params, orbit)

        # 1. Apply command effect
        post_cmd = apply_command(st, req.command)
        # 2. Advance physics by dt
        next_state = sim.step(post_cmd)

        cost = float(command_cost(req.command, params))
        is_infeasible = bool(next_state.violates_hard_constraints(params))
        in_nominal = bool(next_state.in_nominal_band(params))
        violations = {k: float(v) for k, v in next_state.parameter_violations(params).items()}
        margin = _sanitize_float(next_state.safety_margin(params))

        return {
            'command': req.command,
            'command_cost': cost,
            'next_state': serialize_state(next_state, params=params),
            'is_infeasible': is_infeasible,
            'in_nominal': in_nominal,
            'safety_margin': margin,
            'parameter_violations': violations,
        }

    def solve_recovery_plan(self, req: PlanRequest) -> dict[str, Any]:
        """
        Execute state-space recovery search for the requested scenario and parameters.
        """
        if req.scenario not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {req.scenario}")

        scenario = SCENARIOS[req.scenario]
        params = SpacecraftParams()
        problem = scenario.build_problem(params=params)

        algorithm = build_algorithm(
            name=req.algorithm,
            variant=req.variant,
            lambda_risk=req.lambda_risk,
            budget_nodes=req.budget_nodes,
            max_depth=req.max_depth,
            w=req.w,
        )

        log.info(
            "Executing %s/%s on %s (lambda=%.1f, budget=%d, seed=%d)",
            req.algorithm, req.variant, req.scenario, req.lambda_risk, req.budget_nodes, req.seed,
        )

        result = algorithm.search(problem, self._scorer, seed=req.seed)
        metrics = compute_metrics(result, problem, scenario=req.scenario, seed=req.seed)

        return serialize_plan_response(
            result=result,
            metrics=metrics,
            scenario_name=req.scenario,
            params=params,
            scorer=self._scorer,
            budget_nodes=req.budget_nodes,
        )

    def benchmark_compare(self, req: BenchmarkCompareRequest) -> dict[str, Any]:
        """
        Execute multiple real algorithms head-to-head on the selected scenario.
        """
        if req.scenario not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {req.scenario}")

        scenario = SCENARIOS[req.scenario]
        params = SpacecraftParams()

        # Deduplicate preserving order
        unique_algos: list[str] = []
        for a in req.algorithms:
            if a not in unique_algos:
                unique_algos.append(a)

        unique_vars: list[str] = []
        for v in req.variants:
            if v not in unique_vars:
                unique_vars.append(v)

        # Plan execution matrix
        runs_plan: list[tuple[str, Optional[str]]] = []
        for algo in unique_algos:
            if algo in ('hill_climbing', 'simulated_annealing'):
                # Heuristic variants do not apply to sequence-space local search
                runs_plan.append((algo, None))
            else:
                for var in unique_vars:
                    runs_plan.append((algo, var))

        if len(runs_plan) > 15:
            raise ValueError(
                f"Benchmark combination count ({len(runs_plan)}) exceeds limit of 15. "
                "Please select fewer algorithms or variants."
            )

        runs_results: list[dict[str, Any]] = []

        for algo_name, var_name in runs_plan:
            try:
                problem = scenario.build_problem(params=params)
                algorithm = build_algorithm(
                    name=algo_name,
                    variant=var_name or 'H2',
                    lambda_risk=req.lambda_risk,
                    budget_nodes=req.budget_nodes,
                    max_depth=req.max_depth,
                    w=req.w,
                )
                result = algorithm.search(problem, self._scorer, seed=req.seed)
                metrics = compute_metrics(result, problem, scenario=req.scenario, seed=req.seed)

                termination = "goal_reached" if result.success else (
                    "budget_exhausted" if result.stats.nodes_expanded >= req.budget_nodes else "unsolved"
                )

                runs_results.append({
                    'algorithm': algo_name,
                    'variant': var_name,
                    'success': bool(result.success),
                    'nodes_expanded': int(result.stats.nodes_expanded),
                    'safety_margin': _sanitize_float(metrics.safety_margin),
                    'wall_time_s': float(result.stats.wall_time_s),
                    'solution_cost': _sanitize_float(result.solution_g),
                    'path_length': int(result.solution_depth),
                    'nodes_generated': int(result.stats.nodes_generated),
                    'scorer_calls': int(result.stats.scorer_calls),
                    'peak_memory_nodes': int(result.stats.peak_memory_nodes),
                    'termination_reason': termination,
                    'error': None,
                })
            except Exception as exc:
                log.error("Benchmark run failed for %s/%s: %s", algo_name, var_name, exc)
                runs_results.append({
                    'algorithm': algo_name,
                    'variant': var_name,
                    'success': False,
                    'nodes_expanded': 0,
                    'safety_margin': None,
                    'wall_time_s': 0.0,
                    'solution_cost': None,
                    'path_length': 0,
                    'nodes_generated': 0,
                    'scorer_calls': 0,
                    'peak_memory_nodes': 0,
                    'termination_reason': "error",
                    'error': str(exc),
                })

        return {
            'scenario': req.scenario,
            'lambda_risk': float(req.lambda_risk),
            'budget_nodes': int(req.budget_nodes),
            'max_depth': int(req.max_depth),
            'total_runs': len(runs_results),
            'runs': runs_results,
        }

    def get_telemetry_sample(
        self,
        window_index: Optional[int] = None,
        n_windows: int = 1,
        seed: Optional[int] = None,
    ) -> dict[str, Any]:
        """
        Return sample windows drawn from the offline nominal training dataset.
        """
        windows_arr, meta_arr = self._get_nominal_dataset()
        total_windows = int(windows_arr.shape[0])

        if window_index is None:
            rng = np.random.default_rng(seed if seed is not None else 0)
            window_index = int(rng.integers(0, total_windows - n_windows + 1))

        if window_index < 0 or window_index + n_windows > total_windows:
            raise ValueError(
                f"window_index {window_index} + n_windows {n_windows} out of bounds "
                f"for dataset of {total_windows} windows."
            )

        extracted_windows: list[dict[str, Any]] = []

        for offset in range(n_windows):
            curr_idx = window_index + offset
            raw_win = windows_arr[curr_idx]  # shape (10, 8)

            # Reconstruct states for scoring
            state_list: list[SpacecraftState] = []
            for t_step in range(10):
                row = raw_win[t_step]
                mode_map = {0.0: 'nominal', 1.0: 'low_power', 2.0: 'safe_mode'}
                m = mode_map.get(round(float(row[7])), 'nominal')
                state_list.append(SpacecraftState(
                    time=float(t_step * 60.0),
                    soc=float(row[0]),
                    temp_battery=float(row[1]),
                    temp_payload=float(row[2]),
                    temp_bus=float(row[3]),
                    heater_on=bool(round(float(row[4]))),
                    payload_on=bool(round(float(row[5]))),
                    transmitter_on=bool(round(float(row[6]))),
                    mode=m,
                ))

            # Calibrated anomaly score
            anomaly_score: Optional[float] = None
            if self._scorer is not None:
                try:
                    anomaly_score = _sanitize_float(self._scorer.score_single(state_list))
                except Exception:
                    anomaly_score = None

            # Optional metadata
            meta_dict: Optional[dict[str, float]] = None
            if meta_arr is not None and curr_idx < len(meta_arr):
                meta_row = meta_arr[curr_idx]
                meta_dict = {
                    'orbit_phase': float(meta_row[0]),
                    'initial_soc': float(meta_row[1]),
                    'initial_temp_payload': float(meta_row[2]),
                }

            # Points
            points: list[dict[str, Any]] = []
            for t_step in range(10):
                row = raw_win[t_step]
                points.append({
                    'step_index': t_step,
                    'time_offset_s': float(t_step * 60.0),
                    'values': {
                        'soc': float(row[0]),
                        'temp_battery': float(row[1]),
                        'temp_payload': float(row[2]),
                        'temp_bus': float(row[3]),
                        'heater_on': float(row[4]),
                        'payload_on': float(row[5]),
                        'transmitter_on': float(row[6]),
                        'mode_code': float(row[7]),
                    },
                })

            extracted_windows.append({
                'window_index': curr_idx,
                'anomaly_score': anomaly_score,
                'meta': meta_dict,
                'points': points,
            })

        return {
            'dataset_total_windows': total_windows,
            'window_length_steps': 10,
            'step_duration_s': 60.0,
            'channels': TELEMETRY_CHANNELS,
            'windows': extracted_windows,
            'disclaimer': "Offline nominal training dataset sample. Not live spacecraft telemetry.",
        }

    def get_experiment_history(
        self,
        scenario: Optional[str] = None,
        algorithm: Optional[str] = None,
        variant: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """
        Read historical experiment records from experiments/results/results.csv in read-only mode.
        """
        if not RESULTS_CSV_PATH.exists():
            return {'total_records': 0, 'limit': limit, 'offset': offset, 'records': []}

        records: list[dict[str, Any]] = []

        with open(RESULTS_CSV_PATH, mode='r', encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Apply filters
                if scenario and row.get('scenario') != scenario:
                    continue
                if algorithm and row.get('algorithm') != algorithm:
                    continue
                if variant and row.get('heuristic_variant') != variant:
                    continue

                try:
                    records.append({
                        'scenario': str(row.get('scenario', '')),
                        'algorithm': str(row.get('algorithm', '')),
                        'heuristic_variant': str(row.get('heuristic_variant', '')),
                        'lambda_risk': float(row.get('lambda_risk', 0.0)),
                        'seed': int(row.get('seed', 0)),
                        'success': bool(int(row.get('success', 0))),
                        'time_to_stable_s': _sanitize_float(row.get('time_to_stable_s')),
                        'safety_margin': _sanitize_float(row.get('safety_margin')),
                        'solution_cost': _sanitize_float(row.get('solution_cost')),
                        'path_length': int(row.get('path_length', 0)),
                        'nodes_expanded': int(row.get('nodes_expanded', 0)),
                        'nodes_generated': int(row.get('nodes_generated', 0)),
                        'scorer_calls': int(row.get('scorer_calls', 0)),
                        'peak_memory_nodes': int(row.get('peak_memory_nodes', 0)),
                        'wall_time_s': float(row.get('wall_time_s', 0.0)),
                    })
                except (ValueError, TypeError):
                    continue

        total_records = len(records)
        sliced_records = records[offset: offset + limit]

        return {
            'total_records': total_records,
            'limit': limit,
            'offset': offset,
            'records': sliced_records,
        }


# Global singleton instance
service = ResearchEngineService()
