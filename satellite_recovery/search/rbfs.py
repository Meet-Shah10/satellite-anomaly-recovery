"""
Recursive Best-First Search (RBFS) for the satellite recovery problem.

Memory: O(max_depth) — the current path plus one best-alternative f-value
per level.

Why RBFS over IDA* for this problem (Section 6.3)
--------------------------------------------------
A learned anomaly scorer does not guarantee monotone f-values along a path:
a child may score lower risk than its parent even if the path cost has grown.
RBFS handles this naturally by backing up the best child f-value to the
parent, which means the algorithm re-explores a branch only when its revised
backed-up value becomes better than the best alternative.  IDA*, by contrast,
iterates with a fixed f-cutoff and may re-expand many nodes when f-values are
non-monotone.

The score cache (state_signature → R) is shared across the entire search so
that re-expanded nodes are not re-scored.

Algorithm (Russell & Norvig, Ch. 3)
------------------------------------
    RBFS(node, f_limit):
        if GOAL(node): return node
        successors ← expand(node)
        if successors is empty: return FAILURE, ∞
        for s in successors:
            s.f ← max(s.g + h(s), node.f)      // back-propagation of parent f
        loop:
            best ← argmin f(successors)
            if best.f > f_limit: return FAILURE, best.f
            alt  ← 2nd-min f value (or ∞ if only one successor)
            result, best.f ← RBFS(best, min(f_limit, alt))
            if result ≠ FAILURE: return result

The `max(s.g + h(s), node.f)` line enforces that f values never decrease
along a path (pseudo-consistency), which is needed for RBFS correctness
when the heuristic is not strictly consistent (as is the case for a
learned scorer).
"""

from __future__ import annotations

import time as _time
from typing import Optional

from .problem import Node, RecoveryProblem, SearchResult, SearchStats
from .heuristics import h_d, compute_f, augmented_g


_FAILURE = None   # sentinel


class RBFS:
    """
    Recursive Best-First Search.

    Parameters
    ----------
    budget_nodes : int
        Hard cap on total node expansions.
    max_depth    : int
        Maximum path depth; a node at this depth is not expanded.
    variant      : str  — 'H0' | 'H1' | 'H2' | 'H3' | 'H4'
    lambda_risk  : float
    w            : float — suboptimality factor for H4
    """

    NAME = 'rbfs'

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
        root.f    = compute_f(root_gaug, root_hd, root_risk,
                              self.variant, self.lambda_risk, self.w)

        found, goal_node = self._rbfs(
            root, float('inf'), problem, scorer, cache, stats
        )

        stats.wall_time_s = _time.perf_counter() - t_start

        if found and goal_node is not None:
            return SearchResult(
                path=goal_node.extract_path(),
                success=True,
                stats=stats,
                algorithm=self.NAME,
                heuristic_variant=self.variant,
                lambda_risk=self.lambda_risk,
                solution_g=goal_node.g,
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
    def _rbfs(
        self,
        node:     Node,
        f_limit:  float,
        problem:  RecoveryProblem,
        scorer,
        cache:    dict,
        stats:    SearchStats,
    ) -> tuple[bool, Optional[Node]]:
        """
        Recursive RBFS step.

        Returns (goal_found, goal_node | None).
        When goal_found is False, node.f has been updated to the best
        backed-up f-value from successors (the standard RBFS f-update).
        """
        if problem.goal_test(node.state):
            return True, node

        if node.depth >= self.max_depth:
            node.f = float('inf')
            return False, None

        if stats.nodes_expanded >= self.budget_nodes:
            node.f = float('inf')
            return False, None

        # ---- Expand -------------------------------------------------------
        successors: list[Node] = []

        for action in problem.get_actions(node.state):
            new_state = problem.transition(node.state, action)
            if problem.is_infeasible(new_state):
                continue
            new_window = problem.extend_window(node.window, new_state)
            risk       = self._get_risk(
                # Build a temporary node just for cache lookup
                Node(state=new_state, window=new_window, g=0.0,
                     depth=0, parent=None, action=None, f=0.0),
                list(new_window), scorer, cache, stats,
            )
            child_g    = node.g + problem.action_cost(action)
            child_hd   = h_d(
                Node(state=new_state, window=new_window, g=child_g,
                     depth=node.depth+1, parent=node, action=action, f=0.0),
                problem,
            )
            g_aug  = augmented_g(child_g, risk, self.variant, self.lambda_risk)
            raw_f  = compute_f(g_aug, child_hd, risk,
                               self.variant, self.lambda_risk, self.w)
            # Enforce pseudo-consistency: child f ≥ parent f
            child_f = max(raw_f, node.f)

            child = Node(
                state  = new_state,
                window = new_window,
                g      = child_g,
                depth  = node.depth + 1,
                parent = node,
                action = action,
                f      = child_f,
            )
            successors.append(child)
            stats.nodes_generated += 1

        stats.nodes_expanded += 1
        stats.update_peaks(0, 0, len(cache))

        if not successors:
            node.f = float('inf')
            return False, None

        # ---- RBFS loop ----------------------------------------------------
        while True:
            # Sort to get best and second-best
            successors.sort(key=lambda n: n.f)
            best = successors[0]

            if best.f > f_limit:
                node.f = best.f     # back-propagate
                return False, None

            alternative_f = successors[1].f if len(successors) > 1 else float('inf')

            found, goal = self._rbfs(
                best,
                min(f_limit, alternative_f),
                problem, scorer, cache, stats,
            )
            if found:
                return True, goal
            # best.f has been updated by the recursive call (RBFS f-update)
            # Loop continues with updated successor list

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
