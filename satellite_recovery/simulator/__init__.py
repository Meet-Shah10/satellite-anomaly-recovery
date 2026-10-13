"""satellite_recovery.simulator — spacecraft physics, orbit, commands, faults."""
from .orbit import OrbitSchedule
from .spacecraft import SpacecraftState, SpacecraftParams, Simulator
from .commands import COMMANDS, legal_actions, apply_command, command_cost, ALL_COMMAND_NAMES
from .faults import FaultProfile, FAULT_REGISTRY, inject_fault

__all__ = [
    "OrbitSchedule",
    "SpacecraftState", "SpacecraftParams", "Simulator",
    "COMMANDS", "legal_actions", "apply_command", "command_cost", "ALL_COMMAND_NAMES",
    "FaultProfile", "FAULT_REGISTRY", "inject_fault",
]
