"""
Command definitions: preconditions, instantaneous effects, and costs.

The eight recovery commands form the action set A(x) from Section 3 of the
specification document.  Each command is defined by:

    precondition : SpacecraftState → bool
        Returns True when the command is legal in the current state.
    effect       : SpacecraftState → dict[str, Any]
        Field overrides applied to the state (via dataclasses.replace).
    latency_s    : float  — τ(a), command execution latency in seconds.
    energy_j     : float  — ε(a), energy consumed by the command in joules.

Path cost for one command:
    cost(a, params) = params.alpha · τ(a) + params.beta · ε(a)

Command application happens *before* the physics step in transition(s, a):
    x' = Simulator.step( apply_command(x, a) )

This matches the pseudocode in Section 5.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any, Callable

from .spacecraft import SpacecraftState, SpacecraftParams


# ---------------------------------------------------------------------------
# Command descriptor
# ---------------------------------------------------------------------------

class Command:
    """
    Descriptor for one recovery command.

    Uses a plain class (not a frozen dataclass) because the precondition and
    effect fields are lambdas, which are not hashable.  __hash__ and __eq__
    are keyed on `name` so Command objects can be used as dict keys.
    """

    __slots__ = ('name', 'precondition', 'effect', 'latency_s', 'energy_j')

    def __init__(
        self,
        name:         str,
        precondition: Callable[[SpacecraftState], bool],
        effect:       Callable[[SpacecraftState], dict[str, Any]],
        latency_s:    float,
        energy_j:     float,
    ) -> None:
        self.name         = name
        self.precondition = precondition
        self.effect       = effect
        self.latency_s    = latency_s
        self.energy_j     = energy_j

    def is_applicable(self, state: SpacecraftState) -> bool:
        return self.precondition(state)

    def apply(self, state: SpacecraftState) -> SpacecraftState:
        """Return a new state with the command effect applied."""
        return replace(state, **self.effect(state))

    def cost(self, params: SpacecraftParams) -> float:
        return params.alpha * self.latency_s + params.beta * self.energy_j

    def __hash__(self) -> int:
        return hash(self.name)

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Command) and self.name == other.name

    def __repr__(self) -> str:
        return f"Command({self.name!r})"


# ---------------------------------------------------------------------------
# Registry builder
# ---------------------------------------------------------------------------

COMMANDS: dict[str, Command] = {}


def _register(
    name: str,
    pre: Callable[[SpacecraftState], bool],
    eff: Callable[[SpacecraftState], dict],
    latency: float,
    energy: float,
) -> Command:
    cmd = Command(
        name=name,
        precondition=pre,
        effect=eff,
        latency_s=latency,
        energy_j=energy,
    )
    COMMANDS[name] = cmd
    return cmd


# ---------------------------------------------------------------------------
# The nine recovery commands
# ---------------------------------------------------------------------------

# 1. PAYLOAD_OFF
#    Shed the primary payload (saves ≈ 40 W).
#    Cools the payload node (no internal electronics dissipation).
#    Thermal cascade: payload cooling reduces coupling heat to bus.
PAYLOAD_OFF = _register(
    name='payload_off',
    pre=lambda s: s.payload_on,
    eff=lambda s: {'payload_on': False},
    latency=5.0,
    energy=10.0,
)

# 2. PAYLOAD_ON
#    Restore payload power (not allowed in safe_mode).
PAYLOAD_ON = _register(
    name='payload_on',
    pre=lambda s: (not s.payload_on) and s.mode != 'safe_mode',
    eff=lambda s: {'payload_on': True},
    latency=30.0,
    energy=50.0,
)

# 3. HEATER_ON
#    Activate payload heater (+15 W electrical draw = +15 W heat to payload).
#    Thermal cascade: heater draws from a battery that may already be low.
HEATER_ON = _register(
    name='heater_on',
    pre=lambda s: not s.heater_on,
    eff=lambda s: {'heater_on': True},
    latency=2.0,
    energy=5.0,
)

# 4. HEATER_OFF
#    Deactivate heater (saves 15 W, payload may cool below limit).
HEATER_OFF = _register(
    name='heater_off',
    pre=lambda s: s.heater_on,
    eff=lambda s: {'heater_on': False},
    latency=2.0,
    energy=5.0,
)

# 5. LOW_POWER_MODE
#    Throttle avionics from 30 W to 18 W (Tier-1 load shed).
#    Thermal cascade: lower bus heat, lower battery discharge rate.
LOW_POWER_MODE = _register(
    name='low_power_mode',
    pre=lambda s: s.mode == 'nominal',
    eff=lambda s: {'mode': 'low_power'},
    latency=10.0,
    energy=20.0,
)

# 6. RESUME_NOMINAL
#    Exit low-power mode and restore avionics to full load.
RESUME_NOMINAL = _register(
    name='resume_nominal',
    pre=lambda s: s.mode == 'low_power',
    eff=lambda s: {'mode': 'nominal'},
    latency=10.0,
    energy=20.0,
)

# 7. TRANSMITTER_OFF
#    Shed 15 W transmitter load (Tier-1 load shed).
TRANSMITTER_OFF = _register(
    name='transmitter_off',
    pre=lambda s: s.transmitter_on,
    eff=lambda s: {'transmitter_on': False},
    latency=3.0,
    energy=5.0,
)

# 8. SAFE_MODE
#    Maximum power saving: low avionics + payload off + transmitter off (Tier-2).
#    Thermal cascade: shedding payload removes the thermal load that was warming
#    the bus; bus temperature may subsequently drop.
SAFE_MODE = _register(
    name='safe_mode',
    pre=lambda s: s.mode != 'safe_mode',
    eff=lambda s: {
        'mode': 'safe_mode',
        'payload_on': False,
        'transmitter_on': False,
    },
    latency=15.0,
    energy=30.0,
)

# 9. WAIT
#    No-op command: advance one physics time step (dt=60 s) without changing
#    any switch states.  Essential for scenarios requiring the satellite to
#    hold a configuration while physics evolves (e.g., waiting for temperature
#    to cool or battery to charge after load shedding).
#    Always legal; cost is time only (no energy, just 60 s latency).
WAIT = _register(
    name='wait',
    pre=lambda s: True,
    eff=lambda s: {},        # no state flag changes
    latency=60.0,            # one full physics step
    energy=0.0,
)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

ALL_COMMAND_NAMES: tuple[str, ...] = tuple(COMMANDS.keys())


def legal_actions(state: SpacecraftState) -> list[str]:
    """Return names of all commands whose preconditions hold in *state*."""
    return [name for name, cmd in COMMANDS.items() if cmd.is_applicable(state)]


def apply_command(state: SpacecraftState, name: str) -> SpacecraftState:
    """Apply named command to *state* and return the modified state."""
    return COMMANDS[name].apply(state)


def command_cost(name: str, params: SpacecraftParams) -> float:
    """Scalar path cost: α · τ(a) + β · ε(a)."""
    return COMMANDS[name].cost(params)

