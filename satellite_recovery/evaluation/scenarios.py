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



# ---------------------------------------------------------------------------
# Canonical hard scenarios — each requires depth 5–8 to solve
# ---------------------------------------------------------------------------

SINGLE_THERMAL = _s(
    name='single_thermal',
    fault='thermal_runaway',
    desc='Thermal runaway (62 °C) in sunlit arc — payload_off + 6 wait steps to cool',
    orbit_phase=0.10,   # full sun: SoC not at risk; pure thermal problem; depth ~7
)

SINGLE_POWER = _s(
    name='single_power',
    fault='battery_degradation',
    desc='Battery degradation SoC=0.20 late sunlit — shed loads + 6 wait steps',
    orbit_phase=0.50,   # late sunlit: declining solar; ~6 wait steps to charge SoC to 0.35
)

SINGLE_LOAD = _s(
    name='single_load',
    fault='high_bus_load',
    desc='Rogue 30 W consumer + SoC=0.20 mid-sunlit — safe_mode + 4-5 wait steps',
    orbit_phase=0.45,   # mid-late sunlit: enough solar to charge after shedding; depth ~5
)

CASCADE = _s(
    name='cascade',
    fault='cascade_thermal_power',
    desc='Thermal (62 °C) + SoC=0.22 simultaneously — interleaved thermal+power management',
    orbit_phase=0.10,   # full sun: both constraints active; depth ~8; hardest scenario
)

# ---------------------------------------------------------------------------
# Sunlit comparison variants — easier; useful for ablation studies
# ---------------------------------------------------------------------------

SINGLE_THERMAL_SUN = _s(
    name='single_thermal_sun',
    fault='thermal_runaway',
    desc='Thermal runaway (62 °C) peak sunlit — same fault, maximum solar flux',
    orbit_phase=0.05,   # peak sun: maximum solar flux; SoC stays very high; depth ~7
)

SINGLE_POWER_SUN = _s(
    name='single_power_sun',
    fault='battery_degradation',
    desc='Battery degradation SoC=0.20 early sunlit — fewer wait steps than phase=0.50',
    orbit_phase=0.25,   # early-mid sunlit: more solar → SoC recovers faster (depth ~4)
)
