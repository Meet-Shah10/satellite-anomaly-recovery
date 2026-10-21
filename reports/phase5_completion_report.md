# Phase 5 Completion Report: Telemetry & Anomaly Lab

**Project:** Risk-Aware Dynamic A* for Satellite Anomaly Recovery  
**Phase:** 5 — Telemetry & Anomaly Lab  
**Date:** 2026-10-22  
**Status:** COMPLETE — Awaiting User Review

---

## 1. Executive Summary

Phase 5 replaced the static telemetry placeholder with an interactive, scientifically grounded scientific analysis workspace connected to the live backend telemetry service (`GET /api/telemetry/sample`) and the trained research model (`IsolationForestScorer`).

The implementation maintains strict fidelity to the research codebase:
- Telemetry is streamed directly from the 10,100 nominal windows stored in `experiments/data/nominal_windows.npy` via read-only memory-mapped slices in FastAPI.
- Anomaly scores are computed on-the-fly using the serialized research model (`experiments/scorers/nominal_isoforest.joblib`) over 32 statistical features extracted per 10-step window.
- No synthetic points or artificial smoothing curves are generated. Discrete and categorical channels (relays, operating modes) are explicitly plotted with stepped geometry rather than misleading continuous interpolation.
- The anomaly score is correctly framed as an empirical CDF percentile rank ($R(n) \in [0, 1]$) indicating relative deviation from nominal behavior, with an explicit refusal to invent arbitrary binary thresholds (such as 0.5 or 0.8).

---

## 2. Files Created and Modified

### Created Components & Reports
1. **Audit Document:**
   - [`reports/phase5_telemetry_audit.md`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/reports/phase5_telemetry_audit.md): Complete technical audit of dataset structure, scoring mechanism, API response shapes, and scientific constraints.
2. **Completion Report:**
   - [`reports/phase5_completion_report.md`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/reports/phase5_completion_report.md): This verification and architecture summary.
3. **Telemetry Lab Components:**
   - [`frontend/src/components/telemetry/WindowExplorerBar.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/components/telemetry/WindowExplorerBar.tsx): Controls for direct window index lookup ($0 \le i < 10100$), pseudo-random reproducible sampling via `seed`, multi-window quantity selection ($1 \le n \le 10$), step navigation, and input validation.
   - [`frontend/src/components/telemetry/AnomalyScoreCard.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/components/telemetry/AnomalyScoreCard.tsx): Displays the exact model-derived empirical CDF percentile rank $R(n)$, calibration details, model identity (`IsolationForestScorer` with 200 estimators and 32 rolling features), and scientific caveats.
   - [`frontend/src/components/telemetry/MultiChannelChart.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/components/telemetry/MultiChannelChart.tsx): Recharts-based multi-tab time-series visualization with tabs for *Thermal Subsystem* (°C), *Electrical Power* (SoC [0-1]), *Actuator & Mode States* (stepped flags and operating codes), and *Single-Channel Deep-Dive* with full channel selector and tooltips.
   - [`frontend/src/components/telemetry/WindowComparisonView.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/components/telemetry/WindowComparisonView.tsx): Rendered when $n_{\text{windows}} > 1$, showing sample-level anomaly score distribution (histogram/bar chart), sample summary statistics (min, max, mean, range), and a comparative table with clickable rows to inspect any window in detail.
   - [`frontend/src/components/telemetry/ChannelCatalogPanel.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/components/telemetry/ChannelCatalogPanel.tsx): Documents all 8 telemetry channels dynamically from backend metadata (names, units, descriptions) and details the 32-feature extraction pipeline.

### Modified Files
1. **Frontend View & Types:**
   - [`frontend/src/pages/TelemetryLab.tsx`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/pages/TelemetryLab.tsx): Integrated all telemetry components into a coherent, responsive aerospace mission-control workspace with prominent disclaimer banner and error boundaries.
   - [`frontend/src/api/types.ts`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/api/types.ts): Added TypeScript type definitions (`TelemetryPoint`, `TelemetryWindowMeta`, `TelemetryWindow`, `TelemetryChannel`, `TelemetrySampleResponse`, `TelemetrySampleParams`) matching backend Pydantic schemas.
   - [`frontend/src/api/client.ts`](file:///c:/Users/ASUS/Documents/AI%20MINI%20PROJECT/satellite-anomaly-recovery/frontend/src/api/client.ts): Added `getTelemetrySample(params?: TelemetrySampleParams): Promise<TelemetrySampleResponse>` with request cancellation and parameter encoding.

---

## 3. API Endpoints Used

- **`GET /api/telemetry/sample`**
  - **Query Parameters Supported:**
    - `window_index`: (Optional `int`, $0 \le i < 10100$) Direct lookup of a specific window.
    - `n_windows`: (Optional `int`, $1 \le n \le 10$, default 1) Number of consecutive or sampled windows.
    - `seed`: (Optional `int`) Reproducible pseudo-random seed for sampling.
  - **Response Payload:**
    - `dataset_total_windows`: 10100
    - `window_length_steps`: 10
    - `step_duration_s`: 60.0
    - `channels`: Array of 8 channel metadata objects (`name`, `index`, `display_name`, `unit`, `description`)
    - `windows`: Array of sampled window objects, each with `window_index`, `anomaly_score`, `meta` (`orbit_phase`, `initial_soc`, `initial_temp_payload`), and 10 `points` (`step_index`, `time_offset_s`, `values`).
    - `disclaimer`: Explicit disclaimer string.

---

## 4. Telemetry Channels Implemented

All 8 channels are extracted dynamically from backend metadata rather than being hardcoded:

| Channel Key | Index | Display Name | Unit | Subsystem / Type | Interpretation |
|---|---|---|---|---|---|
| `soc` | 0 | State of Charge | ratio [0-1] | Power (Continuous) | Battery usable fraction |
| `temp_battery` | 1 | Battery Temperature | °C | Thermal (Continuous) | Thermal node for battery pack |
| `temp_payload` | 2 | Payload Temperature | °C | Thermal (Continuous) | Primary instrument thermal node |
| `temp_bus` | 3 | Bus Temperature | °C | Thermal (Continuous) | Structural/electronics bus thermal node |
| `heater_on` | 4 | Heater Relay | flag [0/1] | Actuator (Discrete Stepped) | Active thermal control relay |
| `payload_on` | 5 | Payload Power | flag [0/1] | Actuator (Discrete Stepped) | Science payload power relay |
| `transmitter_on` | 6 | Transmitter Power | flag [0/1] | Actuator (Discrete Stepped) | RF communications transmitter relay |
| `mode_code` | 7 | Operating Mode | code [0-2] | Software (Categorical Stepped) | $0=\text{nominal}$, $1=\text{low\_power}$, $2=\text{safe\_mode}$ |

---

## 5. Window Selection & Reproducible Sampling

1. **Direct Window Index Mode:**
   - User inputs an exact window index in the range $[0, 10099]$.
   - Validation checks guarantee that invalid values or out-of-range indices are rejected client-side and trigger clean user feedback without corrupting active state.
2. **Reproducible Seeded Sampling Mode:**
   - Setting a numeric `seed` enables deterministic pseudo-random sampling via backend numpy RNG.
   - Entering identical seed values yields identical windows and anomaly scores, facilitating research reproducibility.
3. **Multi-Window Retrieval:**
   - Supports retrieving $1 \le n_{\text{windows}} \le 10$ windows in a single round-trip.
   - When $n > 1$, activates the Window Comparison table and sample distribution summary.
4. **Step Navigation:**
   - Single-click next/previous window buttons with boundary protections ($0$ to $10099$).
5. **Request Concurrency & Error Handling:**
   - Concurrent or overlapping requests are debounced and tracked with monotonic request IDs to prevent race conditions and display stale cached data.

---

## 6. Anomaly Score Interpretation & Calibration

1. **Empirical CDF Calibration:**
   - The underlying model `IsolationForestScorer` computes raw Isolation Forest scores $s_{\text{raw}}$ and converts them to empirical cumulative distribution function percentiles $R(n) = \frac{1}{M}\sum_{i=1}^{M} \mathbb{I}(s_i \le s_{\text{raw}})$.
   - Values lie in $[0, 1]$, where:
     - $\approx 0.50$: Median typical behavior in the nominal training set.
     - $\ge 0.90$: Tail deviation (top 10% highest deviation within nominal data).
     - $\ge 0.99$: Extreme outlier relative to nominal training distribution.
2. **Threshold Policy:**
   - **No binary threshold is invented.** The research model does not define a single cutoff for classifying a telemetry sequence as a "hardware fault". The score is strictly framed as an indicator of statistical outlier density relative to nominal simulation distributions.
3. **Feature Pipeline Transparency:**
   - The UI details the exact 32-dimensional feature vector ($8\ \text{channels} \times 4\ \text{statistics}$: mean, standard deviation, linear regression slope, and terminal point) used by the 200 isolation trees.

---

## 7. Sample Statistics & Visualizations

1. **Window-Level Visualizations:**
   - Multi-tab time-series chart with responsive Recharts SVG elements.
   - Discrete channels (`heater_on`, `payload_on`, `transmitter_on`, `mode_code`) plotted using `stepAfter` interpolation to preserve discrete semantics.
   - Tooltips display exact values, units, and timestamps ($0$s to $540$s with 60s step intervals).
2. **Sample-Level Statistics:**
   - When $n_{\text{windows}} > 1$, computes sample minimum, maximum, mean, and range of anomaly scores for the retrieved sample.
   - Displays a sample score distribution chart.
   - All sample statistics are explicitly labeled as applying to the **retrieved sample ($N \le 10$)**, never misrepresented as representing all 10,100 windows.

---

## 8. Verification and Quality Checks

### Test Suite Execution
- **Backend Tests:**
  - Command: `$env:PYTHONUTF8="1"; .\.venv\Scripts\python.exe -m pytest -q`
  - Result: **40 passed, 0 failures** in 3.19s.
- **Frontend Production Build:**
  - Command: `npm run build`
  - Result: **Exit code 0**; TypeScript compilation succeeded (`tsc -b && vite build`), generating `dist/` bundle in 376ms.
- **Frontend Linter:**
  - Command: `npm run lint`
  - Result: **Found 0 warnings and 0 errors** on 37 files with 116 rules.
- **Backend Endpoint Verification:**
  - Command: `curl http://127.0.0.1:8000/api/telemetry/sample?window_index=42&n_windows=1`
  - Result: Returned valid 200 payload with 8 channels, 10 points, metadata (`orbit_phase: 0.813`, `initial_soc: 0.768`), and anomaly score `0.5815`.

### Browser Verification Limitation
- Automated Playwright browser context initialization failed due to an external network download error for the Playwright browser driver (404 from azureedge mirrors).
- In accordance with task guidelines, visual styling and interaction flows were verified via code review, live API query testing, and TypeScript/OxLint validation without claiming automated browser visual certification.

---

## 9. Preservation of Research Assets

A complete check of Git status confirms that all research core assets remain 100% unaltered:
- `git diff --stat` output: **Empty (0 changes)**.
- `satellite_recovery/`: Untouched.
- `experiments/data/nominal_windows.npy`: Untouched (read-only memory-mapped access preserved).
- `experiments/data/nominal_windows_meta.npy`: Untouched.
- `experiments/scorers/nominal_isoforest.joblib`: Untouched.
- `experiments/results/`: Untouched.

---

## 10. Conclusion & Next Steps

Phase 5 is complete. All requirements have been satisfied. No modifications have been made to Phase 6 (Recovery Planner) or Phase 7 (Benchmarking). Awaiting user review before proceeding.
