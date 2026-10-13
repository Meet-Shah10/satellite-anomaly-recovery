"""
Evaluation metrics (Section 7 of the specification document).

compute_metrics(result, problem) → MetricsRecord

Metrics
-------
time_to_stable_s
    Simulated seconds from fault onset to the first in-band state along the
    solution path.  Infinite if no in-band state is reached.

safety_margin
    Minimum normalised distance to any hard limit across ALL states on the
    solution path.  Normalised per parameter to [0, 1]; 0 = on the limit,
    1 = maximum possible clearance.  A negative value means a hard limit was
    breached somewhere on the path (should not happen for a valid solution).

success
    Boolean; True if the last state of the path is in the nominal band and no
    hard constraint was violated.

solution_cost
    g-value of the final node.

path_length
    Number of commands in the solution sequence.

plus all SearchStats fields (nodes_expanded, scorer_calls, peak_memory_nodes,
wall_time_s) from the SearchResult.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from ..search.problem import SearchResult
from ..simulator.spacecraft import SpacecraftState, SpacecraftParams


# ---------------------------------------------------------------------------
# Metrics record
# ---------------------------------------------------------------------------

@dataclass
class MetricsRecord:
    """All metrics for one experiment run, flat for CSV logging."""

    # -- Identity -----------------------------------------------------------
    scenario:          str   = ''
    algorithm:         str   = ''
    heuristic_variant: str   = ''
    lambda_risk:       float = 0.0
    seed:              int   = 0

    # -- Solution quality ---------------------------------------------------
    success:            int   = 0     # 1 / 0 for easy averaging
    time_to_stable_s:   float = float('inf')
    safety_margin:      float = float('-inf')
    solution_cost:      float = float('inf')
    path_length:        int   = 0

    # -- Resource usage -----------------------------------------------------
    nodes_expanded:    int   = 0
    nodes_generated:   int   = 0
    scorer_calls:      int   = 0
    peak_memory_nodes: int   = 0
    wall_time_s:       float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Computation
# ---------------------------------------------------------------------------

def compute_metrics(
    result:   SearchResult,
    problem,                    # RecoveryProblem (avoid circular import)
    scenario: str  = '',
    seed:     int  = 0,
) -> MetricsRecord:
    """
    Convert a SearchResult into a MetricsRecord.

    Parameters
    ----------
    result  : SearchResult returned by any search algorithm.
    problem : RecoveryProblem (for params and initial_state).
    scenario: scenario name string for logging.
    seed    : random seed used in this run.
    """
    params = problem.params
    t0     = problem.initial_state.time

    rec = MetricsRecord(
        scenario          = scenario,
        algorithm         = result.algorithm,
        heuristic_variant = result.heuristic_variant,
        lambda_risk       = result.lambda_risk,
        seed              = seed,
        success           = int(result.success),
        solution_cost     = result.solution_g,
        path_length       = result.solution_depth,
        nodes_expanded    = result.stats.nodes_expanded,
        nodes_generated   = result.stats.nodes_generated,
        scorer_calls      = result.stats.scorer_calls,
        peak_memory_nodes = result.stats.peak_memory_nodes,
        wall_time_s       = result.stats.wall_time_s,
    )

    if result.path is None:
        return rec

    path_states: list[SpacecraftState] = [s for s, _ in result.path]

    # ---- Time to first stable state -------------------------------------
    for state in path_states:
        if state.in_nominal_band(params):
            rec.time_to_stable_s = float(state.time - t0)
            break

    # ---- Minimum safety margin over the whole path ----------------------
    margins = [s.safety_margin(params) for s in path_states]
    rec.safety_margin = float(min(margins)) if margins else float('-inf')

    return rec


# ---------------------------------------------------------------------------
# Helper: safety margin for a list of states
# ---------------------------------------------------------------------------

def path_safety_margin(
    path_states: list[SpacecraftState],
    params: SpacecraftParams,
) -> float:
    """Return the minimum safety margin across all states in *path_states*."""
    if not path_states:
        return float('-inf')
    return float(min(s.safety_margin(params) for s in path_states))
