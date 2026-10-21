# Aegis Orbit — Aerospace Mission Control Web Application (Phase 3)

## Research Project
**Risk-Aware Dynamic A* for Satellite Anomaly Recovery**

---

## 1. Overview
This is the mission-control frontend for the aerospace autonomous anomaly recovery research project. The frontend connects to the local FastAPI research backend running the physical spacecraft simulator, unsupervised Isolation Forest anomaly scorer, and state-space search algorithms (A*, Dynamic A*, IDA*, RBFS, Local Search).

---

## 2. Technology Stack & Framework Versions
- **Framework**: React 19.3.1 with TypeScript ~6.0.3
- **Bundler & Dev Server**: Vite 8.3.5 with `@tailwindcss/vite`
- **Styling**: Tailwind CSS 4.3.3 (Aerospace deep navy/charcoal mission-control theme)
- **Icons**: Lucide React 1.61.0
- **Routing**: React Router DOM 7.18.4
- **Charts / Time Series**: Recharts 3.10.1
- **Linter**: Oxlint 1.88.0

---

## 3. Implementation Status (Phase 3 Foundation)

| Page Route | Destination Name | Status | Real Endpoints Connected |
|---|---|---|---|
| `/` | **Mission Overview** | **Fully Implemented** | `GET /api/health`, `GET /api/scenarios`, `GET /api/commands`, `GET /api/experiments/history` |
| `/digital-twin` | Spacecraft Digital Twin | *Phase 4 Placeholder* | Planned: `POST /api/simulate/step`, `GET /api/telemetry/sample` |
| `/telemetry-lab` | Telemetry & Anomaly Lab | *Phase 4 Placeholder* | Planned: `GET /api/telemetry/sample`, `GET /api/health` |
| `/planner` | Recovery Path Planner | *Phase 4 Placeholder* | Planned: `POST /api/plan/solve`, `GET /api/commands` |
| `/simulation-lab` | Simulation Laboratory | *Phase 4 Placeholder* | Planned: `POST /api/simulate/step`, `GET /api/commands` |
| `/benchmarking` | Algorithm Benchmarking | *Phase 4 Placeholder* | Planned: `POST /api/benchmark/compare` |
| `/history` | Experiment History | *Phase 4 Placeholder* | Planned: `GET /api/experiments/history` |
| `/reports` | Research Reports | *Phase 4 Placeholder* | Planned: `GET /api/health`, `GET /api/experiments/history` |
| `/settings` | Settings & Status | **Fully Implemented** | `GET /api/health`, direct ping latency testing |

---

## 4. Prerequisites
- **Node.js**: v20+ (Tested on v24.21.0)
- **npm**: v10+ (Tested on 11.19.0)
- **Python**: 3.11+ (virtual environment at `.venv/`)

---

## 5. Startup Instructions (Two Terminals)

### Terminal 1: FastAPI Research Backend
Run from the repository root:
```powershell
$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
*Backend URL:* `http://127.0.0.1:8000`  
*Swagger Documentation:* `http://127.0.0.1:8000/docs`

### Terminal 2: Mission Control Frontend
Run from the `frontend/` directory:
```powershell
cd frontend
npm run dev
```
*Frontend URL:* `http://localhost:5173/`

---

## 6. API Connection Architecture & Proxy
In development, the Vite development server proxies all `/api/*` traffic to the FastAPI server:
```typescript
// vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
  },
}
```
If deploying or targeting a custom backend host, set `VITE_API_BASE_URL` in `.env`:
```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```
When undefined, the API client defaults to relative `/api` paths routed through the Vite proxy.

---

## 7. Verification & Build Commands
- **Lint Check**:
  ```powershell
  npm run lint
  ```
- **TypeScript & Production Build**:
  ```powershell
  npm run build
  ```
- **Backend Test Suite (from root)**:
  ```powershell
  $env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m pytest -q
  ```

---

## 8. Scientific Rigor & Data Integrity Guarantees
1. **No Fabricated Telemetry**: Values shown in the mission control interface reflect deterministic discrete-time physics simulator computations or verified benchmark records from `experiments/results/results.csv`.
2. **Nominal Dataset**: Offline baseline dataset shape is strictly `(10100, 10, 8)` (10,100 windows), not 20,200.
3. **Preserved Research Formulation**: Heuristic variant H3 double-risk formulation is preserved and explicitly disclosed in UI status banners.
