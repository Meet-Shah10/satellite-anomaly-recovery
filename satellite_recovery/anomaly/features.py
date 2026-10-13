"""
Window feature extraction for the anomaly scorer.

The Isolation Forest (and Mahalanobis) scorers operate on fixed-size feature
vectors, not raw state sequences.  For each channel in the state vector we
extract four summary statistics over the window:

    mean  — central tendency
    std   — variability
    slope — linear trend (least-squares slope, or finite difference for
             windows of length 1 or 2)
    last  — most recent value (gives the scorer access to the current state
             without redundancy from the window statistics)

For a window of length W and S state features the output is a vector of
length 4·S.  All channels are extracted identically so the scorer sees a
homogeneous feature space.

The function is vectorised over batches: score_batch() passes a list of
windows, and this module converts them to a 2-D NumPy array in one call.
"""

from __future__ import annotations

import numpy as np

from ..simulator.spacecraft import SpacecraftState


# Feature suffix names per channel
_SUFFIXES = ('mean', 'std', 'slope', 'last')

# Full feature name list (populated once at module load)
FEATURE_NAMES: list[str] = [
    f"{ch}_{sfx}"
    for ch in SpacecraftState.FEATURE_NAMES
    for sfx in _SUFFIXES
]

N_FEATURES: int = len(FEATURE_NAMES)     # 8 channels × 4 stats = 32


# ---------------------------------------------------------------------------
# Core extraction
# ---------------------------------------------------------------------------

def extract_window_features(
    window: list[SpacecraftState],
) -> np.ndarray:
    """
    Extract a 1-D feature vector from one window of states.

    Parameters
    ----------
    window : list[SpacecraftState]
        Ordered from oldest to most recent.  Length ≥ 1.

    Returns
    -------
    np.ndarray, shape (N_FEATURES,), dtype float32
    """
    if not window:
        return np.zeros(N_FEATURES, dtype=np.float32)

    # Stack state vectors: shape (W, S)
    mat = np.stack([s.as_vector() for s in window], axis=0)   # (W, S)
    W, S = mat.shape

    features = np.empty(S * 4, dtype=np.float32)
    idx = 0
    for c in range(S):
        col = mat[:, c]
        features[idx]     = float(col.mean())
        features[idx + 1] = float(col.std())  if W > 1 else 0.0
        features[idx + 2] = _slope(col)
        features[idx + 3] = float(col[-1])
        idx += 4
    return features


def extract_batch_features(
    windows: list[list[SpacecraftState]],
) -> np.ndarray:
    """
    Extract features for a batch of windows.

    Parameters
    ----------
    windows : list of window lists

    Returns
    -------
    np.ndarray, shape (len(windows), N_FEATURES), dtype float32
    """
    if not windows:
        return np.empty((0, N_FEATURES), dtype=np.float32)
    rows = [extract_window_features(w) for w in windows]
    return np.stack(rows, axis=0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slope(col: np.ndarray) -> float:
    """Least-squares slope of *col* vs time index; 0 for length-1 sequences."""
    W = len(col)
    if W < 2:
        return 0.0
    x = np.arange(W, dtype=np.float32)
    x_mean = x.mean()
    y_mean = col.mean()
    denom  = ((x - x_mean) ** 2).sum()
    if denom < 1e-9:
        return 0.0
    return float(((x - x_mean) * (col - y_mean)).sum() / denom)
