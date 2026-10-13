# Risk-Aware Dynamic A\* for Satellite Anomaly Recovery

A reproducible Python research codebase implementing the search formulation
described in `dynamic_astar_satellite_recovery.md`.

---

## Overview

Unsupervised models detect spacecraft telemetry anomalies well.
Turning a detection into a **safe, multi-step recovery plan** remains
unsolved.  This project formulates recovery as informed state-space search:

- Each **node** is a full subsystem state (power + thermal).
- Each **edge** is a recovery command.
- The **goal** is any state where telemetry returns inside nominal limits.
- A\* searches for the cheapest command sequence.
- A learned **anomaly score** — recomputed on every simulated state the
  search visits — adds a risk term λ·R(n) to the heuristic, steering the
  search away from trajectories that drift toward failure.

ML only *evaluates* states.  A classical, inspectable algorithm *chooses*
the commands.

---

## Module Layout

```
satellite_recovery/
├── simulator/
│   ├── orbit.py        OrbitSchedule  — solar flux (raised-cosine LEO model)
│   ├── spacecraft.py   SpacecraftState, SpacecraftParams, Simulator
│   ├── commands.py     8 recovery commands (precondition / effect / cost)
│   └── faults.py       FaultProfile registry + inject_fault()
├── search/
│   ├── problem.py      RecoveryProblem, Node, SearchStats, SearchResult
│   ├── heuristics.py   h_d (admissible) + compute_f for all 5 variants
│   ├── astar.py        DynamicAStar   (H0–H4, batched scoring, anytime)
│   ├── idastar.py      IDAstar        (linear memory, cross-iteration cache)
│   ├── rbfs.py         RBFS           (linear memory, pseudo-consistency)
│   └── local_search.py HillClimbing + SimulatedAnnealing (sequence-space)
├── anomaly/
│   ├── features.py     Window → 32-dim feature vector (mean/std/slope/last)
│   └── scorer.py       IsolationForestScorer, MahalanobisScorer + CDF calib
├── evaluation/
│   ├── metrics.py      MetricsRecord, compute_metrics()
│   └── scenarios.py    6 named scenarios (single fault + cascade)
└── utils/
    └── logging_utils.py  CSVLogger, setup_logging
experiments/
├── generate_nominal_data.py   Generate nominal training windows
├── train_scorer.py            Fit + save anomaly scorer
├── run_experiment.py          CLI harness (single run / full sweep)
└── configs/default.yaml       Default parameters
notebooks/
└── 01_results_plots.ipynb     Results visualisation (plots only)
```

---

## Heuristic Variants

| ID | f(n) | Notes |
|---|---|---|
| H0 | g | UCS baseline |
| H1 | g + h\_d | Static A* |
| **H2** | g + h\_d + λ·R(n) | **Proposed dynamic heuristic** |
| H3 | (g + λ·R(n)) + h\_d | Risk folded into g — restores optimality on augmented cost |
| H4 | g + w·(h\_d + λ·R(n)) | Weighted A* — anytime, bounded suboptimal |

---

## Quickstart

### 1. Install

```bash
pip install -e .
```

### 2. Generate nominal training data

```bash
python experiments/generate_nominal_data.py \
    --n-trajectories 500 \
    --steps-per-traj 200 \
    --window-size 10
```

### 3. Train the anomaly scorer

```bash
python experiments/train_scorer.py \
    --scorer isolation_forest \
    --n-estimators 200
```

### 4. Run a single experiment

```bash
python experiments/run_experiment.py \
    --scenario single_thermal \
    --algorithm astar \
    --variant H2 \
    --lambda-risk 50 \
    --seed 0 \
    --scorer experiments/scorers/isolation_forest.joblib \
    --output experiments/results/results.csv
```

### 5. Full sweep (all scenarios × algorithms × 10 seeds)

```bash
python experiments/run_experiment.py \
    --sweep \
    --seeds 10 \
    --scorer experiments/scorers/isolation_forest.joblib
```

### 6. λ ablation

```bash
python experiments/run_experiment.py \
    --scenario single_thermal \
    --algorithm astar \
    --variant H2 \
    --sweep-lambda \
    --seeds 5 \
    --scorer experiments/scorers/isolation_forest.joblib
```

---

## Simulator

**Power subsystem** — net power balance (solar − load) drives SoC.
- Solar input: raised-cosine profile, 280 W peak, 35 % eclipse fraction.
- Battery: 50 Wh, asymmetric charge/discharge efficiency.

**Thermal subsystem** — three lumped RC nodes, first-order Euler (dt = 60 s).
- battery ↔ space (UA = 0.5 W/°C), battery ↔ bus (0.1 W/°C)
- payload ↔ space (0.3 W/°C), payload ↔ bus (0.2 W/°C)
- bus ↔ space (0.8 W/°C)

**Hard limits**: SoC ≥ 15 %, T\_bat ∈ [−15, 50] °C, T\_pay ∈ [−25, 70] °C, T\_bus ∈ [−20, 60] °C.

**Reaction wheels** are out of scope for v1 (listed as a future extension).

---

## Anomaly Scorer

`IsolationForestScorer` trains on nominal simulator windows and calibrates
raw Isolation Forest scores to [0, 1] via an empirical CDF (percentile rank
against held-out nominal data).  Training uses the simulator as the data
source to avoid distribution shift between training and search-time scoring.

`MahalanobisScorer` is the cheap ablation (multivariate Gaussian distance,
same CDF calibration).

---

## Guarantees (Section 4.3)

| Property | Holds? |
|---|---|
| Hard constraints satisfied (on model) | **Yes** — constraint checks prune before expansion |
| Termination | **Yes** — depth bound + finite action set |
| Completeness within depth bound | **Yes** — finite graph |
| Optimal under true cost | **No** — learned R(n) is not admissible |
| Bounded suboptimal | **Yes, conditional** — H3 restores optimality on augmented cost; H4 provides w-bounded suboptimality |

---

## Limitations

- Constraint satisfaction holds **on the simulator model**, not on the
  physical spacecraft.  The paper words all guarantees accordingly.
- No action-effect real telemetry data: the simulator is the source of
  truth, validated against recorded nominal behaviour.
- Reaction wheel momentum deferred to future work.
- A flight-style C port is out of scope; node/scorer/memory counts give the
  resource-constraint argument without embedded implementation.
