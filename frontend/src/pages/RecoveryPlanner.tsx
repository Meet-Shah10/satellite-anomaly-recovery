import React from 'react';
import { Navigation } from 'lucide-react';
import { UnderConstructionView } from '../components/common/UnderConstructionView';

export const RecoveryPlanner: React.FC = () => {
  return (
    <UnderConstructionView
      title="Recovery Path Planner"
      subtitle="Autonomous state-space search using Risk-Aware Dynamic A*, Weighted A*, and classical heuristics to guide spacecraft safely to NOMINAL mode."
      icon={<Navigation className="w-5 h-5" />}
      plannedFeatures={[
        {
          title: 'Interactive Search Solver Console',
          description:
            'Trigger real solver execution with configurable parameters: algorithm (A*, Dynamic A*, WA*), heuristic variant (H1, H2, H3), risk weight lambda, suboptimality weight w, and depth limits.',
          endpoints: ['POST /api/plan/solve', 'GET /api/scenarios'],
        },
        {
          title: 'Recovery Plan Trajectory Viewer',
          description:
            'Visual step-by-step breakdown of chosen recovery commands, showing cumulative path cost g(n), projected heuristic h(n), risk penalties, and state transitions.',
          endpoints: ['POST /api/plan/solve', 'GET /api/commands'],
        },
        {
          title: 'Search Tree Metrics & Node Expansion',
          description:
            'Real-time metrics on nodes expanded, states generated, search duration (ms), suboptimality bounds, and memory utilization.',
          endpoints: ['POST /api/plan/solve'],
        },
      ]}
      scientificScope={[
        'Heuristic H1: Goal mode distance hd',
        'Heuristic H2: Risk-penalized hd + lambda * R',
        'Heuristic H3: Double-risk formulation (preserved per research)',
        'Discrete state coarsening hash (100 bins for temps, 50 for SOC)',
        '7 discrete recovery commands with latency and energy consumption',
      ]}
    />
  );
};
