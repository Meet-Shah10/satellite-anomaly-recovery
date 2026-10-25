"""
CLI experiment harness for the satellite anomaly-recovery project.

Runs one or more (scenario × algorithm × seed) combinations and appends
each result as a row to a CSV file.

Usage — single run::

    python experiments/run_experiment.py \\
        --scenario single_thermal \\
        --algorithm astar \\
        --variant H2 \\
        --lambda 50 \\
        --seed 0 \\
        --scorer experiments/scorers/isolation_forest.joblib \\
        --output experiments/results/results.csv

Usage — full sweep (all scenarios × all algorithms × 10 seeds)::

    python experiments/run_experiment.py --sweep --seeds 10

Usage — ablation on λ::

    python experiments/run_experiment.py \\
        --scenario single_thermal --algorithm astar \\
        --variant H2 --sweep-lambda --seeds 5

All arguments can also be provided via a YAML config file::

    python experiments/run_experiment.py --config experiments/configs/default.yaml
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from satellite_recovery.simulator.orbit import OrbitSchedule
from satellite_recovery.simulator.spacecraft import SpacecraftParams
from satellite_recovery.search.astar import DynamicAStar
from satellite_recovery.search.idastar import IDAstar
from satellite_recovery.search.rbfs import RBFS
from satellite_recovery.search.local_search import HillClimbing, SimulatedAnnealing
from satellite_recovery.anomaly.scorer import BaseScorer, IsolationForestScorer
from satellite_recovery.evaluation.metrics import compute_metrics, MetricsRecord
from satellite_recovery.evaluation.scenarios import SCENARIOS
from satellite_recovery.utils.logging_utils import CSVLogger, setup_logging

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Algorithm factory
# ---------------------------------------------------------------------------

ALGORITHM_MAP = {
    'astar':               DynamicAStar,
    'idastar':             IDAstar,
    'rbfs':                RBFS,
    'hill_climbing':       HillClimbing,
    'simulated_annealing': SimulatedAnnealing,
}

# Algorithms included in the default --sweep.
# IDA* and RBFS are memory-bounded and require 100k+ nodes at depth 6
# (branching factor 9). They are excluded from the default sweep for
# tractability; use --include-memory-bounded to add them.
DEFAULT_SWEEP_ALGORITHMS = ['astar', 'hill_climbing', 'simulated_annealing']
MEMORY_BOUNDED_ALGORITHMS = ['idastar', 'rbfs']

# Deterministic algorithms: seed parameter has no effect on results.
# Running multiple seeds produces identical rows — wasteful.
# Only stochastic algorithms benefit from multiple seeds.
DETERMINISTIC_ALGORITHMS = {'astar', 'idastar', 'rbfs'}
STOCHASTIC_ALGORITHMS    = {'hill_climbing', 'simulated_annealing'}

HEURISTIC_VARIANTS = ('H0', 'H1', 'H2', 'H3', 'H4')

LAMBDA_SWEEP = (0.0, 10.0, 25.0, 50.0, 100.0, 200.0)


# Per-algorithm budget multipliers: IDA* and RBFS re-expand nodes exponentially
# at depth 6+ with branching factor 9; they need far more budget than A*.
# These multipliers are applied on top of --budget-nodes in the sweep.
ALGO_BUDGET_MULT: dict[str, float] = {
    'astar':               1.0,
    'idastar':            10.0,   # 200k nodes when base=20k
    'rbfs':               10.0,   # same
    'hill_climbing':       1.0,
    'simulated_annealing': 1.0,
}


def build_algorithm(
    name:         str,
    variant:      str,
    lambda_risk:  float,
    budget_nodes: int,
    max_depth:    int,
    w:            float,
):
    cls = ALGORITHM_MAP[name]
    effective_budget = int(budget_nodes * ALGO_BUDGET_MULT.get(name, 1.0))
    if name in ('astar', 'idastar', 'rbfs'):
        kwargs: dict = dict(
            budget_nodes=effective_budget,
            max_depth=max_depth,
            lambda_risk=lambda_risk,
            variant=variant,
            w=w,
        )
    else:
        # Local search: uses budget_evals and lambda_risk; no variant/w
        kwargs = dict(
            budget_evals=effective_budget,
            max_depth=max_depth,
            lambda_risk=lambda_risk,
        )
    return cls(**kwargs)


# ---------------------------------------------------------------------------
# Single run
# ---------------------------------------------------------------------------

def run_single(
    scenario_name: str,
    algo_name:     str,
    variant:       str,
    lambda_risk:   float,
    seed:          int,
    scorer:        Optional[BaseScorer],
    budget_nodes:  int,
    max_depth:     int,
    w:             float,
    params:        Optional[SpacecraftParams] = None,
) -> MetricsRecord:
    """Run one (scenario, algorithm, seed) combination and return metrics."""

    if scenario_name not in SCENARIOS:
        raise ValueError(
            f"Unknown scenario {scenario_name!r}. "
            f"Available: {list(SCENARIOS.keys())}"
        )
    scenario = SCENARIOS[scenario_name]
    problem  = scenario.build_problem(params=params)

    algo = build_algorithm(
        name=algo_name,
        variant=variant,
        lambda_risk=lambda_risk,
        budget_nodes=budget_nodes,
        max_depth=max_depth,
        w=w,
    )

    seed_label = seed if algo_name in STOCHASTIC_ALGORITHMS else 0
    log.info(
        f"[{scenario_name}] {algo_name}/{variant} "
        f"λ={lambda_risk} seed={seed_label} ..."
    )
    result = algo.search(problem, scorer, seed=seed_label)

    metrics = compute_metrics(result, problem, scenario=scenario_name, seed=seed_label)
    cost_str = f'{metrics.solution_cost:.1f}' if metrics.success else 'NaN'
    log.info(
        f"  → success={bool(metrics.success)} "
        f"cost={cost_str} "
        f"nodes={metrics.nodes_expanded} "
        f"wall={metrics.wall_time_s:.2f}s"
    )
    return metrics


# ---------------------------------------------------------------------------
# Sweep helpers
# ---------------------------------------------------------------------------

def run_sweep(args, scorer: Optional[BaseScorer], csv_logger: CSVLogger, params) -> None:
    """Run all combinations specified by sweep flags."""
    scenarios  = list(SCENARIOS.keys()) if args.sweep else [args.scenario]
    # Default sweep excludes memory-bounded (IDA*/RBFS) for tractability
    if args.sweep:
        algorithms = list(DEFAULT_SWEEP_ALGORITHMS)
        if getattr(args, 'include_memory_bounded', False):
            algorithms += MEMORY_BOUNDED_ALGORITHMS
    else:
        algorithms = [args.algorithm]
    variants   = list(HEURISTIC_VARIANTS) if args.sweep else [args.variant]
    lambdas    = list(LAMBDA_SWEEP) if args.sweep_lambda else [args.lambda_risk]
    seeds      = list(range(args.seeds))

    # Deterministic algorithms produce identical results for every seed.
    # Only run them once (seed=0) to avoid duplicate rows.
    det_seeds = [0]

    combos = []
    for scenario in scenarios:
        for algo in algorithms:
            for variant in variants:
                # Skip variant loop for local search — variant is irrelevant
                if algo in STOCHASTIC_ALGORITHMS and variant != 'H2':
                    continue
                for lam in lambdas:
                    seed_list = seeds if algo in STOCHASTIC_ALGORITHMS else det_seeds
                    for seed in seed_list:
                        combos.append((scenario, algo, variant, lam, seed))

    total = len(combos)
    log.info(f"Sweep: {total} runs ({args.seeds} seeds for stochastic, 1 for deterministic)")
    done = 0

    for scenario, algo, variant, lam, seed in combos:
        try:
            rec = run_single(
                scenario_name=scenario,
                algo_name=algo,
                variant=variant,
                lambda_risk=lam,
                seed=seed,
                scorer=scorer,
                budget_nodes=args.budget_nodes,
                max_depth=args.max_depth,
                w=args.w,
                params=params,
            )
            csv_logger.log(rec.to_dict())
        except Exception as e:
            log.error(f"FAILED {scenario}/{algo}/{variant}/λ={lam}/s={seed}: {e}")
        done += 1
        if done % 20 == 0:
            log.info(f"Progress: {done}/{total}")

    log.info(f"Sweep complete: {done} runs written.")


# ---------------------------------------------------------------------------
# Scorer loading
# ---------------------------------------------------------------------------

def load_scorer(path: Optional[str]) -> Optional[BaseScorer]:
    if not path:
        log.warning("No scorer specified — risk scores will be zero (H1/H0 mode).")
        return None
    p = Path(path)
    if not p.exists():
        log.error(f"Scorer file not found: {p}")
        log.error("Run  python experiments/train_scorer.py  first.")
        sys.exit(1)
    log.info(f"Loading scorer from {p}")
    return BaseScorer.load(str(p))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    p.add_argument('--config',      type=Path,  default=None,
                   help='YAML config file; CLI flags override file values.')

    # Experiment identity
    p.add_argument('--scenario',    type=str,   default='single_thermal',
                   choices=list(SCENARIOS.keys()))
    p.add_argument('--algorithm',   type=str,   default='astar',
                   choices=list(ALGORITHM_MAP.keys()))
    p.add_argument('--variant',     type=str,   default='H2',
                   choices=list(HEURISTIC_VARIANTS))
    p.add_argument('--lambda-risk', type=float, default=50.0, dest='lambda_risk')
    p.add_argument('--seed',        type=int,   default=0)
    p.add_argument('--seeds',       type=int,   default=1,
                   help='Number of seeds for sweep mode.')

    # Search parameters
    p.add_argument('--budget-nodes', type=int,   default=5_000)
    p.add_argument('--max-depth',    type=int,   default=20)
    p.add_argument('--w',            type=float, default=1.5,
                   help='Weighted A* suboptimality factor (H4).')

    # Scorer
    p.add_argument('--scorer',      type=str,   default=None,
                   help='Path to a trained .joblib scorer file.')

    # Output
    p.add_argument('--output',      type=Path,
                   default=Path('experiments/results/results.csv'))
    p.add_argument('--overwrite',   action='store_true',
                   help='Delete existing output CSV before writing (avoids duplicate rows).')

    # Sweep modes
    p.add_argument('--sweep',       action='store_true',
                   help='Run ALL scenarios × A* variants × local search × seeds.')
    p.add_argument('--include-memory-bounded', action='store_true', dest='include_memory_bounded',
                   help='Also include IDA* and RBFS in the sweep (slow — adds hours).')
    p.add_argument('--sweep-lambda', action='store_true',
                   help='Also sweep over the λ grid.')

    # Verbosity
    p.add_argument('--debug',       action='store_true')

    return p.parse_args()


def apply_yaml_config(args: argparse.Namespace) -> argparse.Namespace:
    """Merge YAML config into args (CLI flags take priority)."""
    if args.config is None:
        return args
    with open(args.config) as fh:
        cfg = yaml.safe_load(fh) or {}
    for key, val in cfg.items():
        cli_key = key.replace('-', '_')
        # Only override if the user did not set it explicitly on the CLI
        if not any(f'--{key}' in sys.argv or f'--{cli_key}' in sys.argv
                   for _ in [None]):
            if hasattr(args, cli_key):
                setattr(args, cli_key, val)
    return args


def main() -> None:
    args = parse_args()
    apply_yaml_config(args)
    setup_logging(logging.DEBUG if args.debug else logging.INFO)

    scorer = load_scorer(args.scorer)

    # Issue 1 fix: --overwrite clears the CSV so old runs don't contaminate
    if args.overwrite and args.output.exists():
        args.output.unlink()
        log.info(f"Cleared existing results file: {args.output}")

    csv_logger = CSVLogger(args.output)
    params = SpacecraftParams()

    if args.sweep or args.sweep_lambda:
        run_sweep(args, scorer, csv_logger, params)
    else:
        rec = run_single(
            scenario_name=args.scenario,
            algo_name=args.algorithm,
            variant=args.variant,
            lambda_risk=args.lambda_risk,
            seed=args.seed,
            scorer=scorer,
            budget_nodes=args.budget_nodes,
            max_depth=args.max_depth,
            w=args.w,
            params=params,
        )
        csv_logger.log(rec.to_dict())
        log.info(f"Result appended → {args.output}")


if __name__ == '__main__':
    main()
