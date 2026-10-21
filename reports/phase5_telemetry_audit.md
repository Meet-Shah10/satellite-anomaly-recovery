# Phase 5 Audit Report — Telemetry & Anomaly Lab

**Project:** Risk-Aware Dynamic A* for Satellite Anomaly Recovery  
**Phase:** 5 — Telemetry & Anomaly Lab  
**Date:** 2026-10-22  
**Auditor:** Senior Aerospace Systems & Frontend Software Architect  

---

## 1. Inspection Findings & Codebase Analysis

### 1.1 Existing Telemetry & Dataset Implementation (`experiments/data/`)
- **Nominal Training Windows (`nominal_windows.npy`):**
  - Array Shape: `(10100, 10, 8)`.
  - Total Windows: 10,100 discrete trajectory windows.
  - Window Duration: 10 steps $\times$ 60 seconds per step = 600 seconds (10 minutes) per window.
  - Channels (8 variables):
    1. `soc` (index 0): Battery State of Charge, unit `ratio [0-1]`, description `Battery charge fraction`.
    2. `temp_battery` (index 1): Battery Temperature, unit `°C`, description `Battery cell temperature`.
    3. `temp_payload` (index 2): Payload Temperature, unit `°C`, description `Science instrument temperature`.
    4. `temp_bus` (index 3): Electronics Bus Temperature, unit `°C`, description `Electronics bus temperature`.
    5. `heater_on` (index 4): Heater Relay, unit `flag [0/1]`, description `Thermal heater status`.
    6. `payload_on` (index 5): Payload Power, unit `flag [0/1]`, description `Payload power switch`.
    7. `transmitter_on` (index 6): Transmitter Power, unit `flag [0/1]`, description `RF transmitter status`.
    8. `mode_code` (index 7): Operating Mode, unit `code [0-2]`, description `0=nominal, 1=low_power, 2=safe_mode`.
- **Nominal Metadata (`nominal_windows_meta.npy`):**
  - Array Shape: `(10100, 3)`.
  - Column 0: `orbit_phase` — fraction of 5400s orbital period $\phi \in [0, 1)$ at window start.
  - Column 1: `initial_soc` — battery SoC at window start.
  - Column 2: `initial_temp_payload` — payload assembly temperature (°C) at window start.

### 1.2 Anomaly Scorer Architecture (`satellite_recovery/anomaly/`)
- **Model Identity:** Isolation Forest (`IsolationForestScorer`), serialized as `experiments/scorers/isolation_forest.joblib`.
  - Estimators: 200 trees (`n_estimators = 200`), sub-sampling `max_samples = 'auto'`.
  - Contamination: `contamination = 0.01` (1% nominal outlier expectation during training).
- **Feature Extraction (`features.py`):**
  - Input: 10-step window $\times$ 8 state channels.
  - For each channel $c \in \{0, \dots, 7\}$, extracts 4 statistical features:
    1. `mean`: central tendency across the 10 steps.
    2. `std`: sample standard deviation.
    3. `slope`: least-squares linear trend across the window.
    4. `last`: most recent value at step 9.
  - Total Feature Dimensionality: $8 \times 4 = 32$ continuous float32 features.
- **Scoring & Calibration (`scorer.py`):**
  - Raw Output: $s_{\text{raw}} = -\text{decision\_function}(X)$. (Negative sklearn decision function so higher values correspond to greater anomaly).
  - Calibration: Evaluated through an Empirical Cumulative Distribution Function (`_EmpiricalCDF`) fitted on a 50% held-out nominal split.
  - Output Score Range: Strictly bounded in $[0.0, 1.0]$.
  - Scientific Interpretation: A calibrated score $R(n) = 0.92$ signifies that the window's feature vector is more anomalous than $92\%$ of nominal baseline windows in the calibration set.
  - Thresholding: The scorer does **not** expose a universal binary hard threshold (such as 0.5 or 0.8). Instead, $R(n)$ provides a continuous risk density metric weighted by $\lambda_{\text{risk}}$ in the search objective: $f(n) = g(n) + \lambda R(n) + h(n)$.

### 1.3 Backend Endpoint Inspection (`GET /api/telemetry/sample`)
- **Query Parameters:**
  - `window_index`: `Optional[int]`, validated with `ge=0`. If omitted, drawn pseudo-randomly using `seed`. Valid range: `[0, 10099]`.
  - `n_windows`: `int`, default `1`, constrained to `[1, 10]`.
  - `seed`: `Optional[int]`, `ge=0`. Generates deterministic window index when `window_index` is null.
- **Response Schema (`TelemetrySampleResponse`):**
  - `dataset_total_windows`: `10100`
  - `window_length_steps`: `10`
  - `step_duration_s`: `60.0`
  - `channels`: List of 8 channel definitions with `name`, `index`, `display_name`, `unit`, `description`.
  - `windows`: List of `TelemetryWindowSchema` items, each containing:
    - `window_index`: integer index into dataset.
    - `anomaly_score`: calibrated float in $[0, 1]$.
    - `meta`: dictionary containing `orbit_phase`, `initial_soc`, `initial_temp_payload`.
    - `points`: 10 items with `step_index` ($0\text{–}9$), `time_offset_s` ($0.0, 60.0, \dots, 540.0$), and `values` dictionary.
  - `disclaimer`: `"Offline nominal training dataset sample. Not live spacecraft telemetry."`

---

## 2. Identified Gaps & Architectural Plan

1. **Frontend Replacement**:
   - `frontend/src/pages/TelemetryLab.tsx` is currently an `UnderConstructionView` placeholder.
   - It will be replaced with a modular, mission-control analysis workspace:
     - Header with title, subtitle, and prominent persistent disclaimer: **"OFFLINE NOMINAL DATASET — NOT LIVE SPACECRAFT TELEMETRY"**.
     - **Window Explorer Toolbar**: Allows selecting specific `window_index` ($0\text{–}10099$), setting `n_windows` ($1\text{–}10$), specifying reproducible `seed`, and quick sampling buttons (e.g. Next, Prev, Random).
     - **Window Inspection & Metadata Card**: Displays active index, orbit phase, sunlit/eclipse state, initial SoC, initial payload temp, and Isolation Forest score.
     - **Anomaly Score Panel**: Deep-dive card explaining the calibrated percentile rank $R(n)$, the 32-feature extraction pipeline (mean, std, slope, last), and clear language stating this is an unsupervised outlier indicator rather than a fault diagnosis.
     - **Multi-Channel Synchronized Time-Series**: Recharts line charts organized into structured tabs/panels:
       - *Thermal Subsystem*: Battery, Payload, and Bus temperatures (°C) with nominal boundaries.
       - *Power Subsystem*: Battery State of Charge (ratio / percentage).
       - *Discrete Actuators & Mode*: Binary flags (`heater_on`, `payload_on`, `transmitter_on`) and categorical mode (`nominal`, `low_power`, `safe_mode`).
     - **Multi-Window Comparison View**: If $n_{\text{windows}} > 1$, renders a comparative table and score comparison chart sorted by anomaly score.
     - **Channel Catalog & Feature Dictionary**: Technical reference card detailing all 8 channels directly from backend metadata.

2. **Error Handling & State Retention**:
   - Out-of-bounds `window_index` (e.g. $\ge 10100$ or $< 0$) rejected cleanly with friendly validation feedback.
   - Preserves active window upon invalid user input rather than corrupting the workspace.

3. **Scientific Fidelity Enforcement**:
   - Zero synthetic, smoothed, or fabricated data points.
   - No invented 0.5 or 0.8 fault threshold labels.
   - Clear distinction between offline dataset exploration and active simulation state.
