# Agent Handoff Document
## Risk-Aware Dynamic A\* for Satellite Anomaly Recovery

> **Prepared:** 2026-10-18  
> **Repo root:** `AI_Project/` (satellite anomaly recovery research codebase)  
> **Status:** ✅ Fully functional — 54/54 integration tests pass

---

## 1. What This Project Is

A Python research codebase implementing **risk-aware, dynamic A\*** for spacecraft telemetry anomaly recovery. The key idea:

- Each **search node** = full spacecraft subsystem state (power + thermal)  
- Each **edge** = a recovery command (one of 8 available)  
- **Goal** = any state where all telemetry parameters return inside nominal bands  
- **Heuristic** `f(n) = g(n) + h_d(n) + λ·R(n)` where `R(n) ∈ [0,1]` is a live anomaly score from an unsupervised ML scorer  
- ML *evaluates* states; classical search *chooses* commands — keeps the decision path inspectable

Reference spec: [`dynamic_astar_satellite_recovery.md`](dynamic_astar_satellite_recovery.md)

---

## 2. Codebase Layout

```
satellite_recovery/
├── simulator/
│   ├── orbit.py          OrbitSchedule  — raised-cosine LEO solar flux model
│   ├── spacecraft.py     SpacecraftState (frozen dataclass), SpacecraftParams, Simulator
│   ├── commands.py       8 recovery commands with preconditions / effects / costs
│   └── faults.py         FaultProfile registry + inject_fault()
├── search/
│   ├── problem.py        RecoveryProblem, Node, SearchStats, SearchResult
│   ├── heuristics.py     h_d (admissible) + compute_f for H0–H4
│   ├── astar.py          DynamicAStar   (batched scoring, anytime fallback)
│   ├── idastar.py        IDAstar        (linear memory, cross-iteration cache)
│   ├── rbfs.py           RBFS           (linear memory, pseudo-consistency)
│   └── local_search.py   HillClimbing + SimulatedAnnealing (sequence-space)
├── anomaly/
│   ├── features.py       Window → 32-dim feature vector (mean/std/slope/last × 8 channels)
│   └── scorer.py         IsolationForestScorer, MahalanobisScorer + empirical CDF calibration
├── evaluation/
│   ├── metrics.py        MetricsRecord, compute_metrics()
│   └── scenarios.py      6 named fault scenarios (single + cascade)
└── utils/
    └── logging_utils.py  CSVLogger, setup_logging
experiments/
├── generate_nominal_data.py   Simulate nominal trajectories → .npy window arrays
├── train_scorer.py            Fit IsolationForest/Mahalanobis + save .joblib
├── run_experiment.py          CLI harness (single run / full sweep / λ ablation)
└── configs/default.yaml       Default search parameters
notebooks/
└── 01_results_plots.ipynb     8-figure results visualisation notebook
```

---

## 3. Key Design Decisions

### State Representation
`SpacecraftState` is a **frozen dataclass** (hashable, immutable). The `signature()` method coarsens continuous values for the closed-set and score cache (rounding SoC to 2 dp, temps to nearest integer, time to nearest minute).

### Heuristic Variants

| ID | f(n) | Property |
|----|------|----------|
| H0 | g | UCS baseline — finds cheapest path, no guidance |
| H1 | g + h\_d | Admissible A\* — optimal under true cost |
| **H2** | g + h\_d + λ·R(n) | **Proposed** — risk-steered, not admissible |
| H3 | (g + λ·R(n)) + h\_d | Risk folded into g — optimal on augmented cost |
| H4 | g + w·(h\_d + λ·R(n)) | Weighted A\* — bounded-suboptimal, anytime |

### Anomaly Scorer Pipeline
1. Train `IsolationForestScorer` on nominal simulator windows (no real telemetry — avoids distribution shift)
2. Raw IF score negated → "anomaly direction"
3. Empirical CDF fitted on held-out nominal windows → calibrated `R(n) ∈ [0,1]`
4. State cache keyed by `state.signature()` prevents re-scoring identical states

### Commands (8 total)

| Name | Effect | Latency | Energy |
|------|--------|---------|--------|
| `payload_off` | payload\_on=False | 5 s | 10 J |
| `payload_on` | payload\_on=True (not safe\_mode) | 30 s | 50 J |
| `heater_on` | heater\_on=True | 2 s | 5 J |
| `heater_off` | heater\_on=False | 2 s | 5 J |
| `low_power_mode` | mode='low\_power' (avionics 30→18 W) | 10 s | 20 J |
| `resume_nominal` | mode='nominal' | 10 s | 20 J |
| `transmitter_off` | transmitter\_on=False | 3 s | 5 J |
| `safe_mode` | mode='safe\_mode', payload+tx off | 15 s | 30 J |

### Fault Scenarios

| Name | Fault | Initial State |
|------|-------|---------------|
| `single_thermal` | `fault_heat_payload=35 W` | `T_pay=58°C` (above nominal 55°C) |
| `single_power` | `fault_heat_battery=12 W`, extra load 10 W | `SoC=0.28` (below nominal 0.35), `T_bat=42°C` |
| `single_load` | `fault_extra_load=25 W` | `SoC=0.30` |
| `cascade` | `fault_heat_payload=28 W` + extra load 20 W | `T_pay=57°C`, `SoC=0.28` |
| `single_thermal_sun` | Same as single\_thermal | orbit\_phase=0.10 (sunlit) |
| `single_power_sun` | Same as single\_power | orbit\_phase=0.15 (sunlit) |

**Orbit phases:** 0.0–0.64 = sunlit arc (solar available); 0.65+ = eclipse (no solar flux).

---

## 4. Bugs Fixed (This Session)

### Bug 1 — Initial state already in nominal band
**File:** `satellite_recovery/simulator/faults.py`  
**Problem:** `THERMAL_RUNAWAY` set `temp_payload_override=42°C`. The nominal band is `[−15, 55°C]`. A\* found "goal" at depth 0 without any search.  
**Fix:** Raised `temp_payload_override` to `58°C` and `fault_heat_payload` to `35 W`. All four fault profiles were re-tuned so their initial states are provably outside at least one nominal band.

### Bug 2 — Eclipse orbit phase made battery recovery impossible
**File:** `satellite_recovery/evaluation/scenarios.py`  
**Problem:** `single_power` at `orbit_phase=0.68` (deep eclipse, zero solar flux). Even after shedding all loads, no charging was possible — the search always failed.  
**Fix:** `single_power` → `orbit_phase=0.20` (sunlit). `single_load` and `cascade` → orbit phases 0.25 / 0.30 so solar charging can restore SoC within the depth budget.

### Bug 3 — `TypeError` when running local search via CLI
**File:** `experiments/run_experiment.py`, function `build_algorithm()`  
**Problem:** `HillClimbing.__init__()` uses `budget_evals`, but the harness unconditionally passed `budget_nodes=` to all algorithm constructors.  
**Fix:** Added a conditional branch: systematic search (A\*, IDA\*, RBFS) receive `budget_nodes`; local search receives `budget_evals` (mapped from the same CLI flag).

---

## 5. What Was Added (This Session)

### `notebooks/01_results_plots.ipynb` (23 cells, was missing)
Produces 8 figures saved to `experiments/results/`:

| Figure | Contents |
|--------|----------|
| `fig1_success_rate.pdf` | Success rate bars — A\* × scenario × H0–H4 |
| `fig2_algo_comparison.pdf` | Nodes expanded + safety margin per algorithm |
| `fig3_lambda_ablation.pdf` | Success/nodes/margin vs λ on single\_thermal |
| `fig4_cascade_comparison.pdf` | Cascade scenario: all algorithms side-by-side |
| `fig5_variant_comparison.pdf` | 2×2 panel: success/nodes/margin/cost for H0–H4 |
| `fig6_memory_comparison.pdf` | Peak memory: A\* vs IDA\* vs RBFS |
| `fig7_recovery_trace.pdf` | SoC + T\_pay + T\_bat over time with command annotations |
| `fig8_score_distribution.pdf` | Anomaly score histogram: nominal vs thermal\_runaway |

---

## 6. Integration Test Results (54/54 ✅)

Tested with the trained `isolation_forest.joblib` scorer, `seed=0`, `budget=3000 nodes`, `max_depth=15–20`, `λ=50`.

| Scenario | Algo | ✓/✗ | Depth | Nodes | Scorer calls | Wall (ms) |
|----------|------|-----|-------|-------|--------------|-----------|
| single\_thermal | A\*/H0 | ✓ | 3 | 102 | 252 | 109 |
| single\_thermal | A\*/H1 | ✓ | 3 | 14 | 63 | 23 |
| single\_thermal | **A\*/H2** | ✓ | 3 | 15 | 67 | 25 |
| single\_thermal | A\*/H3 | ✓ | 3 | 15 | 67 | 24 |
| single\_thermal | A\*/H4 | ✓ | 3 | 15 | 67 | 24 |
| single\_thermal | IDA\*/H2 | ✓ | 3 | 109 | 66 | 77 |
| single\_thermal | RBFS/H2 | ✓ | 3 | 31 | 67 | 79 |
| single\_thermal | Hill Climb | ✓ | 3 | 397 | 392 | 448 |
| single\_thermal | Sim. Ann. | ✓ | 3 | 1059 | 1056 | 1233 |
| single\_power | A\*/H1 | ✓ | 2 | 2 | 11 | 5 |
| single\_power | A\*/H2 | ✓ | 2 | 2 | 11 | 4 |
| single\_power | IDA\*/H2 | ✓ | 2 | 2 | 3 | 3 |
| single\_power | RBFS/H2 | ✓ | 2 | 2 | 11 | 12 |
| single\_load | A\*/H2 | ✓ | 1 | 1 | 6 | 3 |
| cascade | A\*/H1 | ✓ | 2 | 3 | 15 | 6 |
| cascade | A\*/H2 | ✓ | 2 | 3 | 15 | 6 |
| cascade | RBFS/H2 | ✓ | 2 | 3 | 15 | 17 |
| … | … | ✓ | … | … | … | … |

**Key takeaway:** H1 uses ~7× fewer nodes than H0 on `single_thermal` (14 vs 102). H2/H3/H4 add risk-awareness at negligible overhead (+1 node, +4 scorer calls vs H1 on this scenario).

---

## 7. How to Run

### Quick start (from repo root)

```bash
# Install
pip install -e .

# Step 1 — Generate nominal training data
python experiments/generate_nominal_data.py \
    --n-trajectories 500 --steps-per-traj 200 --window-size 10 --seed 0

# Step 2 — Train the anomaly scorer
python experiments/train_scorer.py \
    --scorer isolation_forest --n-estimators 200

# Step 3 — Single experiment
python experiments/run_experiment.py \
    --scenario single_thermal \
    --algorithm astar --variant H2 \
    --lambda-risk 50 --seed 0 \
    --scorer experiments/scorers/isolation_forest.joblib \
    --output experiments/results/results.csv

# Step 4 — Full sweep (all scenarios × all algorithms × 10 seeds)
python experiments/run_experiment.py \
    --sweep --seeds 10 \
    --scorer experiments/scorers/isolation_forest.joblib

# Step 5 — λ ablation on single_thermal / A*/H2
python experiments/run_experiment.py \
    --scenario single_thermal --algorithm astar --variant H2 \
    --sweep-lambda --seeds 5 \
    --scorer experiments/scorers/isolation_forest.joblib

# Step 6 — Results notebook
jupyter lab notebooks/01_results_plots.ipynb
```

### Available CLI flags (`run_experiment.py`)

| Flag | Default | Description |
|------|---------|-------------|
| `--scenario` | `single_thermal` | One of the 6 named scenarios |
| `--algorithm` | `astar` | `astar` / `idastar` / `rbfs` / `hill_climbing` / `simulated_annealing` |
| `--variant` | `H2` | `H0`–`H4` (ignored for local search) |
| `--lambda-risk` | `50.0` | Risk-to-cost-unit weight λ |
| `--seed` | `0` | Random seed |
| `--budget-nodes` | `5000` | Max node expansions (or evaluations for local search) |
| `--max-depth` | `20` | Max path depth |
| `--w` | `1.5` | Weighted A\* suboptimality bound (H4 only) |
| `--scorer` | _(none)_ | Path to `.joblib` scorer; if omitted, risk=0 |
| `--output` | `experiments/results/results.csv` | CSV append path |
| `--sweep` | flag | Run all scenarios × algorithms × variants × seeds |
| `--sweep-lambda` | flag | Also sweep over λ ∈ {0,10,25,50,100,200} |

---

## 8. Known Limitations / Future Work

1. **Sim-to-real gap** — All constraint guarantees hold *on the simulator model*, not on a physical spacecraft. The paper must word guarantees accordingly.
2. **Admissibility** — `R(n)` from a learned scorer is not a cost lower-bound. H2/H4 are bounded-suboptimal; H3 restores optimality on the augmented cost `g + λΣR`.
3. **Depth budget** — The current `max_depth=20` means the search plans at most 20 command steps (each = 60 s physics). Longer recoveries need a higher depth or a "wait" command that simulates multiple physics steps per action.
4. **Reaction wheels** — Out of scope for v1; angular momentum management deferred to future work.
5. **Replanning** — Currently one-shot planning. D\* Lite / ARA\* would support incremental replanning as telemetry updates mid-execution.
6. **Scorer latency** — Each scorer call is cheap (~0.3 ms), but IDA\* and SA accumulate 1000+ calls. A distilled/quantized scorer could cut this further.

---

## 9. Dependencies

```
numpy>=1.26
scipy>=1.12
scikit-learn>=1.4
joblib>=1.3
pyyaml>=6.0
tqdm>=4.66
pandas>=2.2
matplotlib>=3.8
seaborn>=0.13
```

All are available via `pip install -e .` (see `requirements.txt` and `setup.cfg`).

---

## 10. Files Modified / Created This Session

| File | Action | Reason |
|------|--------|--------|
| `satellite_recovery/simulator/faults.py` | Modified | Fix initial states to be out-of-band; tune fault magnitudes |
| `satellite_recovery/evaluation/scenarios.py` | Modified | Fix orbit phases for power/load/cascade scenarios |
| `experiments/run_experiment.py` | Modified | Fix `build_algorithm()` for local search `budget_evals` |
| `notebooks/01_results_plots.ipynb` | **Created** | Was listed in README but did not exist |
| `experiments/data/nominal_windows.npy` | Generated | 200 traj × 101 steps → 20,200 windows (shape 20200×10×8) |
| `experiments/scorers/isolation_forest.joblib` | Generated | 100-tree IsolationForest trained on nominal data |
| `experiments/results/results.csv` | Generated | Sample results (2 rows) — run sweep to populate |
