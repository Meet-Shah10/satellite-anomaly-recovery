import React from 'react';
import { BarChart3 } from 'lucide-react';
import { UnderConstructionView } from '../components/common/UnderConstructionView';

export const Benchmarking: React.FC = () => {
  return (
    <UnderConstructionView
      title="Algorithm Benchmarking"
      subtitle="Head-to-head empirical evaluation comparing A*, Dynamic A*, Weighted A*, Greedy Best-First, Hill Climbing, and Simulated Annealing."
      icon={<BarChart3 className="w-5 h-5" />}
      plannedFeatures={[
        {
          title: 'Live Comparative Benchmark Runner',
          description:
            'Trigger parameterized multi-algorithm comparisons across identical initial conditions and scenarios to compare runtimes, success rates, and expanded nodes.',
          endpoints: ['POST /api/benchmark/compare', 'GET /api/scenarios'],
        },
        {
          title: 'Multi-Metric Performance Radar',
          description:
            'Normalized radar comparison across: Planning Speed (1/ms), Path Optimality (1/cost), Risk Aversion (1/risk), and Node Efficiency (expanded states).',
          endpoints: ['POST /api/benchmark/compare'],
        },
        {
          title: 'Suboptimality Bound Verification (Weighted A*)',
          description:
            'Empirical verification that Weighted A* solutions satisfy the theoretical bound: cost(WA*) <= w * cost(A*), with w in [1.0, 3.0].',
          endpoints: ['POST /api/benchmark/compare'],
        },
      ]}
      scientificScope={[
        'Full algorithm suite: a_star, dynamic_a_star, weighted_a_star, greedy_best_first, hill_climbing, simulated_annealing',
        'Parameter validation: local search budget_evals, max_depth, lambda_risk',
        'Strict timeout and failure handling for unreachable goal states',
        'Reproducible random seeding for stochastic algorithms',
      ]}
    />
  );
};
