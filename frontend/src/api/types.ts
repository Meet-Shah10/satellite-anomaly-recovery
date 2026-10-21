/**
 * TypeScript API interfaces matching FastAPI Pydantic schemas.
 */

export type OperationalStatus = 'ok' | 'degraded' | 'error';

export interface HealthResponse {
  status: OperationalStatus;
  python_version: string;
  app_version: string;
  app_name: string;
  scorer_loaded: boolean;
  assets: {
    scorer_model: boolean;
    nominal_dataset: boolean;
    experiment_results: boolean;
  };
  known_issues: string[];
}

export type ScenarioName =
  | 'single_thermal'
  | 'single_power'
  | 'single_load'
  | 'cascade'
  | 'single_thermal_sun'
  | 'single_power_sun';

export type AlgorithmName =
  | 'astar'
  | 'idastar'
  | 'rbfs'
  | 'hill_climbing'
  | 'simulated_annealing';

export type HeuristicVariant = 'H0' | 'H1' | 'H2' | 'H3' | 'H4';

export interface ScenarioInfo {
  name: ScenarioName | string;
  fault_name: string;
  description: string;
  orbit_phase: number;
}

export interface CommandInfo {
  name: string;
  latency_s: number;
  energy_j: number;
  nominal_cost: number;
}

export interface SpacecraftState {
  time: number;
  soc: number;
  temp_battery: number;
  temp_payload: number;
  temp_bus: number;
  heater_on: boolean;
  payload_on: boolean;
  transmitter_on: boolean;
  mode: 'nominal' | 'low_power' | 'safe_mode' | string;
  fault_heat_payload: number;
  fault_heat_battery: number;
  fault_extra_load: number;
  safety_margin?: number | null;
  in_nominal_band?: boolean | null;
  violates_hard_constraints?: boolean | null;
  parameter_violations?: Record<string, number> | null;
}

export interface PathStep {
  step: number;
  action: string | null;
  state: SpacecraftState;
  step_cost?: number | null;
  accumulated_cost: number;
  risk_score?: number | null;
}

export interface SearchStats {
  nodes_expanded: number;
  nodes_generated: number;
  scorer_calls: number;
  peak_memory_nodes: number;
  wall_time_s: number;
}

export interface MetricsRecord {
  scenario: string;
  algorithm: string;
  heuristic_variant: string;
  lambda_risk: number;
  seed: number;
  success: boolean;
  time_to_stable_s: number | null;
  safety_margin: number | null;
  solution_cost: number | null;
  path_length: number;
  nodes_expanded: number;
  nodes_generated: number;
  scorer_calls: number;
  peak_memory_nodes: number;
  wall_time_s: number;
}

export interface PlanRequest {
  scenario: ScenarioName;
  algorithm: AlgorithmName;
  variant: HeuristicVariant;
  lambda_risk?: number;
  budget_nodes?: number;
  max_depth?: number;
  w?: number;
  seed?: number;
}

export interface PlanResponse {
  scenario: string;
  algorithm: string;
  variant: string;
  lambda_risk: number;
  success: boolean;
  solution_cost: number | null;
  solution_depth: number;
  termination_reason: string;
  stats: SearchStats;
  metrics: MetricsRecord;
  path: PathStep[];
}

export interface SimulateStepRequest {
  state: SpacecraftState;
  command: string;
  orbit_phase?: number;
}

export interface SimulateStepResponse {
  command: string;
  command_cost: number;
  next_state: SpacecraftState;
  is_infeasible: boolean;
  in_nominal: boolean;
  safety_margin: number | null;
  parameter_violations: Record<string, number> | null;
}

export interface SpacecraftLimits {
  soc_hard_min: number;
  soc_hard_max: number;
  soc_nominal_min: number;
  temp_bat_hard_min: number;
  temp_bat_hard_max: number;
  temp_bat_nominal_min: number;
  temp_bat_nominal_max: number;
  temp_pay_hard_min: number;
  temp_pay_hard_max: number;
  temp_pay_nominal_min: number;
  temp_pay_nominal_max: number;
  temp_bus_hard_min: number;
  temp_bus_hard_max: number;
  temp_bus_nominal_min: number;
  temp_bus_nominal_max: number;
}

export interface SimulateInitResponse {
  scenario: string;
  fault_name: string;
  description: string;
  orbit_phase: number;
  solar_flux_w: number;
  initial_state: SpacecraftState;
  limits: SpacecraftLimits;
}

export interface BenchmarkRunResult {
  algorithm: string;
  variant: string | null;
  success: boolean;
  nodes_expanded: number;
  safety_margin: number | null;
  wall_time_s: number;
  solution_cost: number | null;
  path_length: number;
  nodes_generated: number | null;
  scorer_calls: number | null;
  peak_memory_nodes: number | null;
  termination_reason: string;
  error: string | null;
}

export interface BenchmarkCompareRequest {
  scenario: ScenarioName;
  algorithms: AlgorithmName[];
  variants: HeuristicVariant[];
  lambda_risk?: number;
  budget_nodes?: number;
  max_depth?: number;
  seed?: number;
  w?: number;
}

export interface BenchmarkCompareResponse {
  scenario: string;
  lambda_risk: number;
  budget_nodes: number;
  max_depth: number;
  total_runs: number;
  runs: BenchmarkRunResult[];
}

export interface TelemetryChannel {
  name: string;
  index: number;
  display_name: string;
  unit: string;
  description: string;
}

export interface TelemetryDataPoint {
  step_index: number;
  time_offset_s: number;
  values: Record<string, number>;
}

export interface TelemetryWindow {
  window_index: number;
  anomaly_score: number | null;
  meta: Record<string, number> | null;
  points: TelemetryDataPoint[];
}

export interface TelemetrySampleResponse {
  dataset_total_windows: number;
  window_length_steps: number;
  step_duration_s: number;
  channels: TelemetryChannel[];
  windows: TelemetryWindow[];
  disclaimer: string;
}

export interface ExperimentHistoryResponse {
  total_records: number;
  limit: number;
  offset: number;
  records: MetricsRecord[];
}
