"""
Integration tests for search algorithms (Dynamic A*, IDA*, RBFS) and heuristic variants.
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from satellite_recovery.simulator.spacecraft import SpacecraftParams
from satellite_recovery.simulator.commands import legal_actions
from satellite_recovery.evaluation.scenarios import SCENARIOS
from satellite_recovery.anomaly.scorer import BaseScorer
from satellite_recovery.search.astar import DynamicAStar
from satellite_recovery.search.heuristics import compute_f, augmented_g, h_d

REPO_ROOT = Path(__file__).resolve().parent.parent
SCORER_PATH = REPO_ROOT / "experiments" / "scorers" / "isolation_forest.joblib"


@pytest.fixture(scope="module")
def shared_scorer():
    if SCORER_PATH.exists():
        return BaseScorer.load(str(SCORER_PATH))
    return None


def test_astar_variants_on_single_thermal(shared_scorer):
    """
    Test A* search across variants H0, H1, and H2 on single_thermal scenario.
    Verifies that:
    1. All variants find a recovery path.
    2. Static heuristic (H1) and Dynamic (H2) expand fewer nodes than UCS (H0).
    3. Final states are within nominal bands.
    4. Intermediate transitions follow legitimate commands.
    """
    scenario = SCENARIOS['single_thermal']
    params = SpacecraftParams()
    problem = scenario.build_problem(params=params)

    results = {}
    for var in ('H0', 'H1', 'H2'):
        algo = DynamicAStar(
            budget_nodes=2000,
            max_depth=15,
            variant=var,
            lambda_risk=50.0,
        )
        res = algo.search(problem, shared_scorer, seed=0)
        assert res.success is True
        assert res.path is not None
        assert len(res.path) >= 2
        results[var] = res

        # Verify trajectory step validity
        path_tuples = res.path
        for i in range(len(path_tuples) - 1):
            curr_state, _ = path_tuples[i]
            next_state, action_taken = path_tuples[i + 1]
            assert action_taken is not None
            # Action must have been legal in curr_state
            assert action_taken in legal_actions(curr_state)
            # Applying action and stepping simulator must produce next_state
            expected_next = problem.transition(curr_state, action_taken)
            assert expected_next.time == next_state.time
            assert math.isclose(expected_next.soc, next_state.soc, rel_tol=1e-5)
            assert math.isclose(expected_next.temp_payload, next_state.temp_payload, rel_tol=1e-5)

        # Final state must be inside nominal bands
        final_state, _ = path_tuples[-1]
        assert problem.goal_test(final_state) is True
        assert final_state.in_nominal_band(params) is True

    # Informational efficiency check: Informed A* should expand fewer nodes than H0 (UCS)
    assert results['H1'].stats.nodes_expanded < results['H0'].stats.nodes_expanded
    assert results['H2'].stats.nodes_expanded < results['H0'].stats.nodes_expanded


def test_search_budget_exhaustion_behavior(shared_scorer):
    """
    Verify that exhausting search budget returns success=False without
    mistakenly claiming a partial path as a solution.
    """
    scenario = SCENARIOS['cascade']
    params = SpacecraftParams()
    problem = scenario.build_problem(params=params)

    # Budget of only 1 node expansion cannot solve the multi-step cascade
    algo = DynamicAStar(budget_nodes=1, max_depth=10, variant='H2', lambda_risk=50.0)
    res = algo.search(problem, shared_scorer, seed=0)

    assert res.success is False
    assert res.stats.nodes_expanded == 1
    # Even if an anytime best-partial path is returned, success MUST be False
    final_state, _ = res.path[-1]
    assert problem.goal_test(final_state) is False


def test_h3_known_implementation_behavior():
    """
    Verify and document the known research implementation behavior of variant H3.

    Mathematical Intention (from dynamic_astar_satellite_recovery.md):
        g'(n) = g(n) + λ * sum_{i=1}^n R(n_i)
        f(n) = g'(n) + h_d(n)

    Current Implementation Behavior:
        In astar.py:
            g_aug = augmented_g(child.g, risk, 'H3', lambda_risk)
                  = child.g + lambda_risk * risk
        In heuristics.py:
            compute_f(g_aug, hd, risk, 'H3', lambda_risk)
                  = (g_aug + lambda_risk * risk) + hd
                  = child.g + 2 * lambda_risk * risk + hd

    This test verifies that the current codebase exhibits this known behavior,
    confirming our audit finding without altering the research code.
    """
    g = 10.0
    hd = 5.0
    risk = 0.4
    lam = 50.0

    # Step 1: augmented_g adds λ * risk
    g_aug = augmented_g(g, risk, 'H3', lam)
    assert g_aug == g + lam * risk  # 10 + 20 = 30.0

    # Step 2: compute_f currently adds λ * risk a second time
    f_val = compute_f(g_aug, hd, risk, 'H3', lam)
    expected_current_behavior = (g_aug + lam * risk) + hd  # 30 + 20 + 5 = 55.0
    assert f_val == expected_current_behavior
    assert f_val == g + 2 * lam * risk + hd

    # Documenting the discrepancy: expected intended value without double count is 35.0
    intended_single_step_value = g + lam * risk + hd  # 35.0
    assert f_val != intended_single_step_value
