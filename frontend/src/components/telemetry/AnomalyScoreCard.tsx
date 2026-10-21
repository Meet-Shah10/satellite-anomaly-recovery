import React from 'react';
import { Activity, Cpu, AlertCircle, Info } from 'lucide-react';
import type { TelemetryWindow } from '../../api/types';

interface AnomalyScoreCardProps {
  window: TelemetryWindow;
  totalWindows: number;
}

export const AnomalyScoreCard: React.FC<AnomalyScoreCardProps> = ({ window }) => {
  const score = window.anomaly_score;
  const scoreFormatted = score !== null && score !== undefined ? score.toFixed(4) : 'N/A';
  const percentilePct = score !== null && score !== undefined ? (score * 100).toFixed(1) : null;

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-base">Model Anomaly Assessment</h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400">Inspecting Window:</span>
          <span className="px-2.5 py-1 rounded bg-cyan-950/60 text-cyan-300 font-bold border border-cyan-800/60">
            #{window.window_index}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Main Score Metric */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium block mb-1">
              Calibrated Anomaly Score R(n)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-cyan-300">
                {scoreFormatted}
              </span>
              <span className="text-xs font-mono text-slate-400">∈ [0.0, 1.0]</span>
            </div>
            {percentilePct && (
              <span className="text-xs text-slate-300 mt-1 block">
                Percentile Rank: <strong className="text-cyan-400 font-mono">{percentilePct}%</strong>
              </span>
            )}
          </div>

          {/* Compact Score Meter */}
          <div className="space-y-1">
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-400 to-rose-500 transition-all duration-300"
                style={{ width: score !== null && score !== undefined ? `${score * 100}%` : '0%' }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.0 (High Typicality)</span>
              <span>1.0 (High Outlier Density)</span>
            </div>
          </div>
        </div>

        {/* Scientific Interpretation & Percentile Rank */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>Empirical CDF Percentile Interpretation</span>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            {score !== null && score !== undefined ? (
              <>
                A calibrated score of <strong className="text-cyan-300 font-mono">{scoreFormatted}</strong> means this 10-step trajectory window has an Isolation Forest outlier rating higher than approximately{' '}
                <strong className="text-slate-100 font-mono">{percentilePct}%</strong> of the held-out nominal baseline windows seen during training calibration.
              </>
            ) : (
              'Anomaly score calculation was not available for this window.'
            )}
          </p>
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            Used as the continuous risk penalty term <code className="text-cyan-300 font-mono">λ·R(n)</code> in the Risk-Aware Dynamic A* recovery objective.
          </div>
        </div>

        {/* Model Architecture Metadata */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-4 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>Research Model Specifications</span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300 pt-1">
            <div className="flex justify-between border-b border-slate-800/60 pb-1">
              <span className="text-slate-400">Model:</span>
              <span className="text-slate-200">Isolation Forest (scikit-learn)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1 font-mono">
              <span className="text-slate-400 font-sans">Trees (n_estimators):</span>
              <span className="text-slate-200">200 estimators</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1 font-mono">
              <span className="text-slate-400 font-sans">Contamination:</span>
              <span className="text-slate-200">0.01 (1% nominal outlier bias)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Extracted Features:</span>
              <span className="text-cyan-300 font-mono">32 features (8 channels × 4 stats)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scientific Limitation & Non-Diagnosis Disclaimer */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-200">Statistical Outlier Notice:</strong> The anomaly score is an unsupervised metric reflecting mathematical distance from nominal operational distribution. It does not identify physical component root causes, distinguish between fault modes, or provide proof of satellite hardware failure.
        </p>
      </div>
    </div>
  );
};
