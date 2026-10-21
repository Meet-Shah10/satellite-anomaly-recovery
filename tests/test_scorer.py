"""
Unit tests for the trained IsolationForest anomaly scorer and feature extractor.
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest
import numpy as np

from satellite_recovery.simulator.spacecraft import SpacecraftState
from satellite_recovery.anomaly.features import extract_window_features, extract_batch_features, N_FEATURES
from satellite_recovery.anomaly.scorer import BaseScorer, IsolationForestScorer

REPO_ROOT = Path(__file__).resolve().parent.parent
SCORER_PATH = REPO_ROOT / "experiments" / "scorers" / "isolation_forest.joblib"


def test_scorer_asset_exists_and_loads():
    """Verify that the pre-trained Isolation Forest scorer exists and loads properly."""
    assert SCORER_PATH.exists(), f"Pre-trained scorer missing at {SCORER_PATH}"
    scorer = BaseScorer.load(str(SCORER_PATH))
    assert isinstance(scorer, IsolationForestScorer)
    assert scorer.fitted is True
    assert scorer._if is not None


def test_feature_extraction_dimensions():
    """Verify feature extractor produces exactly 32 features (mean, std, slope, last x 8)."""
    assert N_FEATURES == 32

    # Construct a 10-step nominal trajectory window
    window = [
        SpacecraftState(
            time=float(i * 60),
            soc=0.80 - 0.001 * i,
            temp_battery=20.0 + 0.1 * i,
            temp_payload=22.0,
            temp_bus=20.0,
            heater_on=False,
            payload_on=True,
            transmitter_on=True,
            mode='nominal',
        )
        for i in range(10)
    ]

    features = extract_window_features(window)
    assert isinstance(features, np.ndarray)
    assert features.shape == (32,)
    assert features.dtype == np.float32
    assert all(math.isfinite(val) for val in features)

    # Batch extraction
    batch = extract_batch_features([window, window])
    assert batch.shape == (2, 32)


def test_feature_extraction_single_element_window():
    """Verify window of length 1 produces finite features without crashing on std/slope."""
    single_window = [
        SpacecraftState(
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
    ]
    features = extract_window_features(single_window)
    assert features.shape == (32,)
    assert all(math.isfinite(val) for val in features)


def test_scorer_inference_and_bounds():
    """Verify the trained model returns risk scores strictly in [0.0, 1.0]."""
    if not SCORER_PATH.exists():
        pytest.skip("Scorer asset not available")

    scorer = BaseScorer.load(str(SCORER_PATH))

    # Healthy nominal window
    nominal_window = [
        SpacecraftState(
            time=float(i * 60),
            soc=0.75,
            temp_battery=18.0,
            temp_payload=22.0,
            temp_bus=20.0,
            heater_on=False,
            payload_on=True,
            transmitter_on=True,
            mode='nominal',
        )
        for i in range(10)
    ]

    # Extreme anomalous window (overheating payload near hard limit, dying battery)
    anomalous_window = [
        SpacecraftState(
            time=float(i * 60),
            soc=0.18 - 0.01 * i,
            temp_battery=45.0 + 0.2 * i,
            temp_payload=66.0 + 0.3 * i,
            temp_bus=52.0,
            heater_on=True,
            payload_on=True,
            transmitter_on=True,
            mode='nominal',
            fault_heat_payload=35.0,
        )
        for i in range(10)
    ]

    nom_score = scorer.score_single(nominal_window)
    anom_score = scorer.score_single(anomalous_window)

    assert 0.0 <= nom_score <= 1.0
    assert 0.0 <= anom_score <= 1.0
    # Anomalous state should receive significantly higher risk score than nominal state
    assert anom_score > nom_score
