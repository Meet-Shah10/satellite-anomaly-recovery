# Aegis Orbit — Aerospace Mission Control Web Application

## Research Project
**Risk-Aware Dynamic A* for Satellite Anomaly Recovery**

---

## 1. Overview
This is the interactive mission-control research interface for the satellite anomaly recovery project. The web application connects to the local FastAPI research backend running the physical spacecraft simulator, unsupervised Isolation Forest anomaly scorer, and heuristic search solvers.

---

## 2. Technology Stack & Framework Versions
- **Framework**: React 19.3.1 with TypeScript ~6.0.3
- **Bundler & Dev Server**: Vite 8.3.5 with `@tailwindcss/vite`
- **Styling**: Tailwind CSS 4.3.3 (Unified aerospace deep-navy theme with Inter typography)
- **Icons**: Lucide React 1.61.0
- **Routing**: React Router DOM 7.18.4
- **Charts / Time Series**: Recharts 3.10.1
- **Linter**: Oxlint 1.88.0

---

## 3. Implementation Status

| Page Route | Destination Name | Status | Real Endpoints Connected |
|---|---|---|---|
| `/` | **Mission Overview** | **Fully Implemented** | `GET /api/health`, `GET /api/scenarios`, `GET /api/commands`, `GET /api/experiments/history` |
| `/digital-twin` | **Spacecraft Digital Twin** | **Fully Implemented** | `POST /api/simulate/init`, `POST /api/simulate/step`, `GET /api/scenarios`, `GET /api/commands` |
| `/telemetry-lab` | **Telemetry & Anomaly Lab** | **Fully Implemented** | `GET /api/telemetry/sample` (10,100 windows, live scoring) |
| `/settings` | **Settings & Status** | **Fully Implemented** | `GET /api/health`, direct ping latency testing |
| `/planner` | Recovery Path Planner | *Queued (Phase 6 Target)* | Planned: `POST /api/plan/solve`, `GET /api/commands` |
| `/simulation-lab` | Simulation Laboratory | *Queued* | Planned: `POST /api/simulate/step`, `GET /api/commands` |
| `/benchmarking` | Algorithm Benchmarking | *Queued* | Planned: `POST /api/benchmark/compare` |
| `/history` | Experiment History | *Queued* | Planned: `GET /api/experiments/history` |
| `/reports` | Research Reports | *Queued* | Planned: `GET /api/health`, `GET /api/experiments/history` |

---

## 4. Key Interactive Workspaces

### Mission Overview (`/`)
- Evaluator-facing executive problem summary and state-space search formulation.
- Asset verification status for the Isolation Forest model, 10,100-window dataset, and benchmark results.
- Structured disclosure of known research characteristics (e.g., the preserved H3 double-risk formulation).
- Canonical scenario selector with orbital illumination phase ($\phi$) and action registry with latency/energy costs.

### Spacecraft Digital Twin (`/digital-twin`)
- **Three-Node Thermal Schematic**: Lumped-parameter conductive RC model of Battery Pack, Electronics Bus, and Science Payload.
- **Visual Safety Status**: Immediate classification of node temperatures into Nominal, Warning, or Critical limit states.
- **Power Balance Panel**: Real-time evaluation of solar array generation versus active avionics, heater, transmitter, and payload loads.
- **Command Console**: Dispatch valid recovery commands with instant backend feedback on transition cost, state delta, and safety margin.
- **Time-Series Graphs**: Live multi-variable line plots tracking temperature and SoC trajectories.

### Telemetry & Anomaly Lab (`/telemetry-lab`)
- **Real Dataset Access**: Queries 10,100 nominal windows stored in `nominal_windows.npy` via read-only memory mapping.
- **Window Explorer**: Direct index lookup ($0 \le i < 10100$), step navigation, reproducible seed generation, and batch sampling ($1 \le n \le 10$).
- **Multichannel Time Series**: Continuous temperature and battery curves alongside stepped plots for discrete relays (`heater_on`, `payload_on`, `transmitter_on`) and operating mode codes (`mode_code`).
- **Isolation Forest Anomaly Assessment**: Real-time calculation of calibrated empirical CDF percentile ranks ($R(n) \in [0, 1]$) based on 32 rolling statistical features.
- **Sample Comparison View**: Batch distribution bar charts and sample-level aggregations (min, max, mean).

---

## 5. Prerequisites & Setup

### Prerequisites
- **Node.js**: v20+ (Tested on v24.21.0)
- **npm**: v10+ (Tested on 11.19.0)
- **Python**: 3.11+ (virtual environment at `.venv/`)

### Startup Instructions (Two Terminals)

#### Terminal 1: FastAPI Research Backend
From repository root:
```powershell
$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- *Backend URL:* `http://127.0.0.1:8000`
- *Interactive Swagger Docs:* `http://127.0.0.1:8000/docs`

#### Terminal 2: Mission Control Frontend
From `frontend/` directory:
```powershell
cd frontend
npm run dev
```
- *Frontend URL:* `http://localhost:5173/`

---

## 6. Verification & Quality Commands

```powershell
# Run Oxlint linter (0 errors, 0 warnings across 37 files)
npm run lint

# Run TypeScript check & Vite production build
npm run build

# Run backend regression tests (from repository root)
$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m pytest -q
```
