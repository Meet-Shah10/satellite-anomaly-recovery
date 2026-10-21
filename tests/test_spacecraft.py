"""
Unit tests for SpacecraftState, SpacecraftParams, Simulator, and OrbitSchedule.
"""

from __future__ import annotations

import math
from dataclasses import FrozenInstanceError

import pytest
import numpy as np

from satellite_recovery.simulator.spacecraft import SpacecraftState, SpacecraftParams, Simulator
from satellite_recovery.simulator.orbit import OrbitSchedule


def test_spacecraft_state_creation_and_immutability():
    """Verify SpacecraftState constructs correctly and is immutable."""
    s = SpacecraftState(
        time=120.0,
        soc=0.85,
        temp_battery=20.0,
        temp_payload=25.0,
        temp_bus=22.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    assert s.time == 120.0
    assert s.soc == 0.85
    assert s.mode == 'nominal'
    assert s.fault_heat_payload == 0.0

    # Test immutability
    with pytest.raises(FrozenInstanceError):
        s.soc = 0.50  # type: ignore


def test_state_vector_and_signature():
    """Verify vectorization and coarsened signatures for closed set hashing."""
    s = SpacecraftState(
        time=65.0,
        soc=0.75432,
        temp_battery=19.8,
        temp_payload=22.1,
        temp_bus=20.4,
        heater_on=True,
        payload_on=False,
        transmitter_on=True,
        mode='low_power',
    )
    vec = s.as_vector()
    assert isinstance(vec, np.ndarray)
    assert vec.shape == (8,)
    assert vec.dtype == np.float32
    assert math.isclose(vec[0], 0.75432, rel_tol=1e-4)
    assert vec[4] == 1.0  # heater_on
    assert vec[5] == 0.0  # payload_on
    assert vec[7] == 1.0  # low_power mode code

    sig = s.signature()
    assert isinstance(sig, tuple)
    assert len(sig) == 9
    assert sig[0] == 0.75  # rounded SoC
    assert sig[1] == 20    # rounded battery temp
    assert sig[8] == 1     # coarsened time (65 // 60 = 1 minute)


def test_simulator_step_physics_sunlight():
    """Verify one simulation step in peak sunlight charges the battery."""
    params = SpacecraftParams(dt=60.0)
    orbit = OrbitSchedule(t0=0.0)
    sim = Simulator(params, orbit)

    # In OrbitSchedule, phi=0 is sunrise (flux=0). Mid-sunlit arc is at phi = 0.5 * (1 - 0.35) = 0.325
    mid_sunlit_time = 0.325 * orbit.orbital_period  # t = 1755s
    solar_peak = orbit.solar_flux(mid_sunlit_time)
    assert pytest.approx(solar_peak, 0.1) == 280.0

    init_state = SpacecraftState(
        time=mid_sunlit_time,
        soc=0.75,
        temp_battery=15.0,
        temp_payload=22.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    # Total nominal load is 30 (avionics) + 40 (payload) + 20 (tx) = 90 W
    # Peak solar is 280 W, so net power is +190 W, which charges the battery
    next_state = sim.step(init_state)

    assert next_state.time == mid_sunlit_time + 60.0
    assert math.isfinite(next_state.soc)
    assert math.isfinite(next_state.temp_battery)
    assert math.isfinite(next_state.temp_payload)
    assert math.isfinite(next_state.temp_bus)
    assert next_state.soc > init_state.soc


def test_simulator_step_physics_eclipse():
    """Verify one simulation step in eclipse discharges the battery."""
    params = SpacecraftParams(dt=60.0)
    orbit = OrbitSchedule(t0=0.0)
    sim = Simulator(params, orbit)

    # At t = 4000s in 5400s orbit, satellite is in eclipse (phi > 0.65)
    eclipse_time = 4000.0
    assert orbit.in_eclipse(eclipse_time)

    init_state = SpacecraftState(
        time=eclipse_time,
        soc=0.70,
        temp_battery=20.0,
        temp_payload=25.0,
        temp_bus=22.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    next_state = sim.step(init_state)

    assert next_state.time == eclipse_time + 60.0
    assert next_state.soc < init_state.soc


def test_hard_constraints_and_safety_margin():
    """Verify boundary checks for nominal bounds, hard limits, and safety margins."""
    params = SpacecraftParams()

    safe_state = SpacecraftState(
        time=0.0,
        soc=0.70,
        temp_battery=20.0,
        temp_payload=25.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    assert safe_state.in_nominal_band(params) is True
    assert safe_state.violates_hard_constraints(params) is False
    assert safe_state.safety_margin(params) > 0.0
    assert len(safe_state.parameter_violations(params)) == 0

    # Low SoC violation: below nominal floor (0.35) but above hard floor (0.15)
    warning_state = SpacecraftState(
        time=0.0,
        soc=0.28,
        temp_battery=20.0,
        temp_payload=25.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    assert warning_state.in_nominal_band(params) is False
    assert warning_state.violates_hard_constraints(params) is False
    violations = warning_state.parameter_violations(params)
    assert 'soc' in violations
    assert violations['soc'] < 0.0  # negative offset

    # Critical breach: below hard floor (< 0.15)
    critical_state = SpacecraftState(
        time=0.0,
        soc=0.10,
        temp_battery=20.0,
        temp_payload=25.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    assert critical_state.violates_hard_constraints(params) is True
    assert critical_state.safety_margin(params) < 0.0
