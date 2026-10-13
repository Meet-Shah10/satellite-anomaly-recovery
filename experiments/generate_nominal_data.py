"""
Generate nominal (no-fault) trajectory data for anomaly scorer training.

This script runs the simulator under a range of initial conditions and
orbital phases, collecting trajectory windows.  The output is saved as
two NumPy files:

    experiments/data/nominal_windows.npy    shape (N, window_size, n_features)
    experiments/data/nominal_windows_meta.npy  (orbit_phase, soc, temp_payload)

Usage::

    python experiments/generate_nominal_data.py [OPTIONS]

Options::

    --n-trajectories  INT   Number of nominal trajectories to simulate (default 500)
    --steps-per-traj  INT   Simulation steps per trajectory (default 200)
    --window-size     INT   Scorer window size (default 10)
    --dt              FLOAT Simulation timestep in seconds (default 60)
    --seed            INT   Random seed (default 0)
    --output-dir      PATH  Output directory (default experiments/data)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np

# Allow running from project root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from satellite_recovery.simulator.orbit import OrbitSchedule
from satellite_recovery.simulator.spacecraft import SpacecraftParams, SpacecraftState, Simulator
from satellite_recovery.anomaly.features import extract_batch_features, N_FEATURES
from satellite_recovery.utils.logging_utils import setup_logging

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------

def generate_nominal_windows(
    n_trajectories:  int,
    steps_per_traj:  int,
    window_size:     int,
    dt:              float,
    seed:            int,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Simulate *n_trajectories* nominal runs and extract all windows.

    Returns
    -------
    windows_raw : ndarray, shape (N_total_windows, window_size, n_state_features)
        Raw state vectors for each window (before feature extraction).
    meta : ndarray, shape (N_total_windows, 3)
        (orbit_phase, initial_soc, initial_temp_payload) for each window.
    """
    rng    = np.random.default_rng(seed)
    params = SpacecraftParams(dt=dt)

    all_windows: list[list[list[float]]] = []
    all_meta:    list[list[float]]       = []

    for traj_idx in range(n_trajectories):
        # Randomise initial conditions within safe nominal ranges
        init_soc      = float(rng.uniform(0.45, 0.95))
        init_temp_bat = float(rng.uniform(5.0, 30.0))
        init_temp_pay = float(rng.uniform(10.0, 40.0))
        init_temp_bus = float(rng.uniform(8.0, 35.0))
        orbit_phase   = float(rng.uniform(0.0, 1.0))

        # Randomise whether payload/heater/transmitter are on
        payload_on    = bool(rng.integers(0, 2))
        heater_on     = bool(rng.integers(0, 2))
        transmitter_on = True   # typically on during nominal ops

        period = OrbitSchedule.ORBITAL_PERIOD
        t0     = -orbit_phase * period
        orbit  = OrbitSchedule(t0=t0)
        sim    = Simulator(params, orbit)

        initial = SpacecraftState(
            time=0.0,
            soc=init_soc,
            temp_battery=init_temp_bat,
            temp_payload=init_temp_pay,
            temp_bus=init_temp_bus,
            heater_on=heater_on,
            payload_on=payload_on,
            transmitter_on=transmitter_on,
            mode='nominal',
        )

        traj = sim.run_trajectory(initial, steps_per_traj)

        # Extract all windows from this trajectory
        for i in range(len(traj)):
            start = max(0, i - window_size + 1)
            window_states = traj[start: i + 1]
            # Pad if window_size not reached yet
            while len(window_states) < window_size:
                window_states = [traj[0]] + window_states
            vecs = [s.as_vector().tolist() for s in window_states]
            all_windows.append(vecs)
            all_meta.append([orbit_phase, init_soc, init_temp_pay])

        if (traj_idx + 1) % 50 == 0:
            log.info(f"Trajectories completed: {traj_idx + 1}/{n_trajectories}")

    windows_arr = np.array(all_windows, dtype=np.float32)
    meta_arr    = np.array(all_meta,    dtype=np.float32)
    return windows_arr, meta_arr


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--n-trajectories',  type=int,   default=500)
    p.add_argument('--steps-per-traj',  type=int,   default=200)
    p.add_argument('--window-size',     type=int,   default=10)
    p.add_argument('--dt',              type=float, default=60.0)
    p.add_argument('--seed',            type=int,   default=0)
    p.add_argument('--output-dir',      type=Path,  default=Path('experiments/data'))
    return p.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    log.info(
        f"Generating {args.n_trajectories} trajectories × "
        f"{args.steps_per_traj} steps, window_size={args.window_size}, "
        f"dt={args.dt}s, seed={args.seed}"
    )

    windows, meta = generate_nominal_windows(
        n_trajectories=args.n_trajectories,
        steps_per_traj=args.steps_per_traj,
        window_size=args.window_size,
        dt=args.dt,
        seed=args.seed,
    )

    out_w    = args.output_dir / 'nominal_windows.npy'
    out_meta = args.output_dir / 'nominal_windows_meta.npy'
    np.save(out_w,    windows)
    np.save(out_meta, meta)

    log.info(f"Saved {windows.shape[0]:,} windows → {out_w}")
    log.info(f"Window array shape: {windows.shape}  (N, W, S)")
    log.info(f"Meta  array shape:  {meta.shape}")


if __name__ == '__main__':
    main()
