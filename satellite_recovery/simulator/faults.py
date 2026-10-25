"""
Fault injection for evaluation scenarios.

A FaultProfile encodes a persistent disturbance that is baked into the
SpacecraftState before the search starts.  The search algorithm sees only
anomalous telemetry; it does not know the fault type or magnitude.

Three canonical single-fault profiles plus one cascading profile are provided.
All are registered in FAULT_REGISTRY so CLI scripts can select them by name.

Design note (Section 8 of the specification document)
------------------------------------------------------
Using the simulator as the source of training and evaluation data removes the
distribution-shift risk that would arise from using ESA telemetry for scorer
training while the search produces simulator states.  The fault_heat_* and
fault_extra_load fields persist unchanged during the search because the
commands change spacecraft configuration, not the root cause of the fault.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .spacecraft import SpacecraftState


# ---------------------------------------------------------------------------
# Fault profile descriptor
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FaultProfile:
    """
    Stateless description of a persistent fault disturbance.

    Fields map directly onto SpacecraftState disturbance fields or override
    initial conditions at fault onset.
    """

    name: str

    # Persistent heat injections (Watts).  Always non-negative.
    fault_heat_payload: float = 0.0   # extra heat on payload thermal node
    fault_heat_battery: float = 0.0   # extra heat on battery thermal node

    # Extra electrical load (Watts)
    fault_extra_load: float = 0.0

    # Optional initial-condition overrides (applied at fault onset)
    soc_override: float | None         = None
    temp_payload_override: float | None = None
    temp_battery_override: float | None = None


# ---------------------------------------------------------------------------
# Canonical fault profiles
# ---------------------------------------------------------------------------

THERMAL_RUNAWAY = FaultProfile(
    name='thermal_runaway',
    fault_heat_payload=35.0,      # stuck relay: persistent 35 W on payload node
    fault_heat_battery=20.0,      # compensates battery cooling during wait steps (keeps T_bat > -15 °C)
    temp_payload_override=62.0,   # payload 7 °C above nominal limit (55 °C)
)
"""
Payload temperature is at 62 °C (7 °C above the 55 °C nominal ceiling).
The fault_heat_payload=35 W persists; with payload_on the equilibrium is 52 °C (borderline);
with payload_off the equilibrium drops to 24 °C (safe), but physical cooling from 62 °C
to ≤55 °C takes ≈6 physics steps (6 min) via the thermal time constant.
fault_heat_battery=20 W keeps the battery node above −15 °C while waiting.
Recovery: payload_off, then 5–6 wait steps.
Solved at depth ≈7 by A* (H0 expands many more nodes than H2).
"""

BATTERY_DEGRADATION = FaultProfile(
    name='battery_degradation',
    fault_heat_battery=12.0,      # internal resistance → ohmic heat + T_bat=44 °C at onset
    fault_extra_load=15.0,        # elevated bus draw from degraded regulation
    soc_override=0.20,            # below nominal 35 % floor; needs several charge steps
    temp_battery_override=44.0,   # warm battery — stay below 50 °C hard limit
)
"""
SoC = 0.20 with fault_extra_load=15 W.  At orbit_phase=0.50 (late sunlit arc),
solar flux is declining.  After shedding payload + transmitter, net charging
recovers SoC but slowly — 5–6 wait steps needed to reach 0.35.
T_bat=44 °C at onset; heater must NOT be turned on.
"""

HIGH_BUS_LOAD = FaultProfile(
    name='high_bus_load',
    fault_extra_load=30.0,        # rogue 30 W consumer (large but recoverable)
    fault_heat_battery=12.0,      # keeps T_bat warm during eclipse fringe waits
    soc_override=0.20,            # below nominal floor; needs charging steps
)
"""
A rogue 30 W consumer draws unscheduled current.  SoC = 0.20 below the 35 % floor.
At orbit_phase=0.45 (moderate sunlit), solar charging is available but after shedding
payload + tx + low_power_mode the net charging requires ≈4–5 wait steps.
fault_heat_battery=12 keeps T_bat in range during waits.
"""

CASCADE_THERMAL_POWER = FaultProfile(
    name='cascade_thermal_power',
    fault_heat_payload=35.0,      # payload overheating (same as THERMAL_RUNAWAY)
    fault_heat_battery=20.0,      # battery warmth compensation during wait steps
    fault_extra_load=15.0,        # bus load fault (same as BATTERY_DEGRADATION)
    soc_override=0.22,            # SoC deficit — needs charging steps
    temp_payload_override=62.0,   # 7 °C above nominal — needs several wait steps
)
"""
Simultaneous thermal runaway (T_pay=62 °C) and bus load fault (SoC=0.22).
At phase=0.10 (full sun), solar is available but both problems must be addressed:
payload_off removes thermal load and lets T_pay cool over ≈6 wait steps;
transmitter_off + wait steps allow SoC to recover to ≥0.35.
Hardest scenario: the planner must find the right sequence and wait count for both.
Solved at depth ≈8 by A*; HC/SA may need more nodes or fail on some seeds.
"""

FAULT_REGISTRY: dict[str, FaultProfile] = {
    f.name: f
    for f in (THERMAL_RUNAWAY, BATTERY_DEGRADATION, HIGH_BUS_LOAD, CASCADE_THERMAL_POWER)
}


# ---------------------------------------------------------------------------
# Injection helper
# ---------------------------------------------------------------------------

def inject_fault(
    nominal_state: SpacecraftState,
    fault: FaultProfile,
) -> SpacecraftState:
    """
    Return a new SpacecraftState with the fault disturbance encoded.

    This is the initial_state handed to the search algorithm.

    Parameters
    ----------
    nominal_state :
        A steady-state nominal snapshot to serve as the baseline.
    fault :
        The fault profile to inject.

    Returns
    -------
    SpacecraftState
        Fault-modified initial state for the search.
    """
    overrides: dict = {
        'fault_heat_payload': fault.fault_heat_payload,
        'fault_heat_battery': fault.fault_heat_battery,
        'fault_extra_load':   fault.fault_extra_load,
    }
    if fault.soc_override is not None:
        overrides['soc'] = fault.soc_override
    if fault.temp_payload_override is not None:
        overrides['temp_payload'] = fault.temp_payload_override
    if fault.temp_battery_override is not None:
        overrides['temp_battery'] = fault.temp_battery_override
    return replace(nominal_state, **overrides)
