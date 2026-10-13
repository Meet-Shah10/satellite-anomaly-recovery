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
    'astar':              DynamicAStar,
    'idastar':            IDAstar,
    'rbfs':               RBFS,
    'hill_climbing':      HillClimbing,
    'simulated_annealing': SimulatedAnnealing,
}

HEURISTIC_VARIANTS = ('H0', 'H1', 'H2', 'H3', 'H4')

LAMBDA_SWEEP = (0.0, 10.0, 25.0, 50.0, 100.0, 200.0)


def build_algorithm(
    name:         str,
    variant:      str,
    lambda_risk:  float,
    budget_nodes: int,
    max_depth:    int,
    w:            float,
):
    cls = ALGORITHM_MAP[name]
    kwargs: dict = dict(
        budget_nodes=budget_nodes,
        max_depth=max_depth,
        lambda_risk=lambda_risk,
    )
    if name in ('astar', 'idastar', 'rbfs'):
        kwargs['variant'] = variant
        kwargs['w']       = w
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

    log.info(
        f"[{scenario_name}] {algo_name}/{variant} "
        f"λ={lambda_risk} seed={seed} ..."
    )
    result = algo.search(problem, scorer, seed=seed)

    metrics = compute_metrics(result, problem, scenario=scenario_name, seed=seed)
    log.info(
        f"  → success={bool(metrics.success)} "
        f"cost={metrics.solution_cost:.1f} "
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
    algorithms = list(ALGORITHM_MAP.keys()) if args.sweep else [args.algorithm]
    variants   = list(HEURISTIC_VARIANTS) if args.sweep else [args.variant]
    lambdas    = list(LAMBDA_SWEEP) if args.sweep_lambda else [args.lambda_risk]
    seeds      = list(range(args.seeds))

    total = len(scenarios) * len(algorithms) * len(variants) * len(lambdas) * len(seeds)
    log.info(f"Sweep: {total} combinations")
    done = 0

    for scenario in scenarios:
        for algo in algorithms:
            for variant in variants:
                # Skip non-applicable variant/algo combos
                if algo in ('hill_climbing', 'simulated_annealing') and variant != 'H2':
                    continue
                for lam in lambdas:
                    for seed in seeds:
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

    # Sweep modes
    p.add_argument('--sweep',       action='store_true',
                   help='Run ALL scenarios × algorithms × variants × seeds.')
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
