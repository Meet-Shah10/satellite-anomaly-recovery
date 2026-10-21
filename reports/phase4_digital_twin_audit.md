# Phase 4 Audit Report — Spacecraft Digital Twin

**Project:** Risk-Aware Dynamic A* for Satellite Anomaly Recovery  
**Date:** 2026-10-22  
**Auditor:** Senior Aerospace Systems & Frontend Software Architect  

---

## 1. Inspection Findings & Codebase Analysis

### 1.1 Existing Simulator Architecture (`satellite_recovery/simulator/`)
- **Three-Node Lumped Thermal Network (`spacecraft.py`):**
  - **Node 1: Battery (`temp_battery`)**:
    - Heat capacity: $C_{\text{bat}} = 500.0\text{ J/°C}$.
    - Radiative conductance to space sink: $UA_{\text{bat-space}} = 0.50\text{ W/°C}$.
    - Conductive coupling to bus node: $UA_{\text{bat-bus}} = 0.10\text{ W/°C}$.
    - Heat sources: Ohmic losses from charge/discharge $Q_{\text{bat-diss}} = |P_{\text{net}}| \cdot (1 - \eta)$ plus persistent fault heat $Q_{\text{fault-bat}}$.
  - **Node 2: Payload (`temp_payload`)**:
    - Heat capacity: $C_{\text{pay}} = 1000.0\text{ J/°C}$.
    - Radiative conductance to space sink: $UA_{\text{pay-space}} = 0.30\text{ W/°C}$.
    - Conductive coupling to bus node: $UA_{\text{pay-bus}} = 0.20\text{ W/°C}$.
    - Heat sources: Internal electronics dissipation $P_{\text{pay}} \cdot f_{\text{heat}} = 40\text{ W} \times 0.35 = 14\text{ W}$ (when `payload_on`), heater injection ($15\text{ W}$ when `heater_on`), plus persistent fault heat $Q_{\text{fault-pay}}$.
  - **Node 3: Electronics Bus (`temp_bus`)**:
    - Heat capacity: $C_{\text{bus}} = 800.0\text{ J/°C}$.
    - Radiative conductance to space sink: $UA_{\text{bus-space}} = 0.80\text{ W/°C}$.
    - Conductive coupling to battery ($0.10\text{ W/°C}$) and payload ($0.20\text{ W/°C}$).
    - Heat sources: Joule heating fraction of total bus load $P_{\text{load}} \cdot f_{\text{bus-heat}} = P_{\text{load}} \times 0.12$.
  - **Deep Space Sink Temperature**: $T_{\text{space-sink}} = -90.0^\circ\text{C}$.

- **Power Subsystem:**
  - Battery capacity: $180,000\text{ J}$ ($50\text{ Wh}$).
  - Charging efficiency: $\eta_{\text{chg}} = 0.95$; Discharging efficiency: $\eta_{\text{dis}} = 0.97$.
  - Subsystem loads: Avionics $30\text{ W}$ ($18\text{ W}$ in low_power/safe_mode), Payload $40\text{ W}$, Heater $15\text{ W}$, Transmitter $20\text{ W}$, plus `fault_extra_load`.
  - Solar generation: Evaluated by `OrbitSchedule.solar_flux(time)` using orbital period ($5,400\text{ s}$, LEO $550\text{ km}$ circular orbit) with raised-cosine ingress/egress peaking at $280\text{ W}$.

- **Discretization & Timestep:**
  - $\Delta t = 60\text{ s}$ per simulator step. First-order Euler integration.

- **Constraint Boundaries (`SpacecraftParams`):**
  - **Hard Limits (Infeasibility):**
    - State of Charge: $[0.15, 1.00]$
    - Battery Temperature: $[-15.0^\circ\text{C}, 50.0^\circ\text{C}]$
    - Payload Temperature: $[-25.0^\circ\text{C}, 70.0^\circ\text{C}]$
    - Bus Temperature: $[-20.0^\circ\text{C}, 60.0^\circ\text{C}]$
  - **Nominal Operating Bands (Goal Condition):**
    - State of Charge: $\ge 0.35$
    - Battery Temperature: $[-5.0^\circ\text{C}, 40.0^\circ\text{C}]$
    - Payload Temperature: $[-15.0^\circ\text{C}, 55.0^\circ\text{C}]$
    - Bus Temperature: $[-10.0^\circ\text{C}, 50.0^\circ\text{C}]$

- **Safety Margin Formulation:**
  - Normalized clearance to nearest hard limit:
    $$\text{margin}(x) = \min_{v \in \{\text{SoC}, T_{\text{bat}}, T_{\text{pay}}, T_{\text{bus}}\}} \left( \frac{v - v_{\min}^{\text{hard}}}{v_{\max}^{\text{hard}} - v_{\min}^{\text{hard}}}, \frac{v_{\max}^{\text{hard}} - v}{v_{\max}^{\text{hard}} - v_{\min}^{\text{hard}}} \right)$$
  - $\text{margin} > 0$: Physically safe / feasible.
  - $\text{margin} \le 0$: Hard constraint violation (infeasible / catastrophic failure).

---

## 2. Recovery Commands Registry (`commands.py`)

Eight discrete commands with strict preconditions, execution latencies, energy draws, and scalar costs $g(a) = \alpha \tau(a) + \beta \varepsilon(a)$ ($\alpha = 1.0, \beta = 0.01$):

| Command Name | Precondition | State Effect | Latency $\tau$ | Energy $\varepsilon$ | Cost $g(a)$ |
|---|---|---|---|---|---|
| `payload_off` | `s.payload_on == True` | `payload_on = False` | $5.0\text{ s}$ | $10.0\text{ J}$ | $5.10$ |
| `payload_on` | `s.payload_on == False and s.mode != 'safe_mode'` | `payload_on = True` | $30.0\text{ s}$ | $50.0\text{ J}$ | $30.50$ |
| `heater_on` | `s.heater_on == False` | `heater_on = True` | $2.0\text{ s}$ | $5.0\text{ J}$ | $2.05$ |
| `heater_off` | `s.heater_on == True` | `heater_off = False` | $2.0\text{ s}$ | $5.0\text{ J}$ | $2.05$ |
| `low_power_mode` | `s.mode == 'nominal'` | `mode = 'low_power'` | $10.0\text{ s}$ | $20.0\text{ J}$ | $10.20$ |
| `resume_nominal` | `s.mode == 'low_power'` | `mode = 'nominal'` | $10.0\text{ s}$ | $20.0\text{ J}$ | $10.20$ |
| `transmitter_off` | `s.transmitter_on == True` | `transmitter_on = False` | $3.0\text{ s}$ | $5.0\text{ J}$ | $3.05$ |
| `safe_mode` | `s.mode != 'safe_mode'` | `mode = 'safe_mode'`, `payload_on = False`, `transmitter_on = False` | $15.0\text{ s}$ | $30.0\text{ J}$ | $15.30$ |

---

## 3. Scenario Initialization Analysis & Architectural Gap

### Current State
1. `GET /api/scenarios`: Returns list of scenarios with `name`, `fault_name`, `description`, `orbit_phase`.
2. `POST /api/simulate/step`: Advances physics given a complete `SpacecraftState` and a `command`.
3. **Identified Gap**: There is no existing HTTP endpoint to retrieve the deterministic initial state of a chosen scenario. In Python research code, `scenario.build_problem().initial_state` computes this via `inject_fault(nominal_state, fault_profile)`.

### Resolution Required by Specification
Per Section 5 of the prompt:
> *"If an existing initializer is available, reuse it. If the initializer exists internally but has no API route, add a small, typed API endpoint that exposes the actual initialized state without changing the underlying physics or scenario definitions."*

We will add:
- `GET /api/simulate/init/{scenario_name}`
- Input: Valid `scenario_name` (validated against `SCENARIOS`).
- Output: `SimulateInitResponse` returning:
  - `scenario`: Scenario name.
  - `fault_name`: Name of active fault.
  - `description`: Scenario description.
  - `orbit_phase`: Orbit phase $\phi \in [0, 1)$.
  - `solar_flux_w`: Initial solar flux at $t=0$ in Watts.
  - `initial_state`: Full `SpacecraftStateSchema` serialized with all 12 variables plus safety margin, nominal status, and parameter violations.
  - `limits`: Documented nominal and hard threshold values from `SpacecraftParams` for frontend calibration.
- Add integration tests for valid scenario names, invalid scenario names (400 Bad Request), and schema validation in `tests/test_simulation_api.py`.

---

## 4. Frontend Interactive Digital Twin Design Plan

1. **State Management**:
   - `selectedScenario`: Currently selected scenario key (default `single_thermal`).
   - `currentState`: Active `SpacecraftState` returned by the backend.
   - `initialState`: Snapshot of the initial state for the active scenario session.
   - `transitionHistory`: Array of actual state transitions containing `timestamp`, `command`, `state`, `cost`, `safety_margin`, `in_nominal`, `is_infeasible`.
   - `pendingCommand`: Guard against duplicate execution while request is in flight.
   - `commandError`: Human-readable error message if command rejected by backend.
2. **Interactive 3-Node Thermal Schematic (SVG / CSS)**:
   - Battery Node (left), Electronics Bus Node (center), Payload Node (right).
   - Thermal coupling lines with conductance annotations ($UA_{\text{bat-bus}} = 0.10\text{ W/°C}$, $UA_{\text{pay-bus}} = 0.20\text{ W/°C}$).
   - Deep space radiative sink indicators ($T_{\text{sink}} = -90^\circ\text{C}$).
   - Color coded strictly from `SpacecraftParams`: Green (nominal), Amber (out of nominal band), Red (hard limit breach).
3. **Battery & Power Subsystem Panel**:
   - SVG circular / bar gauge for SoC with numerical percentage ($[0, 100\%]$).
   - Digital switch toggles (read-only state reflection) for Payload Power, Transmitter, Heater, Avionics Mode.
   - Real calculated net power balance and instantaneous solar flux.
4. **Command Execution Console**:
   - Selector for 8 real commands with live applicability check based on current state preconditions.
   - Explicit "Execute Command" button (disabled when command precondition is false or request in flight).
   - Display returned `command_cost`, latency $\tau$, energy $\varepsilon$.
5. **Session Transition Timeline & Temperature Chart**:
   - Recharts multi-line chart tracking $T_{\text{battery}}$, $T_{\text{payload}}$, $T_{\text{bus}}$ over simulation time.
   - Strictly plotted from actual simulator responses collected during session (no fabricated or interpolated points).
   - Session Action Log showing step index, command, $g(a)$ cost, resulting mode, and safety margin.
6. **Safety & Constraint Feedback Banner**:
   - Displays exact numerical safety margin ($>0$ safe, $\le 0$ violation).
   - Badges for Nominal Band, Infeasibility, and explicit lists of parameter violations (e.g. `temp_payload: +3.0°C`).
   - Distinct error states for precondition rejection (HTTP 400), physical violation, or server disconnection.
7. **Reset Mechanism**:
   - Calls `GET /api/simulate/init/{scenario_name}` to reinitialize deterministic initial state and clears the session timeline.

---

## 5. Implementation Verification & Test Evidence

### 5.1 Backend Endpoints Added
1. `GET /api/simulate/init`:
   - Query parameter: `scenario` (default `'single_thermal'`).
   - Returns: `SimulateInitResponse` containing deterministic scenario initialization, fault profile metadata, solar flux, full `SpacecraftStateSchema`, and `SpacecraftLimitsSchema`.
2. `GET /api/simulate/init/{scenario_name}`:
   - Path parameter: `scenario_name`.
   - Validates scenario existence against `SCENARIOS` registry; returns HTTP 400 Bad Request on unknown scenario.

### 5.2 Automated Test Execution
- **Python Test Suite**:
  - Command: `$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m pytest -q`
  - Results: **40 passed, 1 warning in 3.19s** (100% pass rate across all 40 unit and integration tests).
  - Integration tests verified:
    - `test_simulate_init_default_scenario`
    - `test_simulate_init_path_parameter`
    - `test_simulate_init_cascade_scenario`
    - `test_simulate_init_unknown_scenario_rejection`
- **Frontend Build**:
  - Command: `cd frontend; npm run build`
  - Result: **Clean production build** (`vite v8.3.5 building client environment for production... built in 355ms`).
- **Frontend Linting**:
  - Command: `npm run lint`
  - Result: **0 warnings, 0 errors** across 32 files with 116 rules.

### 5.3 Scientific Fidelity & Preservation Audit
- `satellite_recovery/`: Untouched (zero diffs).
- `experiments/scorers/isolation_forest.joblib`: Untouched (zero diffs).
- `experiments/data/nominal_windows*.npy`: Untouched (zero diffs).
- `experiments/results/results.csv`: Untouched (zero diffs).

