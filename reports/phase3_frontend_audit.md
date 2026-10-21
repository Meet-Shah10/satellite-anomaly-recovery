# Phase 3 Frontend Audit Report

**Project:** Risk-Aware Dynamic A* for Satellite Anomaly Recovery  
**Date:** 2026-10-22  
**Auditor:** Senior Frontend Architect & AI Systems Engineer  

---

## 1. Environment & Tooling Verification

- **Node.js Version:** `v24.21.0` (Verified active and accessible)
- **npm Version:** `11.19.0` (Verified active and accessible)
- **Current Frontend Presence:** None. No `package.json`, `node_modules`, or build configurations exist anywhere in the repository.
- **Git Status:** Working tree clean except for untracked `backend/` and `tests/` directories created in Phase 1 & 2.
- **Backend Server:** Active on `http://127.0.0.1:8000` (FastAPI with Uvicorn).

---

## 2. Backend API Endpoint & Schema Mapping

The frontend will interface with the verified FastAPI backend on `http://127.0.0.1:8000` (proxied via Vite at `/api` during development):

| Endpoint | HTTP Method | Verified Payload / Parameters | Key Response Fields |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | None | `status`, `python_version`, `app_version`, `scorer_loaded`, `assets` (`scorer_model`, `nominal_dataset`, `experiment_results`), `known_issues` |
| `/api/scenarios` | `GET` | None | List of objects: `name`, `fault_name`, `description`, `orbit_phase` |
| `/api/commands` | `GET` | None | List of objects: `name`, `latency_s`, `energy_j`, `nominal_cost` |
| `/api/simulate/step` | `POST` | `{ state, command, orbit_phase? }` | `command`, `command_cost`, `next_state`, `is_infeasible`, `in_nominal`, `safety_margin`, `parameter_violations` |
| `/api/plan/solve` | `POST` | `{ scenario, algorithm, variant, lambda_risk, budget_nodes, max_depth, w, seed }` | `scenario`, `algorithm`, `variant`, `success`, `solution_cost`, `solution_depth`, `termination_reason`, `stats`, `metrics`, `path` |
| `/api/benchmark/compare` | `POST` | `{ scenario, algorithms, variants, lambda_risk, budget_nodes, max_depth, seed, w }` | `scenario`, `lambda_risk`, `total_runs`, `runs` (list of run statistics) |
| `/api/telemetry/sample` | `GET` | `?window_index=&n_windows=&seed=` | `dataset_total_windows` (10,100), `channels`, `windows` (`window_index`, `anomaly_score`, `meta`, `points`), `disclaimer` |
| `/api/experiments/history` | `GET` | `?scenario=&algorithm=&variant=&limit=&offset=` | `total_records`, `limit`, `offset`, `records` (`MetricsSchema`) |

---

## 3. Technology Stack Selection

To meet requirements for a premium, responsive aerospace mission-control application:
- **Build Tool:** Vite (fast ESM bundler, dev server proxy)
- **Framework:** React 19 / TypeScript (strict mode, fully typed API client)
- **Styling:** Tailwind CSS (deep aerospace dark theme, custom palette)
- **Icons:** Lucide React (clean technical iconography)
- **Routing:** React Router v7 / v6 (full client-side navigation with direct URLs)
- **Visualization:** Recharts & custom SVG/Canvas elements for mission-control telemetry and timelines
- **Directory Placement:** Clean `frontend/` directory at the repository root

---

## 4. Phase 3 Scope & Target Architecture

1. **Application Shell & Router:** Persistent sidebar navigation, top status HUD, responsive collapsible layout.
2. **Navigation Destinations (9 total):**
   - **Mission Overview:** Fully implemented with real API data (`/api/health`, `/api/scenarios`, `/api/commands`, `/api/experiments/history`).
   - **8 Placeholder Pages:** Professional under-construction views with functional routes and architectural previews:
     - Spacecraft Digital Twin
     - Telemetry & Anomaly Lab
     - Recovery Path Planner
     - Simulation Laboratory
     - Algorithm Benchmarking
     - Experiment History
     - Research Reports
     - Settings & System Status
3. **Resilience:** Graceful handling of disconnected backend state with retry triggers and distinct visual operational indicators.
