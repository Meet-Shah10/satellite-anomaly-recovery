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
    fault_heat_payload=25.0,      # stuck heater / electronics overheating
    temp_payload_override=42.0,   # payload already warm at fault onset
)
"""
Payload temperature rises due to an uncontrolled internal heat source (e.g.
stuck heater relay or overheating electronics).  Without intervention the
payload temperature exceeds the 70 °C hard limit.  The heater draws battery
power that is already stressed by the elevated load, creating a power–thermal
cascade.
"""

BATTERY_DEGRADATION = FaultProfile(
    name='battery_degradation',
    fault_heat_battery=8.0,       # increased internal resistance → ohmic heat
    soc_override=0.28,            # battery already depleted at fault onset
)
"""
Internal battery resistance increases (e.g. cell degradation or partial
short), causing extra self-heating and accelerated discharge.  Low SoC
combined with battery thermal stress stresses the hard floor at 15 % SoC
and the 50 °C battery temperature hard limit.
"""

HIGH_BUS_LOAD = FaultProfile(
    name='high_bus_load',
    fault_extra_load=35.0,        # rogue consumer draws 35 W extra
    soc_override=0.32,
)
"""
An uncontrolled consumer (e.g. failed relay, latchup) draws 35 W of
unscheduled bus current.  Combined with a low initial SoC the spacecraft
cannot sustain the load through eclipse, threatening the SoC floor.
"""

CASCADE_THERMAL_POWER = FaultProfile(
    name='cascade_thermal_power',
    fault_heat_payload=18.0,
    fault_extra_load=20.0,
    soc_override=0.30,
    temp_payload_override=38.0,
)
"""
Simultaneous thermal runaway on the payload and elevated bus load.
This cascading scenario is the hardest for rule-based recovery because
shedding the payload cools the payload node but removes a thermal source
that was keeping the bus warm, and the bus then risks hitting the −20 °C
hard floor.
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
