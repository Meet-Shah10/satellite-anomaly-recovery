# Risk-Aware Dynamic A* for Satellite Anomaly Recovery

A state-space search formulation where an unsupervised time-series anomaly detector supplies the risk term of the heuristic.

---

## 1. One-Paragraph Pitch

Unsupervised models detect spacecraft telemetry anomalies well. Turning a detection into a safe, multi-step recovery plan remains unsolved. Onboard recovery today relies on static decision trees (rule-based fault protection) that score or trigger actions one at a time, so they fail when a fault cascades. This paper formulates recovery as informed state-space search. Each node is a full subsystem state, each edge is a command, and the goal is any state where telemetry returns inside nominal limits. A* searches for the cheapest command sequence. A learned anomaly score, recomputed on every simulated state the search visits, adds a risk term to the heuristic, so the search steers away from trajectories that drift toward failure. Machine learning only evaluates states. A classical, inspectable algorithm chooses the commands, which keeps the decision path explainable.

---

## 2. Problem and Gap

**What works today.** Unsupervised detectors (isolation-based, reconstruction-based, forecasting-residual, and statistical methods) flag anomalous telemetry on benchmark data such as the ESA Anomaly Detection Benchmark.

**What fails today.** Recovery logic on board is a fixed mapping from fault signature to response. It has three weaknesses:

1. It evaluates one action at a time, so it cannot see that shedding a payload now forces a thermal violation three steps later.
2. It was written for anticipated single faults, so cascading degradation falls outside its design envelope.
3. It ignores the live health of the system. The same response fires whether the battery is at 80% or 25%.

**Why not reinforcement learning.** A policy network gives no guarantee that it satisfies power, thermal, or timing limits, and operators cannot audit why it chose a command. Aerospace certification culture demands both guarantees and explanations. Search provides them.

**Research question.** Can an A*-style search, guided by a heuristic that includes a live anomaly-derived risk term, produce recovery sequences that keep larger safety margins than rule-based and statically guided baselines, within the compute limits of flight-class hardware?

---

## 3. Formal Problem Formulation

This section follows the standard AI search-problem template (initial state, actions, transition model, goal test, path cost), which makes the mapping to the course direct.

**State.** A node holds the subsystem state vector

$$x = (T_1, \dots, T_m, \; SoC, \; P_{bus}, \; \omega_{rw}, \; \text{mode flags}, \dots)$$

plus a short window of the preceding states $W_n = (x_{t-k+1}, \dots, x_t)$. The window is necessary because a time-series anomaly detector scores a trajectory segment, not a single point.

**Initial state.** The state at the moment the detector raises an alarm.

**Actions.** A finite command set $A(x)$ with preconditions: shed payload, switch heater mode, reorient solar array, desaturate reaction wheel, switch to safe mode, reboot a subsystem, and so on. A command is legal only if its preconditions hold in $x$.

**Transition model.** $x' = T(x, a)$ comes from a simplified subsystem simulator (power balance, thermal RC network, momentum budget). This simulator is a required component of the study (see Section 8).

**Goal test.** $G(x)$ is true when every monitored parameter lies inside its nominal safety band and the anomaly score stays below a threshold for a short confirmation horizon.

**Hard constraints.** A node is infeasible, and the search discards it, if it violates any of the following:

- Battery state of charge below a floor.
- A thermal limit crossed.
- Total elapsed time past the deadline (for example, the next eclipse or ground-contact window).
- Peak power draw above the bus limit.

**Path cost.** For a command sequence $a_1, \dots, a_n$:

$$g(n) = \sum_{i=1}^{n} \big( \alpha \, \tau(a_i) + \beta \, \epsilon(a_i) \big)$$

where $\tau$ is latency in seconds, $\epsilon$ is energy in joules, and $\alpha, \beta$ are weights.

---

## 4. The Dynamic Heuristic

### 4.1 Formulation

$$f(n) = g(n) + h(n), \qquad h(n) = h_d(n) + \lambda \, R(n)$$

- $h_d(n)$ is a goal-distance estimate: a lower bound on the cost still needed to bring the worst out-of-band parameter back into its nominal band, using the maximum achievable correction rate of the relevant actuators. This term is static and cheap.
- $R(n) \in [0,1]$ is the **dynamic risk term**: the unsupervised anomaly score of the simulated state window $W_n$, calibrated against nominal validation data (for example, percentile rank among nominal scores).
- $\lambda$ converts risk into cost units (seconds and joules).

When a command sequence pushes thermal or power state toward failure, $R(n)$ rises, $f(n)$ rises, and the search expands safer branches first.

### 4.2 Design decision the paper must defend

Using the raw anomaly score alone as $h(n)$ has two problems that a reviewer will find:

1. **Unit mismatch.** $g$ measures seconds and joules. An anomaly score has no unit. Adding them directly makes the trade-off arbitrary. The weight $\lambda$ fixes this explicitly.
2. **No admissibility.** A learned score does not lower-bound the true remaining cost, so the classical optimality proof for A* no longer applies. The paper therefore claims **bounded-suboptimal, risk-aware search**, not classical optimal search. The formal guarantees come from elsewhere (Section 4.3).

A related point: a high $h(n)$ does not prune a branch in A*. It delays expansion. Hard pruning happens only through the constraint checks in Section 3. The paper should say "deprioritizes" for risk and "prunes" for constraint violation.

### 4.3 What the method guarantees

| Property | Holds? | Reason |
|---|---|---|
| Hard constraints satisfied (on the model) | Yes | Constraint checks reject infeasible nodes before expansion |
| Termination | Yes | Depth bound and finite action set |
| Completeness within the depth bound | Yes | Finite graph under the bound, with duplicate detection |
| Optimal under true cost | No | Learned $R(n)$ is not admissible |
| Bounded suboptimality | Yes, conditional | If $h_d$ is admissible and the risk term is treated as a weight on an admissible estimate, the result behaves like Weighted A* with a known factor |

### 4.4 Heuristic variants to compare

The experiments should test the variants head to head, because the comparison is the paper's contribution.

| ID | Heuristic | Purpose |
|---|---|---|
| H0 | $h = 0$ | Reduces A* to uniform-cost search (baseline) |
| H1 | $h = h_d$ (static) | Standard A* with a fixed heuristic |
| H2 | $h = h_d + \lambda R(n)$ | **Proposed**: dynamic risk-weighted heuristic |
| H3 | Risk folded into edge cost: $g' = g + \lambda \sum R(n_i)$, $h = h_d$ | Alternative that restores optimality on the augmented cost |
| H4 | H2 with Weighted A*: $f = g + w \cdot h$ | Anytime and bounded-suboptimal trade-off |

H3 deserves attention. It keeps A* optimal with respect to a cost that includes risk, so it is the theoretically cleaner option. If H2 and H3 perform similarly, the paper can recommend H3. If H2 explores fewer nodes, H2 earns its place.

---

## 5. Algorithm (Pseudocode)

```
DYNAMIC-ASTAR(x0, budget_nodes, max_depth, lambda)
    open   <- priority queue ordered by f
    closed <- hash set of visited state signatures
    cache  <- map from state signature to R   // avoids rescoring
    push node(x0, W0, g=0, parent=None) with f = hd(x0) + lambda * score(W0)
    while open is not empty and nodes_expanded < budget_nodes:
        n <- pop lowest f from open
        if GOAL(n.x): return PATH(n)
        if n.signature in closed: continue
        add n.signature to closed
        if n.depth >= max_depth: continue
        for a in LEGAL-ACTIONS(n.x):
            x' <- TRANSITION(n.x, a)
            if VIOLATES-HARD-CONSTRAINT(x', n.g + cost(a)): continue
            W' <- APPEND(n.W, x')
            if signature(x') not in cache:
                cache[signature(x')] <- NORMALIZED-ANOMALY-SCORE(W')
            R' <- cache[signature(x')]
            g' <- n.g + cost(a)
            f' <- g' + hd(x') + lambda * R'
            push node(x', W', g', parent=n) with f'
    return BEST-PARTIAL-PATH(open)   // lowest-risk node reached within budget
```

The anytime fallback on the last line matters on a spacecraft. A bounded search that returns the best partial plan beats one that returns nothing.

---

## 6. How This Maps to the AI Course

### 6.1 Concept map

| Course topic | Role in this project |
|---|---|
| Intelligent agents (PEAS, agent types) | The recovery system is a **utility-based, model-based agent**. Environment: spacecraft. Sensors: telemetry. Actuators: commands. Performance: safety margin, time, power. The static decision tree is a **simple reflex agent**, which is exactly why it fails on cascades |
| Problem formulation | Section 3 follows the standard template: states, actions, transition model, goal test, path cost |
| Uninformed search (BFS, DFS, UCS, IDS) | UCS is baseline H0. BFS and DFS show the state-space explosion that motivates heuristics |
| Informed search (Greedy best-first, A*) | A* is the core algorithm. Greedy best-first serves as an ablation: it follows $R(n)$ only and ignores cost |
| Heuristic design (admissibility, consistency, dominance) | Section 4.2 and 4.3 analyze exactly these properties for a learned heuristic |
| Memory-bounded search (IDA*, RBFS, SMA*) | Flight microcontrollers have tiny memory. See 6.3 |
| Local search (hill climbing, simulated annealing, beam search) | Fast, low-memory alternatives and baselines. See 6.2 |
| Constraint satisfaction | Power, thermal, and timing limits form a constraint set that gates node expansion |
| Knowledge-based agents and rules | The rule-based recovery baseline is a hand-coded production system |
| Uncertainty and probabilistic reasoning | Model error and sensor noise motivate calibrated risk scores and the replanning loop |
| Machine learning in AI | The unsupervised anomaly detector supplies $R(n)$ |

### 6.2 Hill climbing and local search

Hill climbing can run directly on the recovery problem. Start from a candidate command sequence, mutate it (swap, insert, delete a command), and keep the change if the objective $J = g + \lambda R_{max}$ improves. It uses almost no memory and returns a plan quickly, which makes it attractive for onboard use.

It fails exactly where this problem is hardest:

- **Local optima.** A cascading fault creates plans where every single-command change looks worse, even though a different multi-step sequence is much safer. Shedding a load may raise temperature briefly before it lowers power draw.
- **Plateaus.** Many sequences produce the same score until a threshold crossing.
- **No completeness guarantee.** It can miss a feasible recovery that exists.

Experimental plan: include hill climbing, hill climbing with random restarts, and simulated annealing as baselines. The expected result is that they match A* on single, isolated faults and lose on cascades. That result supports the claim that systematic search is worth its cost.

### 6.3 RBFS and IDA*

Standard A* stores every generated node, so memory grows exponentially in the worst case. Recursive Best-First Search keeps only the current path and the best alternative $f$-value at each level, so memory grows linearly with depth. IDA* does the same with an iteratively raised $f$ cutoff. Both suit a processor with a few megabytes of RAM.

Their cost is re-expansion: they regenerate nodes they discarded. In this project that cost multiplies, because **every expansion calls the anomaly scorer**, and the scorer dominates runtime. Two mitigations apply:

1. A small cache keyed by state signature (the `cache` map in Section 5), sized to the available memory.
2. A lightweight scorer, such as a distilled or quantized version of the detector, used inside the search loop.

RBFS also tolerates a heuristic whose $f$-values do not increase monotonically along a path, because it backs up the best child value to the parent. A learned $R(n)$ produces exactly this behavior, which is a technical argument for RBFS over IDA* here.

The study measures this directly: peak memory, nodes expanded, scorer calls, and wall-clock time for A*, IDA*, and RBFS under the same heuristic.

### 6.4 Algorithm comparison

| Algorithm | Memory | Complete | Optimal | Uses dynamic $R$ | Role in the study |
|---|---|---|---|---|---|
| Rule-based tree | Constant | No | No | No | Operational baseline |
| Hill climbing (and restarts) | Constant | No | No | Via objective | Local-search baseline |
| Simulated annealing | Constant | Probabilistic | No | Via objective | Local-search baseline |
| Greedy best-first | Exponential | Not guaranteed | No | Yes | Ablation |
| Uniform-cost search | Exponential | Yes | Yes (on $g$) | No | Search baseline (H0) |
| A* with static $h_d$ | Exponential | Yes | Yes | No | Informed baseline (H1) |
| **A* with $h_d + \lambda R$** | Exponential | Yes (bounded) | Bounded-suboptimal | **Yes** | **Proposed (H2)** |
| Weighted A* | Exponential | Yes | Bounded by $w$ | Yes | Anytime variant (H4) |
| IDA* | Linear in depth | Yes | Conditional | Yes | Memory-bounded |
| RBFS | Linear in depth | Yes | Conditional | Yes | Memory-bounded |

---

## 7. Evaluation Plan

**Scenarios.**

1. Single-fault recovery (thermal runaway, battery degradation, reaction wheel saturation).
2. Cascading faults, where recovering one subsystem stresses another.
3. Degraded-actuator cases, where one commonly used command is unavailable.

**Baselines.** Rule-based recovery, hill climbing with restarts, simulated annealing, UCS, A* with static $h_d$, and the heuristic variants H2 to H4 under A*, IDA*, and RBFS.

**Metrics.**

| Metric | Definition |
|---|---|
| Time to stable state | Simulated seconds from alarm to confirmed goal |
| Safety margin | Minimum distance to any hard limit along the executed path, normalized per parameter |
| Success rate | Fraction of scenarios reaching the goal without a constraint violation |
| Path cost | $g$ of the returned plan |
| Computational overhead | Nodes expanded, scorer calls, wall-clock planning time |
| Peak memory | Maximum open plus closed plus cache size |
| Depth-bound trade-off | Success rate and cost as `max_depth` and `budget_nodes` vary |

**Statistics.** Run each scenario across many seeded fault injections and report medians with confidence intervals. Include ablations on $\lambda$ and on the scorer (full detector versus distilled).

---

## 8. Risks and Open Issues

1. **No action-effect data.** Public telemetry datasets record what happened, not what would have happened under a different command. The search needs a transition model, so the study requires a simulator. State this openly and validate the simulator against recorded nominal behavior.
2. **Scorer distribution shift.** The detector trains on real telemetry. Simulated states may fall outside that distribution and produce meaningless scores. Calibrate $R(n)$ on simulator output for nominal runs, and check that it separates nominal from faulty simulated trajectories before trusting it as a heuristic.
3. **Window requirement.** The detector needs a trajectory window, so the node carries history. This enlarges the node and weakens duplicate detection. Define the state signature carefully (for example, a quantized current state plus a coarse summary of the window).
4. **Scorer latency.** Inference per node may dominate planning time. Section 6.3 describes the mitigations.
5. **Sim-to-real gap.** Constraint satisfaction holds on the model, not on the spacecraft. The paper must word its guarantee as "satisfies constraints under the transition model" and list the model error as a limitation.
6. **Evaluation honesty.** If H3 matches or beats H2, report it.

---

## 9. Questions the Professor Is Likely to Ask

**Why A* and not reinforcement learning?**
A* returns a plan that satisfies hard constraints by construction and whose every step an operator can read. A learned policy gives neither. The learned component here only scores states.

**Is your heuristic admissible?**
No, and the paper does not claim it is. The risk term comes from a learned model. The paper claims bounded-suboptimal, risk-aware search with hard-constraint satisfaction on the model, and it tests a variant (H3) that restores optimality on an augmented cost.

**Does a high anomaly score prune a branch?**
It deprioritizes the branch. Only constraint violations prune. Under a node budget, deprioritized branches may never expand, which has a similar practical effect.

**Why not just use hill climbing? It is cheaper.**
It is cheaper, and the study measures it. Local optima in cascading faults are the expected failure. The experiments quantify the gap.

**Why RBFS when A* works?**
Flight hardware limits memory. RBFS trades memory for re-expansion. The study measures whether the cost is acceptable given expensive scorer calls, and whether caching fixes it.

**What is new here?**
Existing recovery-evaluation work scores candidate actions independently. This work searches jointly over multi-step trajectories and feeds a live anomaly score into the heuristic, with a formal analysis of what guarantees survive that choice.

**How do you know the simulator is realistic enough?**
It is a stated limitation. The validation step compares simulator output against recorded nominal telemetry, and the claims stay scoped to the model.

---

## 10. Suggested Explanation Order for the Meeting

1. State the gap: detection is solved, safe multi-step recovery is not.
2. Show the formulation: node, edge, goal, constraints (Section 3).
3. Show $f(n) = g(n) + h_d(n) + \lambda R(n)$ and explain each term.
4. Present the honest guarantee table (Section 4.3).
5. Walk through the course mapping, with hill climbing as the cheap baseline and RBFS as the memory-bounded variant.
6. Close with the experimental design and the simulator risk.

---

## 11. Limitations and Future Work

- Extend the action model with probabilistic outcomes and use expectimax or Monte Carlo rollouts to handle stochastic transitions.
- Replace full replanning with incremental search (D* Lite, ARA*) when telemetry updates mid-execution.
- Study calibration methods that make $R(n)$ closer to an admissible bound.
- Test on additional spacecraft subsystems and on hardware-in-the-loop benchmarks.
