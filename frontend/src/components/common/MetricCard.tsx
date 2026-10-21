import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: React.ReactNode;
  status?: 'nominal' | 'warning' | 'critical' | 'neutral';
  highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  subtext,
  icon,
  status = 'neutral',
  highlight = false,
}) => {
  const statusColorMap = {
    nominal: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-rose-400',
    neutral: 'text-slate-100',
  };

  return (
    <div
      className={`rounded-xl bg-[#0b1120] border transition-all duration-200 p-4 ${
        highlight
          ? 'border-sky-500/50 shadow-[0_0_15px_rgba(56,189,248,0.08)]'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 font-medium mb-2">
        <span>{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-mono font-semibold tracking-tight ${statusColorMap[status]}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400 font-sans">{unit}</span>}
      </div>

      {subtext && <div className="mt-1 text-xs text-slate-400 leading-relaxed">{subtext}</div>}
    </div>
  );
};
