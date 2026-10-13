"""
IDA* (Iterative Deepening A*) for the satellite recovery problem.

Memory: O(max_depth) — the current path plus one f-bound per level.

Trade-off (Section 6.3 of the specification)
--------------------------------------------
IDA* discards every node not on the current path at each iteration, so
memory is O(d).  The cost is re-expansion: nodes generated in earlier
iterations are regenerated in later ones.  Because the anomaly scorer
dominates wall time, the score cache (state_signature → R) is shared
across all iterations so that a state already scored is never re-scored,
even across iteration boundaries.

RBFS is preferred when R(n) values are non-monotone along a path (common
with a learned scorer), because RBFS backs up the best-child f-value and
avoids some unnecessary re-expansions.  IDA* is retained here as a
baseline memory-bounded variant.

Termination
-----------
    1. A goal node is found → return path.
    2. The f-cutoff exceeds the maximum achievable f → no solution exists
       within max_depth.
    3. The node-expansion budget is exhausted → return None (failure).
"""

from __future__ import annotations

import time as _time
from typing import Optional

from .problem import Node, RecoveryProblem, SearchResult, SearchStats
from .heuristics import h_d, compute_f, augmented_g


class IDAstar:
    """
    Iterative Deepening A* with a dynamic anomaly-score heuristic.

    Parameters
    ----------
    budget_nodes : int
        Hard cap on total expansions across ALL iterations.
    max_depth    : int
        Maximum path depth; also used as a depth pruning guard inside each
        recursive call.
    variant      : str  — 'H0' | 'H1' | 'H2' | 'H3' | 'H4'
    lambda_risk  : float
    w            : float — suboptimality factor for H4
    """

    NAME = 'idastar'

    def __init__(
        self,
        budget_nodes: int   = 5_000,
        max_depth:    int   = 20,
        variant:      str   = 'H2',
        lambda_risk:  float = 50.0,
        w:            float = 1.5,
    ) -> None:
        self.budget_nodes = budget_nodes
        self.max_depth    = max_depth
        self.variant      = variant
        self.lambda_risk  = lambda_risk
        self.w            = w

    # ------------------------------------------------------------------
    def search(
        self,
        problem: RecoveryProblem,
        scorer,
        seed: int = 0,
    ) -> SearchResult:
        stats   = SearchStats()
        t_start = _time.perf_counter()
        cache: dict[tuple, float] = {}

        root      = problem.make_root_node()
        root_risk = self._get_risk(root, list(root.window), scorer, cache, stats)
        root_hd   = h_d(root, problem)
        root_gaug = augmented_g(0.0, root_risk, self.variant, self.lambda_risk)
        f_limit   = compute_f(root_gaug, root_hd, root_risk,
                              self.variant, self.lambda_risk, self.w)

        solution: Optional[Node] = None

        while True:
            if stats.nodes_expanded >= self.budget_nodes:
                break
            found, next_limit, solution = self._dfs(
                root, f_limit, problem, scorer, cache, stats
            )
            if found:
                break
            if next_limit == float('inf'):
                break     # proven: no solution within max_depth
            f_limit = next_limit

        stats.wall_time_s = _time.perf_counter() - t_start
        if solution is not None:
            return SearchResult(
                path=solution.extract_path(),
                success=True,
                stats=stats,
                algorithm=self.NAME,
                heuristic_variant=self.variant,
                lambda_risk=self.lambda_risk,
                solution_g=solution.g,
            )
        return SearchResult(
            path=None,
            success=False,
            stats=stats,
            algorithm=self.NAME,
            heuristic_variant=self.variant,
            lambda_risk=self.lambda_risk,
            solution_g=float('inf'),
        )

    # ------------------------------------------------------------------
    def _dfs(
        self,
        node:     Node,
        f_limit:  float,
        problem:  RecoveryProblem,
        scorer,
        cache:    dict,
        stats:    SearchStats,
    ) -> tuple[bool, float, Optional[Node]]:
        """
        Recursive DFS bounded by *f_limit*.

        Returns (goal_found, next_f_cutoff, solution_node).
        next_f_cutoff = the minimum f-value that exceeded the current limit
                        across all pruned branches (used to set the next iteration's
                        bound).
        """
        risk  = self._get_risk(node, list(node.window), scorer, cache, stats)
        g_aug = augmented_g(node.g, risk, self.variant, self.lambda_risk)
        hd    = h_d(node, problem)
        f     = compute_f(g_aug, hd, risk, self.variant, self.lambda_risk, self.w)

        if f > f_limit:
            return False, f, None

        if problem.goal_test(node.state):
            return True, f, node

        if node.depth >= self.max_depth:
            return False, float('inf'), None

        if stats.nodes_expanded >= self.budget_nodes:
            return False, float('inf'), None

        stats.nodes_expanded += 1
        stats.update_peaks(0, 0, len(cache))

        min_exceeded = float('inf')

        for action in problem.get_actions(node.state):
            new_state = problem.transition(node.state, action)
            if problem.is_infeasible(new_state):
                continue

            new_window = problem.extend_window(node.window, new_state)
            child = Node(
                state  = new_state,
                window = new_window,
                g      = node.g + problem.action_cost(action),
                depth  = node.depth + 1,
                parent = node,
                action = action,
                f      = 0.0,
            )
            stats.nodes_generated += 1

            found, t, sol = self._dfs(child, f_limit, problem, scorer, cache, stats)
            if found:
                return True, t, sol
            if t < min_exceeded:
                min_exceeded = t

        return False, min_exceeded, None

    # ------------------------------------------------------------------
    def _get_risk(
        self,
        node:   Node,
        window: list,
        scorer,
        cache:  dict,
        stats:  SearchStats,
    ) -> float:
        if scorer is None:
            return 0.0
        sig = node.state.signature()
        if sig in cache:
            return cache[sig]
        score = float(scorer.score_batch([window])[0])
        stats.scorer_calls += 1
        cache[sig] = score
        return score
