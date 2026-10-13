"""satellite_recovery.evaluation — metrics and scenario definitions."""
from .metrics import compute_metrics, MetricsRecord
from .scenarios import Scenario, SCENARIOS

__all__ = ["compute_metrics", "MetricsRecord", "Scenario", "SCENARIOS"]
