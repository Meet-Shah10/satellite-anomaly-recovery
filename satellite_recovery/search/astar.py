"""
Dynamic A* (Section 5 of the specification document).

Algorithm
---------
    open   ← priority queue ordered by f
    closed ← hash set of visited state signatures
    cache  ← map from state signature → R  (avoids rescoring)

    while open is not empty and budget not exhausted:
        n ← pop lowest-f node
        if n already in closed: continue
        if GOAL(n): return path
        add n to closed
        if n.depth ≥ max_depth: continue
        for each legal action a:
            x' ← transition(n.state, a)
            if VIOLATES-HARD-CONSTRAINT(x'): discard
            W' ← extend_window(n.window, x')
            score R' from cache or batch scorer
            compute g', f' for chosen variant
            push child with f'

    return best partial path (lowest h_d node seen)

Batching
--------
All children of one expanded node are scored in a single scorer.score_batch()
call so the per-call Python overhead is paid once per expansion, not once per
child.  The cache is keyed by state signature so duplicate states are never
re-scored.

Heuristic variants
------------------
H0  UCS          f = g
H1  Static A*    f = g + h_d
H2  Dynamic A*   f = g + h_d + λ·R      (proposed)
H3  Risk-in-g    f = (g + λ·R) + h_d   (restores optimality on augmented cost)
H4  Weighted A*  f = g + w·(h_d + λ·R) (anytime, bounded suboptimal)
"""

from __future__ import annotations

import heapq
import time as _time
from typing import Optional

from .problem import Node, RecoveryProblem, SearchResult, SearchStats
from .heuristics import h_d, compute_f, augmented_g


class DynamicAStar:
    """
    A* search with a dynamic anomaly-score risk term in the heuristic.

    Parameters
    ----------
    budget_nodes : int
        Maximum node expansions.  When exhausted the search returns the best
        partial path found (anytime fallback, Section 5).
    max_depth : int
        Depth cap; nodes at this depth are not expanded.
    variant : str
        One of 'H0' | 'H1' | 'H2' | 'H3' | 'H4'.
    lambda_risk : float
        λ — converts the dimensionless risk score to cost units.
    w : float
        Suboptimality bound for H4 (Weighted A*).
    """

    NAME = 'astar'

    def __init__(
        self,
        budget_nodes: int = 5_000,
        max_depth:    int = 20,
        variant:      str = 'H2',
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
        scorer,           # BaseScorer | None
        seed: int = 0,    # unused for A*; kept for uniform API
    ) -> SearchResult:
        """
        Run Dynamic A* and return a SearchResult.

        Parameters
        ----------
        problem : RecoveryProblem
        scorer  : anomaly scorer implementing score_batch(windows) → ndarray
                  Pass None to disable risk scoring (equivalent to H1/H0).
        seed    : random seed (unused; for API symmetry with local search).
        """
        stats   = SearchStats()
        t_start = _time.perf_counter()
        cache: dict[tuple, float] = {}

        # ---- Root --------------------------------------------------------
        root       = problem.make_root_node()
        root_risk  = self._cached_score(root, list(root.window), scorer, cache, stats)
        root_hd    = h_d(root, problem)
        root_g_aug = augmented_g(0.0, root_risk, self.variant, self.lambda_risk)
        root.f     = compute_f(root_g_aug, root_hd, root_risk,
                               self.variant, self.lambda_risk, self.w)

        open_heap: list[Node] = [root]
        heapq.heapify(open_heap)
        closed: set[tuple] = set()

        # Best partial node (for anytime fallback)
        best_partial: Node = root
        best_partial_hd: float = root_hd

        # ---- Main loop ---------------------------------------------------
        while open_heap and stats.nodes_expanded < self.budget_nodes:
            node = heapq.heappop(open_heap)
            sig  = node.state.signature()

            if sig in closed:
                continue

            # Track best partial by h_d (smallest residual is closest to goal)
            node_hd = h_d(node, problem)
            if node_hd < best_partial_hd:
                best_partial    = node
                best_partial_hd = node_hd

            # Goal test
            if problem.goal_test(node.state):
                stats.wall_time_s = _time.perf_counter() - t_start
                return SearchResult(
                    path=node.extract_path(),
                    success=True,
                    stats=stats,
                    algorithm=self.NAME,
                    heuristic_variant=self.variant,
                    lambda_risk=self.lambda_risk,
                    solution_g=node.g,
                )

            closed.add(sig)
            stats.nodes_expanded += 1

            if node.depth >= self.max_depth:
                continue

            # ---- Expand: build children, batch-score --------------------
            children, risks = self._expand(node, problem, scorer, cache, stats)

            for child, risk in zip(children, risks):
                if child.state.signature() in closed:
                    continue
                g_aug = augmented_g(child.g, risk, self.variant, self.lambda_risk)
                child_hd = h_d(child, problem)
                child.f  = compute_f(g_aug, child_hd, risk,
                                     self.variant, self.lambda_risk, self.w)
                heapq.heappush(open_heap, child)
                stats.nodes_generated += 1

            stats.update_peaks(len(open_heap), len(closed), len(cache))

        # ---- Exhausted budget: return best partial -----------------------
        stats.wall_time_s = _time.perf_counter() - t_start
        return SearchResult(
            path=best_partial.extract_path(),
            success=False,
            stats=stats,
            algorithm=self.NAME,
            heuristic_variant=self.variant,
            lambda_risk=self.lambda_risk,
            solution_g=best_partial.g,
        )

    # ------------------------------------------------------------------
    def _expand(
        self,
        node: Node,
        problem: RecoveryProblem,
        scorer,
        cache: dict,
        stats: SearchStats,
    ) -> tuple[list[Node], list[float]]:
        """
        Generate feasible children, batch-score, return (children, risks).

        Children that violate hard constraints are silently dropped here
        (not added to open), as per Section 3 (hard-constraint pruning).
        """
        children: list[Node]  = []
        windows:  list[list]  = []

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
            children.append(child)
            windows.append(list(new_window))

        risks = self._batch_score(children, windows, scorer, cache, stats)
        return children, risks

    # ------------------------------------------------------------------
    def _batch_score(
        self,
        children: list[Node],
        windows:  list[list],
        scorer,
        cache:    dict,
        stats:    SearchStats,
    ) -> list[float]:
        if scorer is None or not children:
            return [0.0] * len(children)

        risks: list[float]    = [0.0] * len(children)
        uncached_idx: list[int] = []
        uncached_wins: list[list] = []

        for i, child in enumerate(children):
            sig = child.state.signature()
            if sig in cache:
                risks[i] = cache[sig]
            else:
                uncached_idx.append(i)
                uncached_wins.append(windows[i])

        if uncached_wins:
            scores = scorer.score_batch(uncached_wins)
            stats.scorer_calls += len(uncached_wins)
            for idx, score in zip(uncached_idx, scores):
                sig = children[idx].state.signature()
                cache[sig] = float(score)
                risks[idx] = float(score)

        return risks

    def _cached_score(
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
