import React from 'react';
import { Shield, ShieldAlert, ShieldCheck, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { SpacecraftState, SpacecraftLimits } from '../../api/types';

interface SafetyFeedbackProps {
  state: SpacecraftState;
  limits: SpacecraftLimits;
  commandError: string | null;
}

export const SafetyFeedback: React.FC<SafetyFeedbackProps> = ({
  state,
  limits,
  commandError,
}) => {
  const margin = state.safety_margin;
  const inNominal = state.in_nominal_band ?? false;
  const isHardViolation = state.violates_hard_constraints ?? false;
  const violations = state.parameter_violations || {};
  const violationKeys = Object.keys(violations);

  const formatViolationName = (key: string): string => {
    switch (key) {
      case 'temp_battery':
        return 'Battery Temperature';
      case 'temp_payload':
        return 'Payload Temperature';
      case 'temp_bus':
        return 'Bus Temperature';
      case 'soc':
        return 'Battery State of Charge';
      default:
        return key;
    }
  };

  const formatViolationMagnitude = (key: string, val: number): string => {
    if (key === 'soc') {
      const pct = (val * 100).toFixed(1);
      return val < 0 ? `${pct}% below nominal floor (35%)` : `+${pct}% above nominal`;
    }
    const deg = val.toFixed(2);
    return val > 0 ? `+${deg} °C above nominal max` : `${deg} °C below nominal min`;
  };

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-base">Safety Margins & Constraint Validation</h3>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Source: <span className="text-cyan-300">SpacecraftParams & Anomaly Evaluator</span>
        </div>
      </div>

      {/* Primary Status Banner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Safety Margin Indicator */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
            Normalized Safety Margin
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-mono font-bold ${
                margin === null || margin === undefined
                  ? 'text-slate-500'
                  : margin > 0.15
                  ? 'text-emerald-400'
                  : margin > 0.0
                  ? 'text-amber-400'
                  : 'text-rose-500'
              }`}
            >
              {margin !== null && margin !== undefined
                ? `${margin >= 0 ? '+' : ''}${margin.toFixed(4)}`
                : 'N/A'}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {margin !== null && margin !== undefined
                ? margin > 0
                  ? '(Feasible)'
                  : '(Breached)'
                : ''}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight pt-1">
            Normalized minimum distance to any hard limit. Positive values denote safe clearance; ≤ 0 indicates hard boundary breach.
          </p>
        </div>

        {/* Nominal Band State */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
            Nominal Operating Band
          </span>
          <div className="flex items-center gap-2 pt-0.5">
            {inNominal ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle className="w-3.5 h-3.5" />
                INSIDE NOMINAL BAND
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <AlertTriangle className="w-3.5 h-3.5" />
                OUT OF NOMINAL BAND
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 leading-tight pt-1.5">
            Nominal bands: SoC ≥ {(limits.soc_nominal_min * 100).toFixed(0)}%, T_bat ∈ [{limits.temp_bat_nominal_min}, {limits.temp_bat_nominal_max}]°C, T_pay ∈ [{limits.temp_pay_nominal_min}, {limits.temp_pay_nominal_max}]°C, T_bus ∈ [{limits.temp_bus_nominal_min}, {limits.temp_bus_nominal_max}]°C.
          </p>
        </div>

        {/* Hard Constraints Infeasibility */}
        <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
            Hard Safety Limits
          </span>
          <div className="flex items-center gap-2 pt-0.5">
            {!isHardViolation ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                HARD LIMITS RESPECTED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <ShieldAlert className="w-3.5 h-3.5" />
                HARD LIMIT BREACHED (INFEASIBLE)
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 leading-tight pt-1.5">
            Hard limits: SoC ∈ [{limits.soc_hard_min}, {limits.soc_hard_max}], T_bat ∈ [{limits.temp_bat_hard_min}, {limits.temp_bat_hard_max}]°C, T_pay ∈ [{limits.temp_pay_hard_min}, {limits.temp_pay_hard_max}]°C, T_bus ∈ [{limits.temp_bus_hard_min}, {limits.temp_bus_hard_max}]°C.
          </p>
        </div>
      </div>

      {commandError && (
        <div className="bg-rose-950/30 border border-rose-500/50 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Last Rejected Command Error: {commandError}</span>
        </div>
      )}

      {/* Parameter-Specific Violations Breakdown */}
      {violationKeys.length > 0 ? (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-mono font-bold text-amber-200">
              Active Parameter Violations ({violationKeys.length}):
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            {violationKeys.map((key) => {
              const val = violations[key];
              return (
                <div
                  key={key}
                  className="bg-slate-950/70 border border-amber-500/30 rounded p-2 flex items-center justify-between"
                >
                  <span className="text-slate-300">{formatViolationName(key)}:</span>
                  <span className="text-amber-400 font-bold">
                    {formatViolationMagnitude(key, val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All telemetry parameters are strictly within their nominal operating bands.</span>
        </div>
      )}

      {/* Disclaimers & Fidelity Notices */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 text-cyan-300 font-mono font-semibold">
          <Info className="w-3.5 h-3.5" />
          <span>Scientific Disclaimer</span>
        </div>
        <p className="leading-relaxed">
          SIMULATION — NOT LIVE SPACECRAFT TELEMETRY. This digital twin executes the mathematical three-node lumped-parameter thermal and electrical transition model defined in the research specification. Simulated state transitions do not constitute proof of real-world spacecraft flight readiness or mission safety.
        </p>
      </div>
    </div>
  );
};
