# Results Audit — Irregularities Found

> Prepared: 2026-10-18  
> Input: `experiments/results/results.csv` (1,053 rows from the full sweep)

**Summary: 6 significant issues found** — ranging from duplicate rows in the CSV, to scenarios that are too easy to differentiate algorithms, to metrics that never vary across seeds.

---

## Issue 1 — Duplicate Rows in `results.csv` (CRITICAL)

**What we see:** `single_thermal + astar + H2` has **42 rows** instead of the expected 10.

**Root cause:** The single-run command you ran first appended to the same CSV file that the sweep later also appended to. Because the CSV file is never overwritten — only appended — every time you run any experiment, it stacks on top of previous results.

**Evidence:**
```
Variant H2, seed 0 appears 9 times
Variant H2, seed 1 appears 7 times
...
Variant H2, seed 5 appears 1 time (sweep only)
```

The first `--scenario single_thermal --variant H2 --seed 0` single run ran before the sweep and left a row. Then you ran several more test runs during development. Then the sweep added the "official" rows on top.

**Impact:** Any aggregate (mean, median) over the CSV is biased — H2 on single_thermal has triple the weight of H0/H3/H4.

**Fix:** Always clear or rename the output CSV before running a sweep, or add a `--overwrite` flag.
```bash
rm experiments/results/results.csv
python experiments/run_experiment.py --sweep --seeds 10 --scorer ...
```

---

## Issue 2 — Seed Has No Effect on Deterministic Algorithms (IMPORTANT)

**What we see:** For A\*, IDA\*, and RBFS, every seed from 0–9 produces **byte-for-byte identical results** — same path, same nodes expanded, same cost, same time_to_stable_s.

**Root cause:** A\*, IDA\*, and RBFS are **deterministic algorithms**. They always explore states in the same order given the same problem. The `seed` parameter is only used by the local search algorithms (Hill Climbing, Simulated Annealing) for their random restarts.

**Evidence:**
```
A*/H2, single_thermal:
  seed 0: success=True cost=18.35 path=[payload_off, transmitter_off, low_power_mode]
  seed 1: success=True cost=18.35 path=[payload_off, transmitter_off, low_power_mode]
  seed 9: success=True cost=18.35 path=[payload_off, transmitter_off, low_power_mode]
  (all 10 seeds: identical)
```

**Impact:** Running 10 seeds for A\*/IDA\*/RBFS produces 10 copies of the same number. The "10 seeds" methodology only makes statistical sense for Hill Climbing and Simulated Annealing.

**Fix:** For deterministic algorithms, running a single seed is sufficient. The `--seeds` flag should only loop for stochastic algorithms — or document clearly that the seed column is meaningless for A\*/IDA\*/RBFS.

---

## Issue 3 — `safety_margin` Never Varies (STRUCTURAL)

**What we see:** `safety_margin` is **identical for every seed, every algorithm, every variant** within the same scenario.

```
cascade:        all algorithms → 0.1368
single_load:    all algorithms → 0.1765
single_power:   all algorithms → 0.1231
single_thermal: all algorithms → 0.1263
```

**Root cause:** `safety_margin` is computed as the **minimum normalised distance to any hard constraint across the solution path**. Because:
1. All algorithms (when successful) find the **same solution path** (same 3 commands in the same order)
2. That path passes through the same physics states regardless of which algorithm found it
3. So the minimum margin is always the same number

**Impact:** `safety_margin` is not a useful differentiating metric in these results — it only tells you whether you violated a hard limit (margin < 0), not which algorithm is "safer". It would only vary if different algorithms found different-length paths through different intermediate states.

**Fix:** This metric becomes meaningful in harder scenarios where algorithms find different paths. As-is, it is only useful for checking constraint satisfaction (margin > 0 = safe).

---

## Issue 4 — Most Scenarios Are Too Easy (STRUCTURAL)

**What we see:** 4 out of 6 scenarios are solved at depth 1–2 by almost any action.

**`single_load` — Trivially solved by 4 out of 5 available actions in one step:**
```
After payload_off:      soc=0.359 → in_band=True  ✓ goal achieved
After low_power_mode:   soc=0.350 → in_band=True  ✓ goal achieved
After transmitter_off:  soc=0.353 → in_band=True  ✓ goal achieved
After safe_mode:        soc=0.369 → in_band=True  ✓ goal achieved
After heater_on:        soc=0.342 → in_band=False ✗
```
Any algorithm that tries even one command at random has an 80% chance of immediately succeeding. Hill Climbing still gets 100% because it tries many random sequences.

**`single_power` and `single_power_sun` — Solved at depth 2 every time.** The orbit phases chosen put both scenarios in sunlit arc with enough solar power that any 2-step load reduction restores SoC above 0.35.

**`cascade` — Solved at depth 2 every time.** Despite being described as the "hardest" scenario, turning off the payload + one other command always resolves both the thermal and power issues simultaneously.

**`single_thermal` is the only genuinely hard scenario** — depth 3 required, Hill Climbing fails 60% of the time, and it takes all 3 correct commands in the right order.

**Root cause:** The fault magnitudes and orbit phases were calibrated to be solvable (after fixing bugs), but the calibration overshot and made most scenarios trivially easy. The initial SoC deficit in `single_load` (0.30 vs 0.35 nominal) is only 0.05 — small enough to be erased by the power saved from any single command.

**Impact:** Because 5 of 6 scenarios are solved identically by all algorithms, the sweep mostly measures noise. The 100% success rate across all algorithms is real — but it is because the problems are too easy, not because the algorithms are equally capable.

**Fix needed:** Make scenarios harder:
- Increase SoC deficit deeper (e.g., `soc_override=0.20` for single_load)  
- Put power scenarios in deeper eclipse (orbit_phase=0.70) so solar is not immediately available  
- Add a "wait" command that simulates multiple physics steps without issuing a command (forces the search to plan longer horizons)  
- Add scenarios that require recovering from hard constraint violations without crossing them (tight margins)

---

## Issue 5 — `single_thermal` and `single_thermal_sun` Are Effectively Identical (REDUNDANT)

**What we see:** Both scenarios produce **the same initial state** and **the same solution path**.

```
single_thermal     initial: T_pay=58.0, soc=0.75, T_bat=15.0
single_thermal_sun initial: T_pay=58.0, soc=0.75, T_bat=15.0

single_thermal     solution: [payload_off, transmitter_off, low_power_mode], cost=18.35
single_thermal_sun solution: [payload_off, transmitter_off, low_power_mode], cost=18.35
```

**Root cause:** The `orbit_phase` parameter changes the *starting point* in the orbit cycle, which changes the solar flux. However, the thermal recovery path (`payload_off, transmitter_off, low_power_mode`) does not depend on solar flux at all — it succeeds by reducing heat generation, not by waiting for solar power to recharge. So the different orbit phases produce no difference in outcome.

**The solar flux at t=0 IS different** (40 W/m² for eclipse-onset vs 130 W/m² for sunlit), but this only matters for SoC recovery scenarios — not thermal ones.

**Impact:** The "sunlit" variant is not adding any new information to the sweep.

**Fix:** The sunlit variant of thermal scenarios should use a different fault profile that also has an SoC deficit, so that the orbit phase matters. Or replace with a scenario where the thermal fault is severe enough to require waiting for temperature to drop over multiple physics steps.

---

## Issue 6 — Hill Climbing Records `solution_cost=0.0` for Failed Runs (MISLEADING)

**What we see:**
```
hill_climbing, single_thermal, seeds 0/3/4/7/8/9: success=False, cost=0.0, path_length=0
```

**Root cause:** When Hill Climbing fails (returns `success=False`), `result.path` is `None`. The `compute_metrics` function initialises `solution_cost` to `0.0` as a default, and since there is no path to compute the real cost from, it stays 0. This makes failed runs look like they found a zero-cost solution.

**Impact:** Any mean/median of `solution_cost` that includes failed runs is meaningless — it mixes "no solution" (0.0) with "found solution" (18.35). This artificially deflates the reported cost for Hill Climbing.

**Fix:** Change the default for failed runs to `float('inf')` or `float('nan')` in `MetricsRecord`, so failed runs are clearly distinguished.

---

## Summary Table

| # | Issue | Severity | Affects |
|---|-------|----------|---------|
| 1 | Duplicate rows in CSV from repeated runs | 🔴 High | All aggregate statistics biased |
| 2 | Seed has no effect on A\*/IDA\*/RBFS | 🟠 Medium | 10 seeds = 10 identical rows; wasted compute |
| 3 | `safety_margin` never varies between algorithms | 🟡 Low | Metric useless for comparison |
| 4 | Most scenarios solved at depth 1–2 by any algorithm | 🔴 High | 100% success is trivial, not meaningful |
| 5 | `single_thermal` and `single_thermal_sun` are identical | 🟠 Medium | Redundant scenario, no new information |
| 6 | Failed HC runs show `cost=0.0` instead of NaN/inf | 🟡 Low | Cost averages misleading for HC |

---

## Recommended Next Steps

1. **Immediately:** Delete `experiments/results/results.csv` and re-run a clean sweep
2. **Short-term:** Harden the scenarios — deeper SoC deficits, eclipse-only for power faults, remove the trivial single_load setup
3. **Short-term:** Fix `MetricsRecord` default cost for failures (`nan` not `0.0`)
4. **Medium-term:** Only run multiple seeds for stochastic algorithms; run 1 seed for A\*/IDA\*/RBFS
5. **Medium-term:** Add a "wait N steps" pseudo-command to force longer planning horizons

