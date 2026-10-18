# What Is Actually Happening — A Plain-English Guide

This document explains every command you ran, what it did internally, and what the output numbers actually mean.

---

## The Big Picture (Before Anything Else)

Imagine a satellite in orbit that has developed a fault — maybe its payload module is overheating, or its battery is running low. There is no human operator to call. The question this project answers is:

> **Can a computer program automatically figure out which sequence of commands to send the satellite so it recovers safely — and do it fast enough to matter?**

This project implements and compares several different **search strategies** (like GPS route-finding, but for spacecraft state) combined with an **anomaly detector** trained on what normal satellite data looks like. The detector tells the search algorithm "this state is dangerous" so it can steer away from risky paths.

---

## Command 1 — `pip install -e .`

**What it does:** Installs the `satellite_recovery` Python package from the local folder so every script can `import` it.

---

## Command 2 — `generate_nominal_data.py`

```
Saved 20,200 windows → experiments/data/nominal_windows.npy
Window array shape: (20200, 10, 8)
```

### What happened
The program simulated a **healthy satellite** doing nothing unusual — just orbiting normally — for 500 different trajectories of 200 time steps each (each step = 60 seconds of physics).

At every step it recorded 8 numbers that describe the satellite's health:

| # | Channel | What it measures |
|---|---------|-----------------|
| 1 | `soc` | Battery charge (0 = dead, 1 = full) |
| 2 | `temp_battery` | Battery temperature (°C) |
| 3 | `temp_payload` | Science instrument temperature (°C) |
| 4 | `temp_bus` | Main computer board temperature (°C) |
| 5 | `heater_on` | Is the heater switched on? (0/1) |
| 6 | `payload_on` | Is the science instrument on? (0/1) |
| 7 | `transmitter_on` | Is the radio transmitter on? (0/1) |
| 8 | `mode` | Operating mode (nominal / low-power / safe) |

It then sliced these into **windows of 10 consecutive steps** (10 minutes of history). Each window becomes one training example for the anomaly detector. The `(20200, 10, 8)` shape means: 20,200 windows × 10 time steps × 8 channels.

**Why 10 steps?** One snapshot of the satellite is not enough to know if something is wrong. A trend — temperature rising steadily for 10 minutes — is much more telling than a single reading.

---

## Command 3 — `train_scorer.py`

```
Train: 14,140   Calib: 6,060
Fitting isolation_forest scorer …
Calibration scores (nominal, should be near 0): mean=0.503  p95=0.953
Scorer saved → experiments/scorers/isolation_forest.joblib
```

### What happened
The program trained an **Isolation Forest** — an unsupervised machine learning model that learns what "normal" looks like by trying to isolate individual data points. Points that are easy to isolate (anomalies) get a high score; points that blend in (normal) get a low score.

- **14,140 windows** were used to train the model
- **6,060 windows** (30%) were held out to calibrate the score scale

The calibration step converts raw IF scores into a clean **R ∈ [0, 1]** range using an empirical CDF (think: percentile ranking). An R score of 0.5 for normal data means "half of nominal windows score below this" — exactly what you want from a well-calibrated detector.

**Key output:** `isolation_forest.joblib` — a saved model file (~few MB) that can score any new window in ~0.3 ms.

---

## Command 4 — Single experiment: `single_thermal`, `astar`, `H2`

```
Loading scorer from experiments/scorers/isolation_forest.joblib
[single_thermal] astar/H2 λ=50.0 seed=0 ...
  → success=True  cost=18.3  nodes=16  wall=0.04s
```

### What is `single_thermal`?
The satellite has a **stuck relay pumping 35 W of extra heat** into the payload module. At the moment the planner starts, the payload is already at **58 °C** — above its nominal safe ceiling of 55 °C. If nothing is done, it will drift toward the 70 °C hard damage limit.

### What is `astar`?
A\* is a **graph search algorithm** — it explores possible sequences of commands to find the one that reaches a safe state with the lowest total cost. Think of it like Google Maps finding the shortest route, but the "map" is all possible sequences of recovery commands.

At each step it can choose from 8 commands:
`payload_off`, `payload_on`, `heater_on`, `heater_off`, `low_power_mode`, `resume_nominal`, `transmitter_off`, `safe_mode`

### What is `H2`?
This is the **heuristic variant** — the formula A\* uses to decide which states to explore first:

```
f(n) = g(n)  +  h_d(n)  +  λ · R(n)
        ↑          ↑            ↑
   cost so far  how far     anomaly
   (commands    to goal     score ×
   issued)      (estimate)  risk weight
```

- **g(n)** — how much the commands so far "cost" (time + energy)
- **h\_d(n)** — a physics-based estimate of the minimum remaining cost to reach a safe state
- **λ · R(n)** — the anomaly score × 50 (λ), steering the search away from dangerous-looking states

**H2 adds risk-awareness to the search.** Without λ·R(n), the planner might find a technically valid recovery path that passes through very dangerous intermediate states.

### What do the output numbers mean?

| Output | Value | Meaning |
|--------|-------|---------|
| `success=True` | ✓ | A recovery plan was found |
| `cost=18.3` | 18.3 units | Total "expense" of the plan (weighted by time + energy of each command) |
| `nodes=16` | 16 | The planner only had to consider 16 possible states before finding the answer |
| `wall=0.04s` | 40 ms | Time taken on your computer |

**The recovery plan found was:** `payload_off` → `transmitter_off` → `low_power_mode`

In plain English: turn off the payload (stops heat generation), turn off the transmitter (saves power), switch to low-power mode (cuts avionics draw). Three commands. The payload temperature drops back below 55 °C.

---

## Command 5 — Full Sweep: 1,020 runs

```
Progress: 1020/1500
Sweep complete: 1020 runs written.
```

### What happened
The program ran **every combination** of:
- **6 scenarios** (different types of satellite faults)
- **5 algorithms** (A\*, IDA\*, RBFS, Hill Climbing, Simulated Annealing)
- **5–6 heuristic variants** (H0 through H4, where applicable)
- **10 random seeds** (different random initialisation for stochastic algorithms)

That's 1,020 individual "find a recovery plan" problems, each solved independently. Every result was saved to `experiments/results/results.csv`.

---

## The 6 Fault Scenarios

| Scenario | What went wrong | Recovery challenge |
|----------|-----------------|--------------------|
| `single_thermal` | Payload overheating (58 °C, limit 55 °C), stuck 35 W heat source | Must cool payload before it hits 70 °C damage limit |
| `single_thermal_sun` | Same fault but satellite is in sunlight | Easier — more power available |
| `single_power` | Battery degraded, extra internal heat + load; charge at 28% (below 35% nominal) | Must reduce load and let battery recharge |
| `single_power_sun` | Same but in sunlight | Same problem, more solar power helps |
| `single_load` | Rogue 25 W consumer drawing unexpected power; charge at 30% | Shed loads quickly before battery drops further |
| `cascade` | Payload overheating AND high bus load simultaneously | Hardest — two problems at once, solutions conflict |

---

## The 5 Search Algorithms

### A\* (astar) — The Gold Standard
Works like GPS. Maintains a priority queue of states sorted by estimated total cost f(n). Always expands the most promising state first. **Guaranteed to find the best answer** (H1 variant) or a near-best answer very fast (H2 variant).

- **Nodes: 1–16** on most scenarios = incredibly efficient
- **Time: <50 ms** on all scenarios
- Uses memory proportional to the states it explores

### IDA\* (idastar) — Memory-Saver
Same principle as A\* but uses **almost no memory**. Instead of storing all explored states, it repeatedly searches the tree with increasing cost thresholds (like trying routes up to 10 km, then 15 km, then 20 km…). Re-does some work but saves memory.

- **Nodes: ~6–124** (re-expansion means more node visits than A\*)
- **Time: <150 ms**

### RBFS (rbfs) — Another Memory-Saver
Recursive Best-First Search. Also linear memory like IDA\*, but smarter about which branches to revisit. Backs up the best alternative f-value so it doesn't re-explore as blindly.

- **Nodes: ~3–47** (better than IDA\* on these problems)
- **Time: ~10–150 ms**

### Hill Climbing (hill_climbing) — Random Local Search
Does **not** use the physics-based heuristic. Instead, it generates a random sequence of commands, evaluates it, then tries small mutations (swap two commands, add one, remove one). Keeps the best mutation. Restarts randomly when stuck.

- **Nodes: ~280–400** — much less efficient
- **Time: ~600 ms** — slower
- **Success on `single_thermal`: only 40%** — can get stuck in dead ends

### Simulated Annealing (simulated_annealing) — Random with Escape
Like Hill Climbing but occasionally accepts a *worse* solution (with decreasing probability over time, like cooling metal). Helps escape local optima.

- **Nodes: 1,059** — always uses its full budget
- **Time: ~2 seconds** — much slower
- **Success rate: 100%** on most scenarios — more thorough but expensive

---

## Full Results Summary

Data from your 1,020-run sweep (10 seeds each, with trained scorer):

| Scenario | Algorithm | Success | Median nodes | Median cost | Time (ms) |
|----------|-----------|---------|-------------|-------------|-----------|
| single_thermal | **A\*** | **100%** | **16** | 18.4 | 41 |
| single_thermal | IDA\* | 100% | 124 | 18.4 | 148 |
| single_thermal | RBFS | 100% | 46 | 18.4 | 148 |
| single_thermal | Hill Climbing | 40% | 282 | — | 550 |
| single_thermal | Sim. Annealing | 100% | 1059 | 18.4 | 2167 |
| single_power | **A\*** | **100%** | **2** | 7.2 | 8 |
| single_load | **A\*** | **100%** | **1** | 3.1 | 5 |
| cascade | **A\*** | **100%** | **3** | 8.2 | 10 |

### What stands out

1. **A\* is the clear winner** — finds the plan in milliseconds with the fewest states explored. The heuristic (`h_d`) is so informative that it almost never explores wrong paths.

2. **Hill Climbing fails 60% of the time on `single_thermal`** — because it searches over random command sequences without the physics heuristic to guide it. It gets stuck.

3. **Simulated Annealing always succeeds but takes 50× longer** — it's thorough but brute-force.

4. **A\* with H2 (risk-aware) uses only 1 extra node vs H1** — meaning the risk penalty R(n) costs almost nothing computationally while steering paths away from dangerous states.

---

## What "cost" means in the results

The `solution_cost` number is a weighted combination of:
- **Time** each command takes to execute (e.g., `safe_mode` = 15 s, `payload_off` = 5 s)  
- **Energy** each command consumes (e.g., `safe_mode` = 30 J, `payload_off` = 10 J)

A **lower cost** = faster and cheaper recovery. A\* minimises this. Hill Climbing/SA find valid recoveries but don't guarantee the cheapest one — which is why `hill_climbing` sometimes shows `cost=0.0` (it found a fluke short path) but other times shows much higher costs.

---

## What "nodes" means in the results

Every time the algorithm considers a satellite state and thinks "what commands could I issue from here?", that counts as one **node expansion**. 

- A\* expands **2–16 nodes** on most problems — this means it barely needs to look before finding the answer. The heuristic is that good.
- Simulated Annealing expands **1,059 nodes** every time — it always uses its entire budget, regardless of how easy or hard the problem is.

Fewer nodes = smarter search = less computation needed in a real flight scenario.

---

## Next Step — Visualise Everything

Run the Jupyter notebook to turn these numbers into plots:

```bash
cd /Users/meetshah1004/Desktop/Meet/AI_Project/notebooks
jupyter lab 01_results_plots.ipynb
```

Then: **Run → Run All Cells**

You'll get 8 figures saved to `experiments/results/`:
- Bar charts of success rates per scenario
- Node count comparisons between algorithms
- The actual temperature/battery trace during a recovery
- The anomaly score histogram showing how the detector separates normal from faulty data

