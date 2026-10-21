import React from 'react';
import { History } from 'lucide-react';
import { UnderConstructionView } from '../components/common/UnderConstructionView';

export const ExperimentHistory: React.FC = () => {
  return (
    <UnderConstructionView
      title="Experiment History"
      subtitle="Complete database exploration of the 161 published research runs from experiments/results/results.csv with filtering, pagination, and statistical summaries."
      icon={<History className="w-5 h-5" />}
      plannedFeatures={[
        {
          title: 'Full Historical Grid (161 Records)',
          description:
            'Interactive paginated table with sorting, column filtering (algorithm, scenario, heuristic, weight w), and detail views for each published run.',
          endpoints: ['GET /api/experiments/history'],
        },
        {
          title: 'Parametric Distribution Analytics',
          description:
            'Distribution of runtimes, node expansion distributions, and success frequencies across the fault scenarios.',
          endpoints: ['GET /api/experiments/history'],
        },
        {
          title: 'Data Export Utilities',
          description:
            'Export filtered subsets to CSV or JSON formats for independent statistical verification in external Python or R environments.',
          endpoints: ['GET /api/experiments/history'],
        },
      ]}
      scientificScope={[
        'Total published records: 161 experimental runs in results.csv',
        'Algorithms: A*, Dynamic A*, Weighted A*, Greedy Best-First, Hill Climbing, Simulated Annealing',
        'Scenarios: single_thermal, battery_discharge, tumbling_adcs, combined_cascade',
        'Deterministic retrieval preserving exact published numbers',
      ]}
    />
  );
};
