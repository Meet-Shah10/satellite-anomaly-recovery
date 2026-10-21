import React from 'react';
import { CheckCircle2, XCircle, Brain, Database, FileSpreadsheet } from 'lucide-react';

interface AssetIndicatorProps {
  assets: {
    scorer_model: boolean;
    nominal_dataset: boolean;
    experiment_results: boolean;
  };
  scorerLoaded: boolean;
}

export const AssetIndicator: React.FC<AssetIndicatorProps> = ({ assets, scorerLoaded }) => {
  const items = [
    {
      name: 'Isolation Forest Model',
      detail: '200-Tree Scorer + Empirical CDF (.joblib)',
      available: assets.scorer_model && scorerLoaded,
      icon: <Brain className="w-4 h-4" />,
    },
    {
      name: 'Nominal Telemetry Dataset',
      detail: '10,100 Windows × 10 Steps × 8 Channels (.npy)',
      available: assets.nominal_dataset,
      icon: <Database className="w-4 h-4" />,
    },
    {
      name: 'Historical Results Catalog',
      detail: '161 Baseline Runs Evaluated (.csv)',
      available: assets.experiment_results,
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
            item.available
              ? 'bg-[#0d1322] border-emerald-900/40 hover:border-emerald-800/60'
              : 'bg-[#0d1322] border-rose-900/40 hover:border-rose-800/60'
          }`}
        >
          <div
            className={`p-2 rounded mt-0.5 ${
              item.available ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
            }`}
          >
            {item.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-medium text-slate-200 truncate">
                {item.name}
              </span>
              {item.available ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ONLINE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400">
                  <XCircle className="w-3.5 h-3.5" />
                  MISSING
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
