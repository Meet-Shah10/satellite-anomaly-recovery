"""
Data serializers for transforming internal scientific objects into JSON-safe dictionaries.

Ensures proper handling of NumPy scalars, immutable dataclasses, infinity values,
step-level costs, and sliding-window anomaly scores without modifying domain models.
"""

from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np

from satellite_recovery.simulator.spacecraft import SpacecraftState, SpacecraftParams
from satellite_recovery.simulator.commands import Command, command_cost
from satellite_recovery.search.problem import SearchResult, SearchStats
from satellite_recovery.evaluation.metrics import MetricsRecord
from satellite_recovery.anomaly.scorer import BaseScorer


def _sanitize_float(val: Any) -> Optional[float]:
    """Convert float-like values to standard Python float; map infinite/NaN to None."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isinf(f) or math.isnan(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def serialize_state(
    state: SpacecraftState,
    params: Optional[SpacecraftParams] = None,
) -> dict[str, Any]:
    """
    Convert a SpacecraftState into a JSON-safe dictionary with optional constraint checks.
    """
    data: dict[str, Any] = {
        'time': float(state.time),
        'soc': float(state.soc),
        'temp_battery': float(state.temp_battery),
        'temp_payload': float(state.temp_payload),
        'temp_bus': float(state.temp_bus),
        'heater_on': bool(state.heater_on),
        'payload_on': bool(state.payload_on),
        'transmitter_on': bool(state.transmitter_on),
        'mode': str(state.mode),
        'fault_heat_payload': float(state.fault_heat_payload),
        'fault_heat_battery': float(state.fault_heat_battery),
        'fault_extra_load': float(state.fault_extra_load),
    }

    if params is not None:
        data['safety_margin'] = _sanitize_float(state.safety_margin(params))
        data['in_nominal_band'] = bool(state.in_nominal_band(params))
        data['violates_hard_constraints'] = bool(state.violates_hard_constraints(params))
        raw_violations = state.parameter_violations(params)
        data['parameter_violations'] = {
            k: float(v) for k, v in raw_violations.items()
        }
    else:
        data['safety_margin'] = None
        data['in_nominal_band'] = None
        data['violates_hard_constraints'] = None
        data['parameter_violations'] = None

    return data


def serialize_search_stats(stats: SearchStats) -> dict[str, Any]:
    """Serialize SearchStats to JSON-safe dictionary."""
    return {
        'nodes_expanded': int(stats.nodes_expanded),
        'nodes_generated': int(stats.nodes_generated),
        'scorer_calls': int(stats.scorer_calls),
        'peak_memory_nodes': int(stats.peak_memory_nodes),
        'wall_time_s': float(stats.wall_time_s),
    }


def serialize_metrics(metrics: MetricsRecord) -> dict[str, Any]:
    """Serialize MetricsRecord to JSON-safe dictionary with infinite values mapped to None."""
    return {
        'scenario': str(metrics.scenario),
        'algorithm': str(metrics.algorithm),
        'heuristic_variant': str(metrics.heuristic_variant),
        'lambda_risk': float(metrics.lambda_risk),
        'seed': int(metrics.seed),
        'success': bool(metrics.success),
        'time_to_stable_s': _sanitize_float(metrics.time_to_stable_s),
        'safety_margin': _sanitize_float(metrics.safety_margin),
        'solution_cost': _sanitize_float(metrics.solution_cost),
        'path_length': int(metrics.path_length),
        'nodes_expanded': int(metrics.nodes_expanded),
        'nodes_generated': int(metrics.nodes_generated),
        'scorer_calls': int(metrics.scorer_calls),
        'peak_memory_nodes': int(metrics.peak_memory_nodes),
        'wall_time_s': float(metrics.wall_time_s),
    }


def serialize_plan_response(
    result: SearchResult,
    metrics: MetricsRecord,
    scenario_name: str,
    params: Optional[SpacecraftParams] = None,
    scorer: Optional[BaseScorer] = None,
    budget_nodes: int = 5000,
) -> dict[str, Any]:
    """
    Serialize complete search outcome and trajectory steps including step costs and risk scores.
    """
    p = params or SpacecraftParams()
    serialized_path: list[dict[str, Any]] = []

    accumulated_cost = 0.0
    history_window: list[SpacecraftState] = []

    if result.path:
        for idx, (state, action) in enumerate(result.path):
            step_cost: Optional[float] = None
            if action is not None:
                step_cost = float(command_cost(action, p))
                accumulated_cost += step_cost
            else:
                step_cost = 0.0

            history_window.append(state)
            if len(history_window) > 10:
                history_window.pop(0)

            risk_val: Optional[float] = None
            if scorer is not None and len(history_window) > 0:
                try:
                    # Pad window if length < 10 to match standard scorer feature extraction
                    padded_win = ([history_window[0]] * (10 - len(history_window))) + history_window
                    risk_val = _sanitize_float(scorer.score_single(padded_win))
                except Exception:
                    risk_val = None

            serialized_path.append({
                'step': idx,
                'action': action,
                'state': serialize_state(state, params=p),
                'step_cost': step_cost,
                'accumulated_cost': float(accumulated_cost),
                'risk_score': risk_val,
            })

    # Determine termination reason
    if result.success:
        termination_reason = 'goal_reached'
    elif result.stats.nodes_expanded >= budget_nodes:
        termination_reason = 'budget_exhausted'
    else:
        termination_reason = 'unsolved'

    return {
        'scenario': scenario_name,
        'algorithm': result.algorithm,
        'variant': result.heuristic_variant,
        'lambda_risk': float(result.lambda_risk),
        'success': bool(result.success),
        'solution_cost': _sanitize_float(result.solution_g),
        'solution_depth': int(result.solution_depth),
        'termination_reason': termination_reason,
        'stats': serialize_search_stats(result.stats),
        'metrics': serialize_metrics(metrics),
        'path': serialized_path,
    }


def serialize_command(
    cmd: Command,
    params: Optional[SpacecraftParams] = None,
) -> dict[str, Any]:
    """Serialize Command descriptor and its scalar nominal cost."""
    p = params or SpacecraftParams()
    return {
        'name': cmd.name,
        'latency_s': float(cmd.latency_s),
        'energy_j': float(cmd.energy_j),
        'nominal_cost': float(cmd.cost(p)),
    }
