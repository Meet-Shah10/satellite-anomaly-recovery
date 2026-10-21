import React from 'react';
import { FileText } from 'lucide-react';
import { UnderConstructionView } from '../components/common/UnderConstructionView';

export const ResearchReports: React.FC = () => {
  return (
    <UnderConstructionView
      title="Research Reports & Figures"
      subtitle="Comprehensive academic documentation, paper figures (Figures 1-6), research methodology notes, and mathematical verification records."
      icon={<FileText className="w-5 h-5" />}
      plannedFeatures={[
        {
          title: 'Research Paper Figure Gallery',
          description:
            'Interactive inspection of key publication figures: Success Rate Comparison, Expansion vs Runtime, Suboptimality Distribution, and LEO Solar Cycle Recovery.',
          endpoints: ['GET /api/experiments/history', 'GET /api/health'],
        },
        {
          title: 'Methodology & Theoretical Formulations',
          description:
            'Detailed derivation of Risk-Aware Dynamic A*, admissible heuristic conditions, proof of suboptimality bound for Weighted A*, and Isolation Forest math.',
          endpoints: ['GET /api/health'],
        },
        {
          title: 'Implementation Integrity & Caveats Document',
          description:
            'Documentation of known research characteristics, including the preserved H3 double-risk formula, discrete hash coarsening bounds, and LEO sunrise ingress timing.',
          endpoints: ['GET /api/health'],
        },
      ]}
      scientificScope={[
        'Full documentation of H1, H2, and H3 heuristic formulas',
        'State coarsening hash bin analysis (100 bins for temperature, 50 bins for SOC)',
        'Reference paper: Risk-Aware Dynamic A* for Satellite Anomaly Recovery',
        'Academic citation and reproducibility artifacts',
      ]}
    />
  );
};
