"""
Train anomaly scorers from nominal window data and save to disk.

Requires generate_nominal_data.py to have been run first.

Usage::

    python experiments/train_scorer.py [OPTIONS]

Options::

    --data-dir      PATH   Directory containing nominal_windows.npy (default experiments/data)
    --scorer        STR    'isolation_forest' | 'mahalanobis' (default isolation_forest)
    --window-size   INT    Window size used during data generation (default 10)
    --calib-frac    FLOAT  Fraction of data held out for CDF calibration (default 0.3)
    --n-estimators  INT    IsolationForest trees (default 200)
    --random-state  INT    Seed for IsolationForest (default 42)
    --output-dir    PATH   Where to save scorer .joblib file (default experiments/scorers)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from satellite_recovery.simulator.spacecraft import SpacecraftState
from satellite_recovery.anomaly.scorer import IsolationForestScorer, MahalanobisScorer
from satellite_recovery.utils.logging_utils import setup_logging

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Window reconstruction
# ---------------------------------------------------------------------------

def load_windows_as_states(
    npy_path: Path,
    window_size: int,
) -> list[list[SpacecraftState]]:
    """
    Load raw window array and reconstruct lists of SpacecraftState objects.

    The raw array has shape (N, window_size, n_state_features).
    We reconstruct SpacecraftState from the feature vector by a fixed mapping
    (inverse of SpacecraftState.as_vector()).
    """
    arr = np.load(npy_path)    # (N, W, S)
    N, W, S = arr.shape
    log.info(f"Loaded window array: {arr.shape}")

    windows: list[list[SpacecraftState]] = []
    for i in range(N):
        win: list[SpacecraftState] = []
        for j in range(W):
            v        = arr[i, j]
            mode_map = {0.0: 'nominal', 1.0: 'low_power', 2.0: 'safe_mode'}
            mode     = mode_map.get(round(float(v[7])), 'nominal')
            s = SpacecraftState(
                time           = float(j * 60.0),   # approximate; not used by scorer
                soc            = float(v[0]),
                temp_battery   = float(v[1]),
                temp_payload   = float(v[2]),
                temp_bus       = float(v[3]),
                heater_on      = bool(round(float(v[4]))),
                payload_on     = bool(round(float(v[5]))),
                transmitter_on = bool(round(float(v[6]))),
                mode           = mode,
            )
            win.append(s)
        windows.append(win)
    return windows


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data-dir',      type=Path,  default=Path('experiments/data'))
    p.add_argument('--scorer',        type=str,   default='isolation_forest',
                   choices=['isolation_forest', 'mahalanobis'])
    p.add_argument('--window-size',   type=int,   default=10)
    p.add_argument('--calib-frac',    type=float, default=0.30)
    p.add_argument('--n-estimators',  type=int,   default=200)
    p.add_argument('--random-state',  type=int,   default=42)
    p.add_argument('--output-dir',    type=Path,  default=Path('experiments/scorers'))
    return p.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    npy_path = args.data_dir / 'nominal_windows.npy'
    if not npy_path.exists():
        log.error(f"Data file not found: {npy_path}")
        log.error("Run  python experiments/generate_nominal_data.py  first.")
        sys.exit(1)

    log.info(f"Loading nominal windows from {npy_path}")
    all_windows = load_windows_as_states(npy_path, args.window_size)

    # Train/calibration split
    rng   = np.random.default_rng(args.random_state)
    idx   = rng.permutation(len(all_windows))
    split = int(len(all_windows) * (1.0 - args.calib_frac))
    train_windows = [all_windows[i] for i in idx[:split]]
    calib_windows = [all_windows[i] for i in idx[split:]]
    log.info(f"Train: {len(train_windows):,}  Calib: {len(calib_windows):,}")

    # Build and fit scorer
    if args.scorer == 'isolation_forest':
        scorer = IsolationForestScorer(
            n_estimators=args.n_estimators,
            random_state=args.random_state,
        )
    else:
        from satellite_recovery.anomaly.scorer import MahalanobisScorer
        scorer = MahalanobisScorer()

    log.info(f"Fitting {args.scorer} scorer …")
    scorer.fit(train_windows, calib_windows)
    log.info("Done fitting.")

    # Sanity check on calibration set
    calib_scores = scorer.score_batch(calib_windows[:500])
    log.info(
        f"Calibration scores (nominal, should be near 0): "
        f"mean={calib_scores.mean():.3f}  "
        f"p95={float(np.percentile(calib_scores, 95)):.3f}"
    )

    # Save
    out_path = args.output_dir / f'{args.scorer}.joblib'
    scorer.save(str(out_path))
    log.info(f"Scorer saved → {out_path}")


if __name__ == '__main__':
    main()
