"""
Search-problem interface, Node, SearchStats, and SearchResult.

RecoveryProblem is the single object passed to every search algorithm.
It implements the standard AI-search interface from Section 3 of the
specification document:

    initial_state        SpacecraftState at fault onset
    goal_test(s)         True when telemetry is inside nominal bands
    get_actions(s)       legal command names in state s
    transition(s, a)     apply command a, then simulate one dt step
    action_cost(a)       α·τ(a) + β·ε(a)
    is_infeasible(s)     True if any hard limit violated or deadline exceeded
    extend_window(w, s)  sliding window update for the anomaly scorer
"""

from __future__ import annotations

import time as _time
from dataclasses import dataclass, field
from typing import Any, Optional

from ..simulator.spacecraft import SpacecraftState, SpacecraftParams, Simulator
from ..simulator.commands import legal_actions, apply_command, command_cost
from ..simulator.orbit import OrbitSchedule


# ---------------------------------------------------------------------------
# Search statistics — accumulated in-place during search
# ---------------------------------------------------------------------------

@dataclass
class SearchStats:
    """Resource-usage counters updated by the search algorithm."""

    nodes_expanded: int  = 0
    nodes_generated: int = 0
    scorer_calls: int    = 0
    peak_open_size: int  = 0
    peak_closed_size: int = 0
    peak_cache_size: int = 0
    wall_time_s: float   = 0.0

    @property
    def peak_memory_nodes(self) -> int:
        """Sum of peak open, closed, and cache sizes."""
        return self.peak_open_size + self.peak_closed_size + self.peak_cache_size

    def update_peaks(
        self,
        open_size: int,
        closed_size: int,
        cache_size: int,
    ) -> None:
        self.peak_open_size   = max(self.peak_open_size,   open_size)
        self.peak_closed_size = max(self.peak_closed_size, closed_size)
        self.peak_cache_size  = max(self.peak_cache_size,  cache_size)

    def to_dict(self) -> dict[str, Any]:
        return {
            'nodes_expanded':   self.nodes_expanded,
            'nodes_generated':  self.nodes_generated,
            'scorer_calls':     self.scorer_calls,
            'peak_memory_nodes': self.peak_memory_nodes,
            'wall_time_s':      self.wall_time_s,
        }


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

@dataclass
class Node:
    """
    A node in the search tree.

    *window* is a tuple of SpacecraftState objects: the recent trajectory
    segment fed to the anomaly scorer.  It slides: the child's window is
    the parent's window with the child's state appended and the oldest
    state dropped when the window is at capacity.

    *f* is mutable so that RBFS can back-propagate revised bounds without
    allocating a new Node object.
    """

    state:  SpacecraftState
    window: tuple                    # tuple[SpacecraftState, ...]
    g:      float                    # accumulated path cost
    depth:  int                      # tree depth from root
    parent: Optional["Node"]
    action: Optional[str]            # command name that produced this node
    f:      float = 0.0              # priority in the open queue

    # ------------------------------------------------------------------
    def __lt__(self, other: "Node") -> bool:
        return self.f < other.f

    # ------------------------------------------------------------------
    def extract_path(self) -> list[tuple[SpacecraftState, Optional[str]]]:
        """
        Reconstruct the action-state path from the root to this node.

        Returns a list of (state, action_that_led_here) pairs.
        The root entry has action=None.
        """
        path: list[tuple[SpacecraftState, Optional[str]]] = []
        node: Optional[Node] = self
        while node is not None:
            path.append((node.state, node.action))
            node = node.parent
        path.reverse()
        return path


# ---------------------------------------------------------------------------
# Search result
# ---------------------------------------------------------------------------

@dataclass
class SearchResult:
    """Outcome of one search run."""

    path:      Optional[list[tuple[SpacecraftState, Optional[str]]]]
    success:   bool
    stats:     SearchStats
    algorithm: str
    heuristic_variant: str  = 'H2'
    lambda_risk: float      = 0.0
    solution_g: float       = float('inf')   # path cost of solution

    @property
    def solution_depth(self) -> int:
        return (len(self.path) - 1) if self.path else 0

    def to_dict(self) -> dict[str, Any]:
        d = {
            'algorithm':        self.algorithm,
            'heuristic_variant': self.heuristic_variant,
            'lambda_risk':      self.lambda_risk,
            'success':          int(self.success),
            'solution_depth':   self.solution_depth,
            'solution_cost':    self.solution_g,
        }
        d.update(self.stats.to_dict())
        return d


# ---------------------------------------------------------------------------
# Recovery problem
# ---------------------------------------------------------------------------

class RecoveryProblem:
    """
    Satellite anomaly-recovery formulated as a search problem.

    Parameters
    ----------
    initial_state :
        Fault-injected SpacecraftState handed to the search as the root.
    params :
        Physical constants and cost weights.
    simulator :
        Forward-simulation engine.
    window_size :
        Number of states in the scorer window (default 10).
    """

    def __init__(
        self,
        initial_state: SpacecraftState,
        params: SpacecraftParams,
        simulator: Simulator,
        window_size: int = 10,
    ) -> None:
        self.initial_state = initial_state
        self.params        = params
        self.simulator     = simulator
        self.window_size   = window_size

        # Initialise window by repeating the initial state
        self.initial_window: tuple = tuple([initial_state] * window_size)

    # ------------------------------------------------------------------
    def goal_test(self, state: SpacecraftState) -> bool:
        """True when all monitored parameters are within nominal bands."""
        return state.in_nominal_band(self.params)

    def is_infeasible(self, state: SpacecraftState) -> bool:
        """
        True when *state* must be discarded without expansion.

        Checks hard physical limits AND the recovery-time deadline.
        Hard-constraint pruning (Section 3) is distinct from heuristic
        deprioritisation (Section 4.2).
        """
        return (
            state.violates_hard_constraints(self.params)
            or (state.time - self.initial_state.time) > self.params.max_horizon
        )

    def get_actions(self, state: SpacecraftState) -> list[str]:
        """Legal command names for *state*."""
        return legal_actions(state)

    def transition(self, state: SpacecraftState, action: str) -> SpacecraftState:
        """
        Apply *action* (instantaneous) then simulate one dt of physics.

        Command effect is applied first; physics step follows.
        This matches the pseudocode in Section 5 of the specification.
        """
        post_cmd = apply_command(state, action)
        return self.simulator.step(post_cmd)

    def action_cost(self, action: str) -> float:
        """Scalar path cost for *action*: α·τ + β·ε."""
        return command_cost(action, self.params)

    def extend_window(
        self,
        parent_window: tuple,
        new_state: SpacecraftState,
    ) -> tuple:
        """
        Slide the scorer window: append *new_state*, drop the oldest.

        If the window is not yet full it grows; once at capacity it slides.
        """
        if len(parent_window) < self.window_size:
            return parent_window + (new_state,)
        return parent_window[1:] + (new_state,)

    def make_root_node(self) -> Node:
        """Return the root search node (initial_state, g=0, depth=0)."""
        return Node(
            state=self.initial_state,
            window=self.initial_window,
            g=0.0,
            depth=0,
            parent=None,
            action=None,
            f=0.0,
        )
