"""
Pydantic schemas for the Satellite Anomaly Recovery API.

Enforces strict input validation for scenario names, algorithm selections,
heuristic variants, parameter boundaries, and resource budgets.
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


ScenarioName = Literal[
    'single_thermal',
    'single_power',
    'single_load',
    'cascade',
    'single_thermal_sun',
    'single_power_sun',
]

AlgorithmName = Literal[
    'astar',
    'idastar',
    'rbfs',
    'hill_climbing',
    'simulated_annealing',
]

HeuristicVariant = Literal[
    'H0',
    'H1',
    'H2',
    'H3',
    'H4',
]


# ---------------------------------------------------------------------------
# Health & Status Schemas
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    """System health check and asset availability report."""
    status: Literal['ok', 'degraded', 'error']
    python_version: str
    app_version: str
    app_name: str
    scorer_loaded: bool
    assets: dict[str, bool]
    known_issues: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra='forbid')


# ---------------------------------------------------------------------------
# Spacecraft Telemetry & State Schemas
# ---------------------------------------------------------------------------

class SpacecraftStateSchema(BaseModel):
    """Serialized representation of a SpacecraftState snapshot."""
    time: float = Field(..., description="Simulation time in seconds from mission epoch")
    soc: float = Field(..., ge=0.0, le=1.0, description="Battery State of Charge [0.0, 1.0]")
    temp_battery: float = Field(..., description="Battery temperature in °C")
    temp_payload: float = Field(..., description="Payload assembly temperature in °C")
    temp_bus: float = Field(..., description="Power & electronics bus temperature in °C")
    heater_on: bool
    payload_on: bool
    transmitter_on: bool
    mode: str = Field(..., description="'nominal' | 'low_power' | 'safe_mode'")
    fault_heat_payload: float = Field(0.0, description="Extra heat on payload node (W)")
    fault_heat_battery: float = Field(0.0, description="Extra heat on battery node (W)")
    fault_extra_load: float = Field(0.0, description="Extra bus electrical load (W)")
    safety_margin: Optional[float] = Field(None, description="Normalised clearance to closest hard limit")
    in_nominal_band: Optional[bool] = Field(None, description="True if all parameters are within nominal bounds")
    violates_hard_constraints: Optional[bool] = Field(None, description="True if any hard limit is breached")
    parameter_violations: Optional[dict[str, float]] = Field(None, description="Out-of-band parameter offsets")


class SimulateStepRequest(BaseModel):
    """Request to advance spacecraft physics by one command."""
    state: SpacecraftStateSchema
    command: str = Field(..., description="Recovery command to execute")
    orbit_phase: Optional[float] = Field(None, ge=0.0, le=1.0, description="Optional orbit phase alignment")

    model_config = ConfigDict(extra='forbid')


class SimulateStepResponse(BaseModel):
    """Result of advancing spacecraft state by one command."""
    command: str
    command_cost: float
    next_state: SpacecraftStateSchema
    is_infeasible: bool
    in_nominal: bool
    safety_margin: Optional[float] = None
    parameter_violations: Optional[dict[str, float]] = None


class SpacecraftLimitsSchema(BaseModel):
    """Documented nominal and hard physical limits from SpacecraftParams."""
    soc_hard_min: float
    soc_hard_max: float
    soc_nominal_min: float
    temp_bat_hard_min: float
    temp_bat_hard_max: float
    temp_bat_nominal_min: float
    temp_bat_nominal_max: float
    temp_pay_hard_min: float
    temp_pay_hard_max: float
    temp_pay_nominal_min: float
    temp_pay_nominal_max: float
    temp_bus_hard_min: float
    temp_bus_hard_max: float
    temp_bus_nominal_min: float
    temp_bus_nominal_max: float


class SimulateInitResponse(BaseModel):
    """Deterministic initial state and scenario parameters for simulation."""
    scenario: str
    fault_name: str
    description: str
    orbit_phase: float
    solar_flux_w: float
    initial_state: SpacecraftStateSchema
    limits: SpacecraftLimitsSchema


# ---------------------------------------------------------------------------
# Planning Schemas
# ---------------------------------------------------------------------------

class PathStepSchema(BaseModel):
    """One step along a recovery trajectory."""
    step: int
    action: Optional[str] = Field(None, description="Command that produced this state (None for root)")
    state: SpacecraftStateSchema
    step_cost: Optional[float] = Field(None, description="Action cost of the command applied at this step")
    accumulated_cost: float = Field(0.0, description="Cumulative path cost up to this state")
    risk_score: Optional[float] = Field(None, description="Calibrated anomaly score R(n) in [0, 1] for this trajectory window")


class SearchStatsSchema(BaseModel):
    """Resource consumption and performance metrics of a search run."""
    nodes_expanded: int = Field(..., ge=0)
    nodes_generated: int = Field(..., ge=0)
    scorer_calls: int = Field(..., ge=0)
    peak_memory_nodes: int = Field(..., ge=0)
    wall_time_s: float = Field(..., ge=0.0)


class MetricsSchema(BaseModel):
    """Comprehensive evaluation metrics for one recovery trajectory."""
    scenario: str
    algorithm: str
    heuristic_variant: str
    lambda_risk: float
    seed: int
    success: bool
    time_to_stable_s: Optional[float] = None
    safety_margin: Optional[float] = None
    solution_cost: Optional[float] = None
    path_length: int
    nodes_expanded: int
    nodes_generated: int
    scorer_calls: int
    peak_memory_nodes: int
    wall_time_s: float


class PlanRequest(BaseModel):
    """Input parameters for triggering a search-based recovery plan."""
    scenario: ScenarioName = Field(
        'single_thermal',
        description="Named evaluation scenario to solve",
    )
    algorithm: AlgorithmName = Field(
        'astar',
        description="Search algorithm to execute",
    )
    variant: HeuristicVariant = Field(
        'H2',
        description="Heuristic variant (H0: UCS, H1: Static A*, H2: Dynamic A*, H3: Augmented g, H4: Weighted A*)",
    )
    lambda_risk: float = Field(
        50.0,
        ge=0.0,
        le=10_000.0,
        description="Risk weight λ converting anomaly score to cost units",
    )
    budget_nodes: int = Field(
        5_000,
        ge=1,
        le=50_000,
        description="Maximum node expansions or evaluations",
    )
    max_depth: int = Field(
        20,
        ge=1,
        le=100,
        description="Maximum search depth / command sequence length",
    )
    w: float = Field(
        1.5,
        ge=1.0,
        le=10.0,
        description="Suboptimality bound for Weighted A* (variant H4)",
    )
    seed: int = Field(
        0,
        ge=0,
        description="Random seed for tie-breaking and stochastic local search",
    )

    model_config = ConfigDict(extra='forbid')


class PlanResponse(BaseModel):
    """Complete output of a recovery planning search invocation."""
    scenario: str
    algorithm: str
    variant: str
    lambda_risk: float
    success: bool
    solution_cost: Optional[float] = None
    solution_depth: int
    termination_reason: str = Field('goal_reached', description="Termination reason: goal_reached, budget_exhausted, infeasible")
    stats: SearchStatsSchema
    metrics: MetricsSchema
    path: list[PathStepSchema]


# ---------------------------------------------------------------------------
# Benchmarking Schemas
# ---------------------------------------------------------------------------

class BenchmarkRunResultSchema(BaseModel):
    """Single algorithm evaluation outcome within a comparative benchmark."""
    algorithm: str
    variant: Optional[str] = None
    success: bool
    nodes_expanded: int
    safety_margin: Optional[float] = None
    wall_time_s: float
    solution_cost: Optional[float] = None
    path_length: int
    nodes_generated: Optional[int] = None
    scorer_calls: Optional[int] = None
    peak_memory_nodes: Optional[int] = None
    termination_reason: str
    error: Optional[str] = None


class BenchmarkCompareRequest(BaseModel):
    """Request to benchmark multiple algorithms head-to-head on a common scenario."""
    scenario: ScenarioName = Field('single_thermal', description="Scenario to benchmark")
    algorithms: list[AlgorithmName] = Field(
        default=['astar'],
        min_length=1,
        max_length=5,
        description="List of algorithms to benchmark",
    )
    variants: list[HeuristicVariant] = Field(
        default=['H2'],
        min_length=1,
        max_length=5,
        description="List of heuristic variants (for A*, IDA*, RBFS)",
    )
    lambda_risk: float = Field(50.0, ge=0.0, le=10_000.0)
    budget_nodes: int = Field(1_000, ge=1, le=10_000, description="Node budget per run")
    max_depth: int = Field(15, ge=1, le=50)
    seed: int = Field(0, ge=0)
    w: float = Field(1.5, ge=1.0, le=10.0)

    model_config = ConfigDict(extra='forbid')


class BenchmarkCompareResponse(BaseModel):
    """Comparative benchmarking results for multiple algorithms."""
    scenario: str
    lambda_risk: float
    budget_nodes: int
    max_depth: int
    total_runs: int
    runs: list[BenchmarkRunResultSchema]


# ---------------------------------------------------------------------------
# Telemetry Sample Schemas
# ---------------------------------------------------------------------------

class TelemetryChannelSchema(BaseModel):
    """Metadata for one spacecraft telemetry channel."""
    name: str
    index: int
    display_name: str
    unit: str
    description: str


class TelemetryDataPointSchema(BaseModel):
    """One discrete time step measurement across all 8 telemetry channels."""
    step_index: int
    time_offset_s: float
    values: dict[str, float]


class TelemetryWindowSchema(BaseModel):
    """A 10-step trajectory window from the nominal training dataset."""
    window_index: int
    anomaly_score: Optional[float] = None
    meta: Optional[dict[str, float]] = None
    points: list[TelemetryDataPointSchema]


class TelemetrySampleResponse(BaseModel):
    """Sample windows drawn from the offline nominal training dataset."""
    dataset_total_windows: int
    window_length_steps: int
    step_duration_s: float
    channels: list[TelemetryChannelSchema]
    windows: list[TelemetryWindowSchema]
    disclaimer: str = Field(
        "Offline nominal training dataset sample. Not live spacecraft telemetry.",
        description="Clarification on data source",
    )


# ---------------------------------------------------------------------------
# Experiment History Schemas
# ---------------------------------------------------------------------------

class ExperimentHistoryResponse(BaseModel):
    """Historical experiment execution records read from experiments/results/results.csv."""
    total_records: int
    limit: int
    offset: int
    records: list[MetricsSchema]


# ---------------------------------------------------------------------------
# Metadata Schemas
# ---------------------------------------------------------------------------

class ScenarioInfoSchema(BaseModel):
    """Metadata describing an evaluation scenario."""
    name: str
    fault_name: str
    description: str
    orbit_phase: float


class CommandInfoSchema(BaseModel):
    """Metadata describing an available recovery command."""
    name: str
    latency_s: float
    energy_j: float
    nominal_cost: float
