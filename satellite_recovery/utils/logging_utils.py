"""
CSV logging and Python logging setup.

CSVLogger
---------
Thread-safe append-only CSV logger.  The first call to log() writes the
header row from the dict keys; subsequent calls append data rows.  Designed
for concurrent experiment runs writing to the same file (one row per run).

Usage::

    logger = CSVLogger("experiments/results/run.csv")
    logger.log(record.to_dict())   # from MetricsRecord.to_dict()

setup_logging
-------------
Configures the root Python logger with a human-readable format suitable for
CLI experiment scripts.
"""

from __future__ import annotations

import csv
import logging
import os
import threading
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# CSV logger
# ---------------------------------------------------------------------------

class CSVLogger:
    """
    Append-only CSV logger with automatic header creation.

    Parameters
    ----------
    path : str | Path
        Output CSV file path.  Parent directories are created if needed.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock      = threading.Lock()
        self._has_header = self.path.exists() and self.path.stat().st_size > 0

    def log(self, record: dict[str, Any]) -> None:
        """Append *record* as one CSV row (writes header on first call)."""
        with self._lock:
            write_header = not self._has_header
            with self.path.open('a', newline='') as fh:
                writer = csv.DictWriter(fh, fieldnames=list(record.keys()))
                if write_header:
                    writer.writeheader()
                    self._has_header = True
                writer.writerow(record)

    def log_many(self, records: list[dict[str, Any]]) -> None:
        """Append a list of records in one lock acquisition."""
        if not records:
            return
        with self._lock:
            write_header = not self._has_header
            with self.path.open('a', newline='') as fh:
                writer = csv.DictWriter(fh, fieldnames=list(records[0].keys()))
                if write_header:
                    writer.writeheader()
                    self._has_header = True
                writer.writerows(records)


# ---------------------------------------------------------------------------
# Python logging setup
# ---------------------------------------------------------------------------

def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger with a timestamped console handler."""
    fmt = '%(asctime)s  %(levelname)-8s  %(name)s — %(message)s'
    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt='%H:%M:%S',
    )
