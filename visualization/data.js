/**
 * data.js — All scenario configurations, fault profiles,
 * recovery solutions, and benchmark results from results.csv
 */

// ── Scenario definitions ─────────────────────────────────────────────────
const SCENARIOS = {
  single_thermal: {
    label: 'Thermal Runaway',
    orbitPhase: 0.10,
    faults: [
      { label: 'fault_heat_payload', val: '+35 W', desc: 'Stuck relay on payload heater' },
      { label: 'fault_heat_battery', val: '+20 W', desc: 'Battery warmth compensation' },
      { label: 'temp_payload_init',  val: '62.0 °C', desc: 'Payload 7°C above 55°C limit' },
    ],
    initialState: {
      soc: 0.75, temp_battery: 15.0, temp_payload: 62.0, temp_bus: 20.0,
      heater_on: false, payload_on: true, transmitter_on: true, mode: 'nominal'
    },
    riskScore: 0.91,
    recovery: [
      { action: 'payload_off',     cost: 5.10,  icon: '🔌', desc: 'Stop payload heat generation' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Allow thermal cooling' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Allow thermal cooling' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Allow thermal cooling' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Allow thermal cooling' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Allow thermal cooling' },
    ],
    metrics: { success: true, cost: 48.95, nodes_expanded: 1019, time_to_stable: 360, safety_margin: 0.084, wall_time: 1.69 }
  },
  single_power: {
    label: 'Battery Degradation',
    orbitPhase: 0.50,
    faults: [
      { label: 'fault_heat_battery', val: '+12 W', desc: 'Ohmic heating from degraded cells' },
      { label: 'fault_extra_load',   val: '+15 W', desc: 'Extra bus load from degraded regulation' },
      { label: 'soc_init',           val: '0.20',  desc: 'SoC 0.15 below 0.35 nominal floor' },
      { label: 'temp_battery_init',  val: '44.0 °C', desc: 'Near 50°C hard limit' },
    ],
    initialState: {
      soc: 0.20, temp_battery: 44.0, temp_payload: 22.0, temp_bus: 20.0,
      heater_on: false, payload_on: true, transmitter_on: true, mode: 'nominal'
    },
    riskScore: 0.87,
    recovery: [
      { action: 'transmitter_off', cost: 3.05,  icon: '📡', desc: 'Shed 20 W transmitter load' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Solar recharging begins' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'SoC climbing toward 0.35' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Continued charge build-up' },
    ],
    metrics: { success: true, cost: 14.30, nodes_expanded: 5, time_to_stable: 300, safety_margin: 0.059, wall_time: 0.015 }
  },
  single_load: {
    label: 'Rogue Bus Load',
    orbitPhase: 0.45,
    faults: [
      { label: 'fault_extra_load',   val: '+30 W', desc: 'Rogue 30 W parasitic consumer' },
      { label: 'fault_heat_battery', val: '+12 W', desc: 'Battery warmth during waits' },
      { label: 'soc_init',           val: '0.20',  desc: 'SoC below 0.35 floor' },
    ],
    initialState: {
      soc: 0.20, temp_battery: 22.0, temp_payload: 22.0, temp_bus: 20.0,
      heater_on: false, payload_on: true, transmitter_on: true, mode: 'nominal'
    },
    riskScore: 0.84,
    recovery: [
      { action: 'safe_mode', cost: 15.30, icon: '🛡️', desc: 'Max load shed (payload+tx+avionics)' },
      { action: 'wait',      cost: 60.00, icon: '⏳', desc: 'Solar recharge' },
      { action: 'wait',      cost: 60.00, icon: '⏳', desc: 'Solar recharge' },
      { action: 'wait',      cost: 60.00, icon: '⏳', desc: 'SoC recovering' },
    ],
    metrics: { success: true, cost: 11.25, nodes_expanded: 4, time_to_stable: 240, safety_margin: 0.059, wall_time: 0.013 }
  },
  cascade: {
    label: 'Cascade Fault',
    orbitPhase: 0.10,
    faults: [
      { label: 'fault_heat_payload', val: '+35 W', desc: 'Thermal runaway on payload' },
      { label: 'fault_extra_load',   val: '+15 W', desc: 'Bus load fault (SoC drop)' },
      { label: 'fault_heat_battery', val: '+20 W', desc: 'Battery warmth during wait steps' },
      { label: 'soc_init',           val: '0.22',  desc: 'SoC below 0.35 floor' },
      { label: 'temp_payload_init',  val: '62.0 °C', desc: 'Payload above 55°C limit' },
    ],
    initialState: {
      soc: 0.22, temp_battery: 15.0, temp_payload: 62.0, temp_bus: 20.0,
      heater_on: false, payload_on: true, transmitter_on: true, mode: 'nominal'
    },
    riskScore: 0.96,
    recovery: [
      { action: 'payload_off',     cost: 5.10,  icon: '🔌', desc: 'Stop thermal runaway source' },
      { action: 'transmitter_off', cost: 3.05,  icon: '📡', desc: 'Shed electrical load for SoC' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Parallel thermal cool + solar charge' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Parallel thermal cool + solar charge' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Parallel thermal cool + solar charge' },
      { action: 'wait',            cost: 60.00, icon: '⏳', desc: 'Parallel thermal cool + solar charge' },
    ],
    metrics: { success: true, cost: 48.95, nodes_expanded: 1254, time_to_stable: 360, safety_margin: 0.082, wall_time: 2.33 }
  }
};

// ── Heuristic variant definitions ────────────────────────────────────────
const VARIANTS = {
  H0: { label: 'H₀ — Uniform Cost Search', lambda: 0, w: 1 },
  H1: { label: 'H₁ — Static A*', lambda: 0, w: 1 },
  H2: { label: 'H₂ — Risk-Aware A* (Proposed)', lambda: 50, w: 1 },
  H3: { label: 'H₃ — Augmented Cost A*', lambda: 50, w: 1 },
  H4: { label: 'H₄ — Weighted A* (w=1.5)', lambda: 50, w: 1.5 },
};

// ── Commands with metadata ────────────────────────────────────────────────
const COMMANDS = {
  payload_off:     { icon: '🔌', latency: 5,  energy: 10,  cost: 5.10,  desc: 'Turn off payload (-40 W thermal)' },
  payload_on:      { icon: '🔋', latency: 30, energy: 50,  cost: 30.50, desc: 'Restore payload power' },
  heater_on:       { icon: '🌡', latency: 2,  energy: 5,   cost: 2.05,  desc: 'Enable payload heater (+15 W)' },
  heater_off:      { icon: '❄️', latency: 2,  energy: 5,   cost: 2.05,  desc: 'Disable payload heater (-15 W)' },
  low_power_mode:  { icon: '💤', latency: 10, energy: 20,  cost: 10.20, desc: 'Throttle avionics 30→18 W' },
  resume_nominal:  { icon: '🔄', latency: 10, energy: 20,  cost: 10.20, desc: 'Restore full avionics' },
  transmitter_off: { icon: '📡', latency: 3,  energy: 5,   cost: 3.05,  desc: 'Shed 20 W transmitter load' },
  safe_mode:       { icon: '🛡️', latency: 15, energy: 30,  cost: 15.30, desc: 'Maximum power save (all off)' },
  wait:            { icon: '⏳', latency: 60, energy: 0,   cost: 60.00, desc: 'Hold configuration, advance physics' },
};

// ── Benchmark results from results.csv ───────────────────────────────────
const RESULTS = [
  // single_thermal
  { scenario:'single_thermal', algorithm:'astar', variant:'H0', success:1, cost:48.95, nodes:1617, time_stable:360, margin:0.084, wall:2.31 },
  { scenario:'single_thermal', algorithm:'astar', variant:'H1', success:1, cost:48.95, nodes:1024, time_stable:360, margin:0.084, wall:1.71 },
  { scenario:'single_thermal', algorithm:'astar', variant:'H2', success:1, cost:48.95, nodes:1019, time_stable:360, margin:0.084, wall:1.69 },
  { scenario:'single_thermal', algorithm:'astar', variant:'H3', success:1, cost:48.95, nodes:993,  time_stable:360, margin:0.084, wall:1.66 },
  { scenario:'single_thermal', algorithm:'astar', variant:'H4', success:1, cost:48.95, nodes:1015, time_stable:360, margin:0.084, wall:1.71 },
  { scenario:'single_thermal', algorithm:'hill_climbing', variant:'local', success:1, cost:98.74, nodes:19465, time_stable:360, margin:0.084, wall:40.78 },
  { scenario:'single_thermal', algorithm:'simulated_annealing', variant:'local', success:0.4, cost:127.99, nodes:2070, time_stable:360, margin:0.084, wall:4.25 },
  // single_power
  { scenario:'single_power', algorithm:'astar', variant:'H0', success:1, cost:14.30, nodes:72,   time_stable:300, margin:0.059, wall:0.18 },
  { scenario:'single_power', algorithm:'astar', variant:'H1', success:1, cost:14.30, nodes:5,    time_stable:300, margin:0.059, wall:0.015 },
  { scenario:'single_power', algorithm:'astar', variant:'H2', success:1, cost:14.30, nodes:5,    time_stable:300, margin:0.059, wall:0.015 },
  { scenario:'single_power', algorithm:'astar', variant:'H3', success:1, cost:14.30, nodes:5,    time_stable:300, margin:0.059, wall:0.015 },
  { scenario:'single_power', algorithm:'astar', variant:'H4', success:1, cost:21.45, nodes:4,    time_stable:240, margin:0.059, wall:0.011 },
  { scenario:'single_power', algorithm:'hill_climbing', variant:'local', success:1, cost:16.74, nodes:19401, time_stable:300, margin:0.059, wall:40.12 },
  { scenario:'single_power', algorithm:'simulated_annealing', variant:'local', success:1, cost:21.03, nodes:2070, time_stable:240, margin:0.059, wall:4.28 },
  // single_load
  { scenario:'single_load', algorithm:'astar', variant:'H0', success:1, cost:11.25, nodes:32,    time_stable:300, margin:0.059, wall:0.083 },
  { scenario:'single_load', algorithm:'astar', variant:'H1', success:1, cost:12.25, nodes:4,     time_stable:240, margin:0.059, wall:0.012 },
  { scenario:'single_load', algorithm:'astar', variant:'H2', success:1, cost:12.25, nodes:4,     time_stable:240, margin:0.059, wall:0.013 },
  { scenario:'single_load', algorithm:'astar', variant:'H3', success:1, cost:12.25, nodes:4,     time_stable:240, margin:0.059, wall:0.013 },
  { scenario:'single_load', algorithm:'astar', variant:'H4', success:1, cost:19.40, nodes:3,     time_stable:180, margin:0.059, wall:0.009 },
  { scenario:'single_load', algorithm:'hill_climbing', variant:'local', success:1, cost:11.65, nodes:19407, time_stable:240, margin:0.059, wall:39.77 },
  { scenario:'single_load', algorithm:'simulated_annealing', variant:'local', success:1, cost:13.98, nodes:2070, time_stable:240, margin:0.059, wall:4.31 },
  // cascade
  { scenario:'cascade', algorithm:'astar', variant:'H0', success:1, cost:48.95, nodes:2709, time_stable:360, margin:0.082, wall:3.83 },
  { scenario:'cascade', algorithm:'astar', variant:'H1', success:1, cost:48.95, nodes:1247, time_stable:360, margin:0.082, wall:2.34 },
  { scenario:'cascade', algorithm:'astar', variant:'H2', success:1, cost:48.95, nodes:1254, time_stable:360, margin:0.082, wall:2.33 },
  { scenario:'cascade', algorithm:'astar', variant:'H3', success:1, cost:48.95, nodes:1249, time_stable:360, margin:0.082, wall:2.33 },
  { scenario:'cascade', algorithm:'astar', variant:'H4', success:1, cost:48.95, nodes:1250, time_stable:360, margin:0.082, wall:2.31 },
  { scenario:'cascade', algorithm:'hill_climbing', variant:'local', success:1, cost:98.78, nodes:19471, time_stable:360, margin:0.082, wall:40.42 },
  { scenario:'cascade', algorithm:'simulated_annealing', variant:'local', success:0.2, cost:73.85, nodes:2070, time_stable:360, margin:0.082, wall:4.20 },
];
