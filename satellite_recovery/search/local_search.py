"""
Local search baselines: Hill Climbing (with restarts) and Simulated Annealing.

Both algorithms operate on complete command *sequences* rather than partial
paths.  A candidate is a list of command names of variable length ≤ max_depth.
Simulation evaluates each candidate by executing it from the initial state and
scoring the resulting trajectory.

Objective function
------------------
    J(candidate) = g + λ · R_max + penalty

    g      : total path cost α·Στ + β·Σε of executed commands
    R_max  : maximum anomaly score along the simulated trajectory
    penalty: large constant if any hard constraint is violated,
             or if the trajectory does not reach the goal within horizon

Neighbourhood operators
-----------------------
    swap    — swap two randomly chosen commands
    replace — replace one command with a random alternative
    insert  — insert a random legal command at a random position
    delete  — remove a random command

Hill Climbing (Section 6.2)
--------------------------
    - Start from a random candidate
    - Evaluate all neighbours (up to n_neighbours)
    - Accept the best improving neighbour
    - Restart when stuck (random restarts)
    - Budget counted in objective evaluations (proxy for scorer calls)

Simulated Annealing (Section 6.2)
----------------------------------
    - Same neighbourhood, Boltzmann acceptance: exp(-ΔJ / T)
    - Temperature schedule: geometric cooling T ← T · α_cool

Both algorithms share the same _evaluate() method and _neighbours() generator
so the comparison is fair.

Note on scorer calls
--------------------
Each evaluation calls scorer.score_batch() once on the full trajectory window
sequence.  The number of evaluations equals the number of scorer-call groups;
the SearchStats.scorer_calls field counts individual window scores.
"""

from __future__ import annotations

import math
import random
import time as _time
from typing import Optional

from .problem import Node, RecoveryProblem, SearchResult, SearchStats
from ..simulator.spacecraft import SpacecraftState
from ..simulator.commands import legal_actions, COMMANDS, ALL_COMMAND_NAMES


# ---------------------------------------------------------------------------
# Trajectory evaluation
# ---------------------------------------------------------------------------

_BIG_PENALTY = 1e9


def _simulate_sequence(
    initial: SpacecraftState,
    commands: list[str],
    problem: RecoveryProblem,
) -> tuple[list[SpacecraftState], float, bool, bool, list[str]]:
    """
    Execute *commands* from *initial* and return
    (trajectory, g, goal_reached, constraint_violated, applied_commands).

    Illegal commands (precondition not met) are silently skipped and
    excluded from *applied_commands* so path reconstruction stays consistent.
    """
    traj: list[SpacecraftState]  = [initial]
    applied: list[str]           = []
    g    = 0.0
    s    = initial

    for cmd in commands:
        if cmd not in legal_actions(s):
            continue
        s = problem.transition(s, cmd)
        g += problem.action_cost(cmd)
        traj.append(s)
        applied.append(cmd)
        if problem.is_infeasible(s):
            return traj, g, False, True, applied
    goal = problem.goal_test(traj[-1])
    return traj, g, goal, False, applied


def _evaluate(
    initial: SpacecraftState,
    commands: list[str],
    problem: RecoveryProblem,
    scorer,
    lambda_risk: float,
    stats: SearchStats,
) -> float:
    """Return J(candidate); lower is better."""
    traj, g, goal_reached, violated, _ = _simulate_sequence(initial, commands, problem)

    if violated:
        return _BIG_PENALTY

    # Score every window along the trajectory
    windows = _build_windows(traj, problem.window_size)
    if scorer is not None and windows:
        scores = scorer.score_batch(windows)
        stats.scorer_calls += len(windows)
        R_max = float(max(scores))
    else:
        R_max = 0.0

    penalty = 0.0 if goal_reached else (_BIG_PENALTY * 0.1)
    return g + lambda_risk * R_max + penalty


def _build_windows(
    traj: list[SpacecraftState],
    window_size: int,
) -> list[list[SpacecraftState]]:
    """Build all sliding windows of size *window_size* over *traj*."""
    if len(traj) < window_size:
        # Pad with the first state
        padded = [traj[0]] * (window_size - len(traj)) + traj
        return [padded]
    return [
        traj[max(0, i - window_size + 1): i + 1]
        for i in range(window_size - 1, len(traj))
    ]


# ---------------------------------------------------------------------------
# Neighbourhood generation
# ---------------------------------------------------------------------------

def _neighbours(
    commands: list[str],
    n: int,
    max_depth: int,
    rng: random.Random,
) -> list[list[str]]:
    """
    Return up to *n* neighbours of *commands* via four mutation operators.
    """
    nbrs: list[list[str]] = []
    all_cmds = list(ALL_COMMAND_NAMES)
    L = len(commands)

    # 1. Replace
    if L > 0:
        for _ in range(n // 4 + 1):
            c = list(commands)
            i = rng.randrange(L)
            c[i] = rng.choice(all_cmds)
            nbrs.append(c)

    # 2. Swap
    if L >= 2:
        for _ in range(n // 4 + 1):
            c = list(commands)
            i, j = rng.sample(range(L), 2)
            c[i], c[j] = c[j], c[i]
            nbrs.append(c)

    # 3. Insert
    if L < max_depth:
        for _ in range(n // 4 + 1):
            c = list(commands)
            pos = rng.randint(0, L)
            c.insert(pos, rng.choice(all_cmds))
            nbrs.append(c)

    # 4. Delete
    if L > 1:
        for _ in range(n // 4 + 1):
            c = list(commands)
            c.pop(rng.randrange(L))
            nbrs.append(c)

    rng.shuffle(nbrs)
    return nbrs[:n]


def _random_candidate(max_depth: int, rng: random.Random) -> list[str]:
    length = rng.randint(1, max_depth)
    return [rng.choice(list(ALL_COMMAND_NAMES)) for _ in range(length)]


# ---------------------------------------------------------------------------
# Hill Climbing
# ---------------------------------------------------------------------------

class HillClimbing:
    """
    Steepest-ascent hill climbing with random restarts.

    Each iteration evaluates all neighbours; the best improving one is
    accepted.  When stuck, a new random candidate is drawn.

    Parameters
    ----------
    budget_evals : int
        Maximum number of objective-function evaluations.
    max_depth    : int
        Maximum command sequence length.
    n_neighbours : int
        Number of neighbours to evaluate per step.
    n_restarts   : int
        Maximum number of restarts (each restart starts fresh).
    lambda_risk  : float
    """

    NAME = 'hill_climbing'

    def __init__(
        self,
        budget_evals: int   = 20_000,
        max_depth:    int   = 20,
        n_neighbours: int   = 20,
        lambda_risk:  float = 50.0,
    ) -> None:
        self.budget_evals = budget_evals
        self.max_depth    = max_depth
        self.n_neighbours = n_neighbours
        self.lambda_risk  = lambda_risk

    # ------------------------------------------------------------------
    def search(
        self,
        problem: RecoveryProblem,
        scorer,
        seed: int = 0,
    ) -> SearchResult:
        stats   = SearchStats()
        t_start = _time.perf_counter()
        rng     = random.Random(seed)
        evals   = 0

        best_cmds: list[str]   = []
        best_J:    float       = _BIG_PENALTY
        best_goal: bool        = False

        # Unlimited restarts until budget is exhausted.
        # Each restart: draw a fresh random candidate then climb until stuck.
        while evals < self.budget_evals:
            current_cmds = _random_candidate(self.max_depth, rng)
            current_J    = _evaluate(
                problem.initial_state, current_cmds, problem,
                scorer, self.lambda_risk, stats,
            )
            evals += 1
            if evals >= self.budget_evals:
                break

            improved = True
            while improved and evals < self.budget_evals:
                improved   = False
                neighbours = _neighbours(current_cmds, self.n_neighbours,
                                         self.max_depth, rng)
                for nbr in neighbours:
                    if evals >= self.budget_evals:
                        break
                    J = _evaluate(problem.initial_state, nbr, problem,
                                  scorer, self.lambda_risk, stats)
                    evals += 1
                    stats.nodes_expanded += 1
                    if J < current_J:
                        current_cmds = nbr
                        current_J    = J
                        improved     = True
                        break   # take first improvement then re-expand

            if current_J < best_J:
                best_J    = current_J
                best_cmds = current_cmds
                best_goal = (best_J < _BIG_PENALTY * 0.5)   # quick success check
                if best_goal and best_J < 1.0:
                    break   # found a very good solution, stop early

        # Reconstruct final trajectory
        traj, g, goal, violated, applied = _simulate_sequence(
            problem.initial_state, best_cmds, problem
        )
        stats.wall_time_s = _time.perf_counter() - t_start

        path = [(traj[0], None)] + [(s, a) for s, a in zip(traj[1:], applied)]
        return SearchResult(
            path=path,
            success=goal and not violated,
            stats=stats,
            algorithm=self.NAME,
            heuristic_variant='local',
            lambda_risk=self.lambda_risk,
            solution_g=g,
        )


# ---------------------------------------------------------------------------
# Simulated Annealing
# ---------------------------------------------------------------------------

class SimulatedAnnealing:
    """
    Simulated annealing on the command-sequence space.

    Acceptance probability: exp(-ΔJ / T), geometric cooling.

    Parameters
    ----------
    budget_evals : int
    max_depth    : int
    T_init       : float  — initial temperature
    T_final      : float  — stop when T < T_final
    alpha_cool   : float  — geometric cooling factor per step
    lambda_risk  : float
    """

    NAME = 'simulated_annealing'

    def __init__(
        self,
        budget_evals: int   = 20_000,
        max_depth:    int   = 20,
        T_init:       float = 500.0,
        T_final:      float = 1.0,
        alpha_cool:   float = 0.997,
        lambda_risk:  float = 50.0,
    ) -> None:
        self.budget_evals = budget_evals
        self.max_depth    = max_depth
        self.T_init       = T_init
        self.T_final      = T_final
        self.alpha_cool   = alpha_cool
        self.lambda_risk  = lambda_risk

    # ------------------------------------------------------------------
    def search(
        self,
        problem: RecoveryProblem,
        scorer,
        seed: int = 0,
    ) -> SearchResult:
        stats   = SearchStats()
        t_start = _time.perf_counter()
        rng     = random.Random(seed)

        current_cmds = _random_candidate(self.max_depth, rng)
        current_J    = _evaluate(
            problem.initial_state, current_cmds, problem,
            scorer, self.lambda_risk, stats,
        )
        stats.nodes_expanded += 1

        best_cmds = list(current_cmds)
        best_J    = current_J
        T         = self.T_init
        evals     = 1

        while evals < self.budget_evals and T > self.T_final:
            # Pick one random neighbour
            nbr = _neighbours(current_cmds, 1, self.max_depth, rng)
            if not nbr:
                break
            candidate = nbr[0]

            J_new = _evaluate(
                problem.initial_state, candidate, problem,
                scorer, self.lambda_risk, stats,
            )
            evals += 1
            stats.nodes_expanded += 1

            delta = J_new - current_J
            if delta < 0 or rng.random() < math.exp(-delta / T):
                current_cmds = candidate
                current_J    = J_new

            if current_J < best_J:
                best_J    = current_J
                best_cmds = list(current_cmds)

            T *= self.alpha_cool

        # Reconstruct final trajectory
        traj, g, goal, violated, applied = _simulate_sequence(
            problem.initial_state, best_cmds, problem
        )
        stats.wall_time_s = _time.perf_counter() - t_start

        path = [(traj[0], None)] + [(s, a) for s, a in zip(traj[1:], applied)]
        return SearchResult(
            path=path,
            success=goal and not violated,
            stats=stats,
            algorithm=self.NAME,
            heuristic_variant='local',
            lambda_risk=self.lambda_risk,
            solution_g=g,
        )
