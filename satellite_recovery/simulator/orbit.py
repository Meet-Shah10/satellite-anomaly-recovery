"""
Orbital mechanics: solar-flux as a function of simulation time.

Models a circular LEO orbit (period = 5 400 s, 90 min) with eclipse periods.
Solar power follows a raised-cosine profile during the sunlit arc and drops
to zero during eclipse.  All parameters are configurable so experiments can
test different orbital geometries without touching algorithmic code.
"""

from __future__ import annotations

import numpy as np


class OrbitSchedule:
    """Compute solar-panel output power at any simulation time."""

    ORBITAL_PERIOD: float = 5_400.0        # seconds  (≈ 90-min LEO)
    MAX_SOLAR_POWER: float = 280.0         # Watts    (end-of-life degraded)
    DEFAULT_ECLIPSE_FRACTION: float = 0.35 # 35 % of orbit in shadow

    def __init__(
        self,
        t0: float = 0.0,
        eclipse_fraction: float = DEFAULT_ECLIPSE_FRACTION,
        max_solar_power: float = MAX_SOLAR_POWER,
        orbital_period: float = ORBITAL_PERIOD,
    ) -> None:
        """
        Parameters
        ----------
        t0 :
            Simulation time (s) at which the spacecraft is at orbital phase 0
            (mid-sunlit arc).
        eclipse_fraction :
            Fraction of the orbit spent in shadow [0, 1].
        max_solar_power :
            Peak solar panel output in Watts.
        orbital_period :
            Orbital period in seconds.
        """
        self.t0 = t0
        self.eclipse_fraction = float(eclipse_fraction)
        self.max_solar_power = float(max_solar_power)
        self.orbital_period = float(orbital_period)

    # ------------------------------------------------------------------
    def _phase(self, t: float) -> float:
        """Orbital phase in [0, 1)."""
        return ((t - self.t0) % self.orbital_period) / self.orbital_period

    def solar_flux(self, t: float) -> float:
        """
        Solar-panel output in Watts at simulation time *t*.

        Uses a raised-cosine profile across the sunlit arc so that ingress and
        egress are tapered rather than step-shaped.
        """
        phi = self._phase(t)
        sunlit = 1.0 - self.eclipse_fraction
        if phi >= sunlit:
            return 0.0
        # sun_phi ∈ [0, 1] across the sunlit arc
        sun_phi = phi / sunlit
        return float(self.max_solar_power * np.cos(np.pi * (sun_phi - 0.5)))

    def in_eclipse(self, t: float) -> bool:
        """Return True when *t* falls in the eclipse arc."""
        return self._phase(t) >= (1.0 - self.eclipse_fraction)

    def time_to_eclipse(self, t: float) -> float:
        """Seconds until next eclipse entry; 0 if already in eclipse."""
        phi = self._phase(t)
        sunlit = 1.0 - self.eclipse_fraction
        if phi >= sunlit:
            return 0.0
        return (sunlit - phi) * self.orbital_period

    def time_to_sunlight(self, t: float) -> float:
        """Seconds until next sunlight entry; 0 if already in sunlight."""
        phi = self._phase(t)
        sunlit = 1.0 - self.eclipse_fraction
        if phi < sunlit:
            return 0.0
        return (1.0 - phi) * self.orbital_period
