"""
Spacecraft state, physical parameters, and the discrete-time simulator step.

Subsystems modelled
-------------------
Power
    Net power balance (solar-in minus total bus load) drives SoC.
    Charging and discharging efficiencies are applied asymmetrically.
    Battery capacity: 50 Wh (180 000 J).

Thermal — three lumped RC nodes, first-order Euler integration
    battery : ohmic losses from charge/discharge, coupled to bus, radiates to space
    payload : internal electronics dissipation, heater injection, radiates to space
              and couples to bus
    bus     : fraction of total bus load as heat, coupled to battery and payload,
              radiates to space

All physical constants live in SpacecraftParams so experiments can vary
them without touching algorithmic code.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, ClassVar

import numpy as np

if TYPE_CHECKING:
    from .orbit import OrbitSchedule


# ---------------------------------------------------------------------------
# Physical parameters
# ---------------------------------------------------------------------------

@dataclass
class SpacecraftParams:
    """All physical constants, safety limits, and simulation settings."""

    # ---- Power ----------------------------------------------------------
    battery_capacity_j: float = 180_000.0   # 50 Wh
    charge_efficiency: float   = 0.95
    discharge_efficiency: float = 0.97

    # Electrical loads (Watts) when each subsystem is active
    avionics_load: float       = 30.0   # always-on avionics
    payload_load: float        = 40.0   # when payload_on
    heater_load: float         = 15.0   # when heater_on (electrical draw = heat delivered)
    transmitter_load: float    = 20.0   # when transmitter_on
    low_power_avionics_load: float = 18.0  # avionics in low_power / safe_mode

    # ---- Thermal --------------------------------------------------------
    # Effective radiative sink temperature (°C).
    # Approximates LEO Earth-facing radiation environment.
    temp_space_sink: float = -90.0

    # Battery thermal node
    c_bat: float        = 500.0   # J/°C  thermal capacitance
    ua_bat_space: float = 0.50    # W/°C  conductance to space
    ua_bat_bus: float   = 0.10    # W/°C  coupling to bus node

    # Payload thermal node
    c_pay: float        = 1_000.0  # J/°C
    ua_pay_space: float = 0.30     # W/°C
    ua_pay_bus: float   = 0.20     # W/°C coupling to bus node
    payload_heat_frac: float = 0.35  # fraction of payload electrical load → heat

    # Bus thermal node
    c_bus: float        = 800.0   # J/°C
    ua_bus_space: float = 0.80    # W/°C
    bus_heat_frac: float = 0.12   # fraction of total bus load → heat in bus node

    # ---- Hard safety limits (prune nodes that violate these) ------------
    soc_hard_min: float       = 0.15
    soc_hard_max: float       = 1.00
    temp_bat_hard_min: float  = -15.0
    temp_bat_hard_max: float  = 50.0
    temp_pay_hard_min: float  = -25.0
    temp_pay_hard_max: float  = 70.0
    temp_bus_hard_min: float  = -20.0
    temp_bus_hard_max: float  = 60.0

    # ---- Nominal goal bands (goal test) ---------------------------------
    soc_nominal_min: float      = 0.35
    temp_bat_nominal_min: float = -5.0
    temp_bat_nominal_max: float = 40.0
    temp_pay_nominal_min: float = -15.0
    temp_pay_nominal_max: float = 55.0
    temp_bus_nominal_min: float = -10.0
    temp_bus_nominal_max: float = 50.0

    # ---- Simulation -----------------------------------------------------
    dt: float           = 60.0       # seconds per timestep
    max_horizon: float  = 3_600.0    # 1-hour recovery deadline

    # ---- Action cost weights  g(n) = Σ(α·τ + β·ε) ----------------------
    alpha: float = 1.0    # weight on latency (s)
    beta: float  = 0.01   # weight on energy (J); 1 J ≈ 0.01 s


# ---------------------------------------------------------------------------
# Spacecraft state (immutable)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SpacecraftState:
    """
    Immutable, hashable snapshot of the spacecraft at one timestep.

    Fault disturbance fields (fault_heat_payload, fault_heat_battery,
    fault_extra_load) are set by fault injection before the search starts
    and persist unchanged throughout — the search selects recovery commands,
    not fault remediation.
    """

    time: float            # simulation seconds from mission epoch
    soc: float             # battery state of charge  [0, 1]
    temp_battery: float    # battery pack temperature (°C)
    temp_payload: float    # payload assembly temperature (°C)
    temp_bus: float        # power / electronics bus temperature (°C)
    heater_on: bool
    payload_on: bool
    transmitter_on: bool
    mode: str              # 'nominal' | 'low_power' | 'safe_mode'

    # Persistent fault disturbances
    fault_heat_payload: float = 0.0   # extra heat on payload node (W)
    fault_heat_battery: float = 0.0   # extra heat on battery node (W)
    fault_extra_load: float   = 0.0   # extra electrical bus load (W)

    # ------------------------------------------------------------------
    #  Interface for search algorithms
    # ------------------------------------------------------------------

    def signature(self) -> tuple:
        """
        Coarsened, hashable key used in the closed set and score cache.

        Continuous values are quantised so that floating-point rounding
        differences do not create spurious distinct states.
        """
        return (
            round(self.soc, 2),
            int(round(self.temp_battery)),
            int(round(self.temp_payload)),
            int(round(self.temp_bus)),
            self.heater_on,
            self.payload_on,
            self.transmitter_on,
            self.mode,
            int(self.time // 60),    # coarsen to nearest minute
        )

    def as_vector(self) -> np.ndarray:
        """
        Return state as a float32 vector for the anomaly scorer.

        Dimensions (8):
            soc, temp_battery, temp_payload, temp_bus,
            heater_on, payload_on, transmitter_on, mode_code
        """
        mode_code = {'nominal': 0.0, 'low_power': 1.0, 'safe_mode': 2.0}.get(self.mode, 0.0)
        return np.array([
            self.soc,
            self.temp_battery,
            self.temp_payload,
            self.temp_bus,
            float(self.heater_on),
            float(self.payload_on),
            float(self.transmitter_on),
            mode_code,
        ], dtype=np.float32)

    N_FEATURES: ClassVar[int] = 8
    FEATURE_NAMES: ClassVar[tuple] = (
        'soc', 'temp_battery', 'temp_payload', 'temp_bus',
        'heater_on', 'payload_on', 'transmitter_on', 'mode_code',
    )

    # ------------------------------------------------------------------
    def violates_hard_constraints(self, p: SpacecraftParams) -> bool:
        """Return True if any hard safety limit is breached."""
        return (
            self.soc < p.soc_hard_min
            or self.soc > p.soc_hard_max
            or self.temp_battery < p.temp_bat_hard_min
            or self.temp_battery > p.temp_bat_hard_max
            or self.temp_payload < p.temp_pay_hard_min
            or self.temp_payload > p.temp_pay_hard_max
            or self.temp_bus < p.temp_bus_hard_min
            or self.temp_bus > p.temp_bus_hard_max
        )

    def in_nominal_band(self, p: SpacecraftParams) -> bool:
        """Return True when all monitored parameters are within nominal bands."""
        return (
            self.soc >= p.soc_nominal_min
            and p.temp_bat_nominal_min <= self.temp_battery <= p.temp_bat_nominal_max
            and p.temp_pay_nominal_min <= self.temp_payload <= p.temp_pay_nominal_max
            and p.temp_bus_nominal_min <= self.temp_bus <= p.temp_bus_nominal_max
        )

    def parameter_violations(self, p: SpacecraftParams) -> dict[str, float]:
        """
        Signed violation magnitudes per out-of-band parameter.

        Positive: above nominal upper limit.
        Negative: below nominal lower limit.
        Absent key: within band.
        """
        v: dict[str, float] = {}
        if self.soc < p.soc_nominal_min:
            v['soc'] = self.soc - p.soc_nominal_min                      # negative
        if self.temp_battery < p.temp_bat_nominal_min:
            v['temp_battery'] = self.temp_battery - p.temp_bat_nominal_min
        elif self.temp_battery > p.temp_bat_nominal_max:
            v['temp_battery'] = self.temp_battery - p.temp_bat_nominal_max
        if self.temp_payload < p.temp_pay_nominal_min:
            v['temp_payload'] = self.temp_payload - p.temp_pay_nominal_min
        elif self.temp_payload > p.temp_pay_nominal_max:
            v['temp_payload'] = self.temp_payload - p.temp_pay_nominal_max
        if self.temp_bus < p.temp_bus_nominal_min:
            v['temp_bus'] = self.temp_bus - p.temp_bus_nominal_min
        elif self.temp_bus > p.temp_bus_nominal_max:
            v['temp_bus'] = self.temp_bus - p.temp_bus_nominal_max
        return v

    def safety_margin(self, p: SpacecraftParams) -> float:
        """
        Minimum normalised distance to any hard limit (positive = safe).

        Used as a metric in evaluation; a higher value means the trajectory
        kept larger clearance from failures.
        """
        margins = [
            (self.soc - p.soc_hard_min) / max(p.soc_hard_max - p.soc_hard_min, 1e-6),
            (p.temp_bat_hard_max - self.temp_battery) / max(p.temp_bat_hard_max - p.temp_bat_hard_min, 1e-6),
            (self.temp_battery - p.temp_bat_hard_min) / max(p.temp_bat_hard_max - p.temp_bat_hard_min, 1e-6),
            (p.temp_pay_hard_max - self.temp_payload) / max(p.temp_pay_hard_max - p.temp_pay_hard_min, 1e-6),
            (self.temp_payload - p.temp_pay_hard_min) / max(p.temp_pay_hard_max - p.temp_pay_hard_min, 1e-6),
            (p.temp_bus_hard_max - self.temp_bus) / max(p.temp_bus_hard_max - p.temp_bus_hard_min, 1e-6),
            (self.temp_bus - p.temp_bus_hard_min) / max(p.temp_bus_hard_max - p.temp_bus_hard_min, 1e-6),
        ]
        return float(min(margins))


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------

class Simulator:
    """
    Discrete-time, deterministic forward simulator.

    Implements the transition model T(x, a) from Section 3 of the
    specification document.  The step() method applies one dt of physics
    to an already-command-modified state; command application is handled
    separately in satellite_recovery.simulator.commands.
    """

    def __init__(
        self,
        params: SpacecraftParams,
        orbit: "OrbitSchedule",
    ) -> None:
        self.params = params
        self.orbit = orbit

    # ------------------------------------------------------------------
    def total_bus_load(self, state: SpacecraftState) -> float:
        """Total electrical load drawn from the bus in Watts."""
        p = self.params
        avionics = (
            p.low_power_avionics_load
            if state.mode in ('low_power', 'safe_mode')
            else p.avionics_load
        )
        return (
            avionics
            + (p.payload_load    if state.payload_on     else 0.0)
            + (p.heater_load     if state.heater_on      else 0.0)
            + (p.transmitter_load if state.transmitter_on else 0.0)
            + state.fault_extra_load
        )

    # ------------------------------------------------------------------
    def step(self, state: SpacecraftState) -> SpacecraftState:
        """
        Advance *state* by one dt using first-order Euler integration.

        Fault disturbance fields are carried through unchanged.
        Returns a new, immutable SpacecraftState.
        """
        p   = self.params
        dt  = p.dt

        # ---- Power balance -------------------------------------------
        solar  = self.orbit.solar_flux(state.time)
        load   = self.total_bus_load(state)
        p_net  = solar - load     # > 0 → charging, < 0 → discharging

        if p_net >= 0.0:
            delta_soc = (p_net * p.charge_efficiency * dt) / p.battery_capacity_j
        else:
            delta_soc = (p_net / p.discharge_efficiency * dt) / p.battery_capacity_j

        new_soc = float(np.clip(state.soc + delta_soc, 0.0, 1.0))

        # ---- Battery ohmic heat dissipation --------------------------
        loss_frac   = (1.0 - p.charge_efficiency) if p_net >= 0.0 else (1.0 - p.discharge_efficiency)
        q_bat_diss  = abs(p_net) * loss_frac   # W

        # ---- Thermal heat sources ------------------------------------
        # Payload: internal electronics + heater (electrical = heat) + fault
        q_pay_in = (
            p.payload_load * p.payload_heat_frac * float(state.payload_on)
            + (p.heater_load if state.heater_on else 0.0)
            + state.fault_heat_payload
        )
        # Bus: fraction of total electrical load → joule heating
        q_bus_in = load * p.bus_heat_frac

        # ---- Euler thermal step (°C/s × dt) --------------------------
        ts = p.temp_space_sink   # effective radiative sink

        dT_bat = (
              (q_bat_diss + state.fault_heat_battery)
            - p.ua_bat_space * (state.temp_battery - ts)
            - p.ua_bat_bus   * (state.temp_battery  - state.temp_bus)
        ) / p.c_bat

        dT_pay = (
              q_pay_in
            - p.ua_pay_space * (state.temp_payload - ts)
            - p.ua_pay_bus   * (state.temp_payload  - state.temp_bus)
        ) / p.c_pay

        dT_bus = (
              q_bus_in
            + p.ua_bat_bus  * (state.temp_battery - state.temp_bus)
            + p.ua_pay_bus  * (state.temp_payload  - state.temp_bus)
            - p.ua_bus_space * (state.temp_bus     - ts)
        ) / p.c_bus

        return replace(
            state,
            time=state.time + dt,
            soc=new_soc,
            temp_battery=float(state.temp_battery + dT_bat * dt),
            temp_payload=float(state.temp_payload + dT_pay * dt),
            temp_bus=float(state.temp_bus         + dT_bus * dt),
        )

    # ------------------------------------------------------------------
    def run_trajectory(
        self,
        initial: SpacecraftState,
        n_steps: int,
    ) -> list[SpacecraftState]:
        """Simulate for *n_steps* and return the full trajectory list."""
        traj = [initial]
        s = initial
        for _ in range(n_steps):
            s = self.step(s)
            traj.append(s)
        return traj

    def make_default_nominal_state(self, t: float = 0.0) -> SpacecraftState:
        """
        Return a typical nominal initial state for use in data generation
        and unit tests.
        """
        return SpacecraftState(
            time=t,
            soc=0.75,
            temp_battery=15.0,
            temp_payload=22.0,
            temp_bus=20.0,
            heater_on=False,
            payload_on=True,
            transmitter_on=True,
            mode='nominal',
        )
