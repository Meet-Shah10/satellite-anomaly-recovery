"""
Unit tests for the eight spacecraft recovery commands, preconditions, effects, and costs.
"""

from __future__ import annotations

import pytest

from satellite_recovery.simulator.spacecraft import SpacecraftState, SpacecraftParams
from satellite_recovery.simulator.commands import (
    COMMANDS,
    ALL_COMMAND_NAMES,
    legal_actions,
    apply_command,
    command_cost,
)


def test_command_registry_completeness():
    """Verify that all 8 recovery commands are registered."""
    expected = {
        'payload_off',
        'payload_on',
        'heater_on',
        'heater_off',
        'low_power_mode',
        'resume_nominal',
        'transmitter_off',
        'safe_mode',
    }
    assert set(COMMANDS.keys()) == expected
    assert set(ALL_COMMAND_NAMES) == expected
    assert len(COMMANDS) == 8


def test_command_costs():
    """Verify scalar cost calculation α·τ + β·ε."""
    params = SpacecraftParams(alpha=1.0, beta=0.01)

    # payload_off: latency 5s, energy 10J -> 5.0*1.0 + 10.0*0.01 = 5.10
    cost_payload_off = command_cost('payload_off', params)
    assert pytest.approx(cost_payload_off, 0.001) == 5.10

    # payload_on: latency 30s, energy 50J -> 30.0*1.0 + 50.0*0.01 = 30.50
    cost_payload_on = command_cost('payload_on', params)
    assert pytest.approx(cost_payload_on, 0.001) == 30.50

    # safe_mode: latency 15s, energy 30J -> 15.0*1.0 + 30.0*0.01 = 15.30
    cost_safe_mode = command_cost('safe_mode', params)
    assert pytest.approx(cost_safe_mode, 0.001) == 15.30


def test_preconditions_and_legal_actions():
    """Verify command legality under different subsystem configurations."""
    nominal = SpacecraftState(
        time=0.0,
        soc=0.75,
        temp_battery=20.0,
        temp_payload=22.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    actions = legal_actions(nominal)

    # In nominal state:
    assert 'payload_off' in actions
    assert 'payload_on' not in actions  # already on
    assert 'heater_on' in actions
    assert 'heater_off' not in actions  # already off
    assert 'low_power_mode' in actions
    assert 'resume_nominal' not in actions  # already nominal
    assert 'transmitter_off' in actions
    assert 'safe_mode' in actions


def test_safe_mode_and_payload_on_preconditions():
    """Verify safe_mode effects and that payload_on is forbidden while in safe_mode."""
    nominal = SpacecraftState(
        time=0.0,
        soc=0.75,
        temp_battery=20.0,
        temp_payload=22.0,
        temp_bus=20.0,
        heater_on=False,
        payload_on=True,
        transmitter_on=True,
        mode='nominal',
    )
    safe_state = apply_command(nominal, 'safe_mode')

    assert safe_state.mode == 'safe_mode'
    assert safe_state.payload_on is False
    assert safe_state.transmitter_on is False

    # In safe_mode, payload_on must NOT be legal
    assert 'payload_on' not in legal_actions(safe_state)
    assert 'safe_mode' not in legal_actions(safe_state)  # already in safe_mode
