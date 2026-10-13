"""
Anomaly scorers supplying R(n) ∈ [0, 1] for the risk heuristic.

Three implementations with a common BaseScorer interface:

IsolationForestScorer  (primary, Section 4.1 of specification)
    Trains an Isolation Forest on windowed features extracted from nominal
    trajectories.  Raw scores are calibrated to [0, 1] via an empirical CDF
    (percentile rank against a held-out nominal set).  Deterministic given a
    fixed random_state; no GPU required.

MahalanobisScorer  (cheap ablation)
    Fits a multivariate Gaussian on nominal window features and computes the
    Mahalanobis distance to the mean.  Calibrated to [0, 1] via the same CDF
    mechanism.  Faster to train, interpretable, but less sensitive to
    high-dimensional anomaly manifolds.

Training data
-------------
Both scorers are trained on nominal windows produced by the simulator (not on
ESA telemetry).  This eliminates the distribution-shift risk discussed in
Section 8: the scorer sees the same state distribution that the search
explores (simulator states), so the calibrated scores are meaningful on
search-generated windows.

Calibration (Section 4.1)
--------------------------
    score_raw = scorer.predict(features)       # arbitrary scale
    calibrated = empirical_cdf(score_raw)      # rank among nominal scores

An empirical CDF is fitted on held-out nominal windows.  A calibrated score
of 0.9 means the window is more anomalous than 90 % of nominal windows.

Persistence
-----------
Both scorers are serialisable with joblib.  The experiment scripts save trained
scorers to experiments/scorers/ and load them at experiment time.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Optional

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.covariance import EmpiricalCovariance

from .features import extract_batch_features, N_FEATURES
from ..simulator.spacecraft import SpacecraftState


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class BaseScorer(ABC):
    """Common interface for all anomaly scorers."""

    @abstractmethod
    def fit(
        self,
        nominal_windows: list[list[SpacecraftState]],
        calib_windows:   Optional[list[list[SpacecraftState]]] = None,
    ) -> None:
        """
        Train the scorer on *nominal_windows*.

        Parameters
        ----------
        nominal_windows :
            Windows drawn from nominal (no-fault) simulator trajectories.
        calib_windows :
            Held-out nominal windows for CDF calibration.  If None, a random
            50 % split of *nominal_windows* is used for calibration.
        """

    @abstractmethod
    def score_batch(
        self,
        windows: list[list[SpacecraftState]],
    ) -> np.ndarray:
        """
        Return calibrated risk scores in [0, 1] for each window.

        Higher values → more anomalous.  A score of 0.9 means the window is
        more anomalous than 90 % of nominal windows seen during calibration.

        Parameters
        ----------
        windows : list of window lists (each window is a list of SpacecraftState)

        Returns
        -------
        np.ndarray, shape (len(windows),), float32
        """

    def score_single(self, window: list[SpacecraftState]) -> float:
        """Convenience wrapper for a single window."""
        return float(self.score_batch([window])[0])

    def save(self, path: str) -> None:
        """Serialise to disk with joblib."""
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: str) -> "BaseScorer":
        """Deserialise from disk."""
        return joblib.load(path)


# ---------------------------------------------------------------------------
# Empirical CDF calibrator
# ---------------------------------------------------------------------------

class _EmpiricalCDF:
    """
    Maps raw scorer outputs to [0, 1] via percentile rank.

    Fitted on a set of nominal raw scores.  Score values below the minimum
    of the calibration set are mapped to 0; values above the maximum to 1.
    """

    def __init__(self) -> None:
        self._sorted: Optional[np.ndarray] = None

    def fit(self, raw_scores: np.ndarray) -> None:
        self._sorted = np.sort(raw_scores.ravel())

    def transform(self, raw_scores: np.ndarray) -> np.ndarray:
        if self._sorted is None:
            raise RuntimeError("CDF not fitted yet.")
        # searchsorted gives the number of calibration scores ≤ each query score
        ranks = np.searchsorted(self._sorted, raw_scores, side='right')
        return (ranks / len(self._sorted)).astype(np.float32)


# ---------------------------------------------------------------------------
# Isolation Forest scorer
# ---------------------------------------------------------------------------

class IsolationForestScorer(BaseScorer):
    """
    Isolation Forest on windowed features.

    Parameters
    ----------
    n_estimators : int
        Number of trees in the forest.
    max_samples  : int | 'auto'
        Sub-sampling size for each tree.
    contamination : float
        Assumed fraction of anomalies in the training set (set to 0.01
        for nominally-clean training data; affects the decision_function
        scale but not the calibrated output).
    random_state : int
        Seed for reproducibility.
    """

    NAME = 'isolation_forest'

    def __init__(
        self,
        n_estimators:  int   = 200,
        max_samples:   int | str = 'auto',
        contamination: float = 0.01,
        random_state:  int   = 42,
    ) -> None:
        self.n_estimators  = n_estimators
        self.max_samples   = max_samples
        self.contamination = contamination
        self.random_state  = random_state
        self._if: Optional[IsolationForest] = None
        self._cdf = _EmpiricalCDF()
        self.fitted = False

    # ------------------------------------------------------------------
    def fit(
        self,
        nominal_windows: list[list[SpacecraftState]],
        calib_windows:   Optional[list[list[SpacecraftState]]] = None,
    ) -> None:
        X = extract_batch_features(nominal_windows)       # (N, 32)

        # Train/calibration split
        if calib_windows is not None:
            X_calib = extract_batch_features(calib_windows)
        else:
            rng = np.random.default_rng(self.random_state)
            idx = rng.permutation(len(X))
            split = len(X) // 2
            X_calib = X[idx[:split]]
            X       = X[idx[split:]]

        self._if = IsolationForest(
            n_estimators=self.n_estimators,
            max_samples=self.max_samples,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        self._if.fit(X)

        # Calibrate CDF on held-out nominal scores
        # decision_function: higher → more normal, lower → more anomalous
        # We negate to get a "more anomalous = higher" scale
        raw_calib = -self._if.decision_function(X_calib)
        self._cdf.fit(raw_calib)
        self.fitted = True

    # ------------------------------------------------------------------
    def score_batch(
        self,
        windows: list[list[SpacecraftState]],
    ) -> np.ndarray:
        if not self.fitted or self._if is None:
            return np.zeros(len(windows), dtype=np.float32)
        X   = extract_batch_features(windows)
        raw = -self._if.decision_function(X)          # anomaly direction
        return self._cdf.transform(raw)


# ---------------------------------------------------------------------------
# Mahalanobis distance scorer
# ---------------------------------------------------------------------------

class MahalanobisScorer(BaseScorer):
    """
    Mahalanobis distance from the nominal feature distribution.

    Fits a multivariate Gaussian on nominal window features and returns the
    calibrated percentile rank of the Mahalanobis distance.

    This is the cheap ablation: O(n·d²) to fit, O(d²) per score.
    """

    NAME = 'mahalanobis'

    def __init__(self) -> None:
        self._cov: Optional[EmpiricalCovariance] = None
        self._cdf = _EmpiricalCDF()
        self.fitted = False

    def fit(
        self,
        nominal_windows: list[list[SpacecraftState]],
        calib_windows:   Optional[list[list[SpacecraftState]]] = None,
    ) -> None:
        X = extract_batch_features(nominal_windows)

        if calib_windows is not None:
            X_calib = extract_batch_features(calib_windows)
        else:
            rng = np.random.default_rng(0)
            idx = rng.permutation(len(X))
            split = len(X) // 2
            X_calib = X[idx[:split]]
            X       = X[idx[split:]]

        self._cov = EmpiricalCovariance().fit(X)
        raw_calib = self._cov.mahalanobis(X_calib)     # squared distances
        raw_calib = np.sqrt(np.maximum(raw_calib, 0.0))
        self._cdf.fit(raw_calib)
        self.fitted = True

    def score_batch(
        self,
        windows: list[list[SpacecraftState]],
    ) -> np.ndarray:
        if not self.fitted or self._cov is None:
            return np.zeros(len(windows), dtype=np.float32)
        X   = extract_batch_features(windows)
        raw = np.sqrt(np.maximum(self._cov.mahalanobis(X), 0.0))
        return self._cdf.transform(raw)
