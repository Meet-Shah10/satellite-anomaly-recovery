"""
Evaluation scenario definitions (Section 7 of the specification document).

Each Scenario bundles:
    fault_name    — key into FAULT_REGISTRY
    description   — human-readable label
    orbit_phase   — fraction of orbital period elapsed at fault onset;
                    0 = start of sunlit arc, 0.7 = deep in eclipse
    initial_soc   — SoC override (if different from the FaultProfile)

A Scenario produces a RecoveryProblem through build_problem().

Three canonical scenarios are provided:
    single_thermal    — isolated thermal runaway (payload temperature)
    single_power      — isolated battery degradation
    single_load       — isolated high bus load
    cascade           — simultaneous thermal + power stress

A fourth family (degraded_actuator_*) tests each scenario with one command
disabled (not modelled as a state field here; the CLI filters COMMANDS).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..simulator.orbit import OrbitSchedule
from ..simulator.spacecraft import SpacecraftParams, Simulator
from ..simulator.faults import FAULT_REGISTRY, inject_fault
from ..search.problem import RecoveryProblem


# ---------------------------------------------------------------------------
# Scenario descriptor
# ---------------------------------------------------------------------------

@dataclass
class Scenario:
    """
    A named evaluation scenario.

    Parameters
    ----------
    name         : Unique identifier used in CSV output.
    fault_name   : Key into FAULT_REGISTRY.
    description  : Long-form label for plots and tables.
    orbit_phase  : Orbital phase at fault onset ∈ [0, 1).
                   0.0 → mid sunlit arc (maximum solar).
                   0.65 → eclipse (zero solar, thermal stress).
    window_size  : Number of states in the scorer window.
    """

    name:         str
    fault_name:   str
    description:  str
    orbit_phase:  float = 0.65    # default: eclipse onset (hard case)
    window_size:  int   = 10

    # ------------------------------------------------------------------
    def build_problem(
        self,
        params: Optional[SpacecraftParams] = None,
        orbit:  Optional[OrbitSchedule]    = None,
    ) -> RecoveryProblem:
        """
        Instantiate a RecoveryProblem for this scenario.

        Uses default SpacecraftParams and OrbitSchedule if not provided.
        The initial_state is constructed by:
            1. Building a steady-state nominal state at the given orbit phase.
            2. Injecting the fault profile.
        """
        if params is None:
            params = SpacecraftParams()
        if orbit is None:
            # Set t0 so that orbit_phase aligns with t=0
            period = OrbitSchedule.ORBITAL_PERIOD
            t0     = -self.orbit_phase * period
            orbit  = OrbitSchedule(t0=t0)

        sim = Simulator(params, orbit)

        # A representative nominal initial state
        nominal = sim.make_default_nominal_state(t=0.0)

        fault_profile = FAULT_REGISTRY[self.fault_name]
        initial = inject_fault(nominal, fault_profile)

        return RecoveryProblem(
            initial_state=initial,
            params=params,
            simulator=sim,
            window_size=self.window_size,
        )


# ---------------------------------------------------------------------------
# Canonical scenarios
# ---------------------------------------------------------------------------

SCENARIOS: dict[str, Scenario] = {}


def _s(name, fault, desc, orbit_phase=0.65) -> Scenario:
    sc = Scenario(
        name=name,
        fault_name=fault,
        description=desc,
        orbit_phase=orbit_phase,
    )
    SCENARIOS[name] = sc
    return sc


SINGLE_THERMAL = _s(
    name='single_thermal',
    fault='thermal_runaway',
    desc='Isolated thermal runaway on payload node (eclipse onset)',
    orbit_phase=0.62,   # early eclipse: payload heats without solar assist
)

SINGLE_POWER = _s(
    name='single_power',
    fault='battery_degradation',
    desc='Battery degradation with low initial SoC (sunlit — charging possible)',
    orbit_phase=0.20,   # sunlit arc: solar charging available to recover SoC
)

SINGLE_LOAD = _s(
    name='single_load',
    fault='high_bus_load',
    desc='Unexpected high bus load — sunlit arc (load shed + solar recovery)',
    orbit_phase=0.25,   # sunlit arc: solar charging available once load shed
)

CASCADE = _s(
    name='cascade',
    fault='cascade_thermal_power',
    desc='Simultaneous thermal runaway + high bus load (hard cascade)',
    orbit_phase=0.30,   # sunlit arc: solar available, but thermal + power both stressed
)

# Sunlit variants (easier: solar power available)
SINGLE_THERMAL_SUN = _s(
    name='single_thermal_sun',
    fault='thermal_runaway',
    desc='Thermal runaway — sunlit arc (solar available)',
    orbit_phase=0.10,
)

SINGLE_POWER_SUN = _s(
    name='single_power_sun',
    fault='battery_degradation',
    desc='Battery degradation — sunlit arc',
    orbit_phase=0.15,
)
