"""
Heuristic functions for the satellite recovery search.

h_d — Static, admissible goal-distance lower bound (Section 4.1)
--------------------------------------------------------------
For each parameter outside its nominal band, h_d estimates the minimum cost
to bring it back using the maximum achievable correction rate of the relevant
actuators.

    SoC too low:
        max charge rate  = (max_solar_power − min_possible_load) × η_charge
        min time         = ΔSoC × capacity_J / max_charge_rate
        h_d_soc          = α × min_time

    Temperature too high:
        max cooling rate = (UA_node_space + UA_node_coupling) × ΔT
        min time         ≈ C_node / (UA_total)    [conservative: drops ΔT factor]
        h_d_temp_high    = α × C / UA_total

    Temperature too low:
        heat source rate = heater_load (maximum available)
        min time         = C × |ΔT| / heater_load
        h_d_temp_low     = α × C × |ΔT| / heater_load

    h_d = max over all out-of-band parameters
    (max → still a lower bound; avoids unit-inconsistent sum)

compute_f — Aggregate f-value for the five heuristic variants
-------------------------------------------------------------
    H0  f = g                                          (UCS baseline)
    H1  f = g + h_d                                    (static A*)
    H2  f = g + h_d + λ · R(n)                        (proposed dynamic)
    H3  f = (g + λ · R(n)) + h_d                      (risk folded into g)
    H4  f = g + w · (h_d + λ · R(n))                  (Weighted A*, anytime)

For H3 the augmented g is returned by augmented_g(); the caller uses it
in the priority value but also stores it separately so that the solution
cost reported is the true path cost g, not g + λΣR.
"""

from __future__ import annotations

from .problem import Node, RecoveryProblem


# ---------------------------------------------------------------------------
# Static admissible heuristic
# ---------------------------------------------------------------------------

def h_d(node: Node, problem: RecoveryProblem) -> float:
    """
    Admissible lower bound on remaining cost from *node*.

    Returns 0.0 for nodes already in the nominal band.
    """
    s = node.state
    p = problem.params
    α = p.alpha

    bounds: list[float] = [0.0]

    # ---- SoC (too low) -------------------------------------------------
    if s.soc < p.soc_nominal_min:
        delta_soc = p.soc_nominal_min - s.soc
        # Most optimistic: full solar, only unavoidable avionics load
        min_load        = p.low_power_avionics_load
        max_solar       = problem.simulator.orbit.max_solar_power
        max_charge_rate = max((max_solar - min_load) * p.charge_efficiency, 1.0)
        min_time        = (delta_soc * p.battery_capacity_j) / max_charge_rate
        bounds.append(α * min_time)

    # ---- Battery temperature too high ----------------------------------
    if s.temp_battery > p.temp_bat_nominal_max:
        delta_T  = s.temp_battery - p.temp_bat_nominal_max
        UA_total = p.ua_bat_space + p.ua_bat_bus
        min_time = p.c_bat / max(UA_total, 1e-3)      # C/UA, conservative
        bounds.append(α * min_time)

    # ---- Battery temperature too low -----------------------------------
    elif s.temp_battery < p.temp_bat_nominal_min:
        delta_T  = p.temp_bat_nominal_min - s.temp_battery
        # Bus coupling warms battery passively; heater is on payload not battery
        min_time = p.c_bat * delta_T / max(p.ua_bat_bus * 10.0, 0.1)
        bounds.append(α * min_time)

    # ---- Payload temperature too high ----------------------------------
    if s.temp_payload > p.temp_pay_nominal_max:
        UA_total = p.ua_pay_space + p.ua_pay_bus
        min_time = p.c_pay / max(UA_total, 1e-3)
        bounds.append(α * min_time)

    # ---- Payload temperature too low -----------------------------------
    elif s.temp_payload < p.temp_pay_nominal_min:
        delta_T  = p.temp_pay_nominal_min - s.temp_payload
        min_time = p.c_pay * delta_T / max(p.heater_load, 0.1)
        bounds.append(α * min_time)

    # ---- Bus temperature too high --------------------------------------
    if s.temp_bus > p.temp_bus_nominal_max:
        min_time = p.c_bus / max(p.ua_bus_space, 1e-3)
        bounds.append(α * min_time)

    # ---- Bus temperature too low ---------------------------------------
    elif s.temp_bus < p.temp_bus_nominal_min:
        delta_T  = p.temp_bus_nominal_min - s.temp_bus
        # Payload coupling or avionics waste heat warms the bus
        min_time = p.c_bus * delta_T / max(p.ua_pay_bus * 10.0, 0.1)
        bounds.append(α * min_time)

    return max(bounds)


# ---------------------------------------------------------------------------
# f-value computation for all five variants
# ---------------------------------------------------------------------------

def compute_f(
    g: float,
    hd: float,
    risk: float,
    variant: str,
    lambda_risk: float,
    w: float = 1.5,
) -> float:
    """
    Return the f-value for the chosen heuristic variant.

    Parameters
    ----------
    g           : path cost accumulated so far
    hd          : h_d(node, problem) — static admissible part
    risk        : R(n) ∈ [0, 1] — calibrated anomaly score
    variant     : 'H0' | 'H1' | 'H2' | 'H3' | 'H4'
    lambda_risk : λ — risk-to-cost-unit conversion factor
    w           : suboptimality bound for Weighted A* (H4)
    """
    if variant == 'H0':
        return g
    if variant == 'H1':
        return g + hd
    if variant == 'H2':
        return g + hd + lambda_risk * risk
    if variant == 'H3':
        # Risk folded into g; f = augmented_g + h_d
        return (g + lambda_risk * risk) + hd
    if variant == 'H4':
        return g + w * (hd + lambda_risk * risk)
    raise ValueError(f"Unknown heuristic variant: {variant!r}")


def augmented_g(g: float, risk: float, variant: str, lambda_risk: float) -> float:
    """
    Return g' (the g used inside f for priority ordering).

    For H3, g' = g + λ·R; for all others, g' = g.
    The solution cost reported in results always uses the true g, not g'.
    """
    if variant == 'H3':
        return g + lambda_risk * risk
    return g
