import React from 'react';

export type BadgeVariant = 'nominal' | 'warning' | 'critical' | 'neutral' | 'accent';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  pulse = false,
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string; border: string }> = {
    nominal: {
      bg: 'bg-emerald-950/40',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      border: 'border-emerald-800/60',
    },
    warning: {
      bg: 'bg-amber-950/40',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      border: 'border-amber-800/60',
    },
    critical: {
      bg: 'bg-rose-950/40',
      text: 'text-rose-300',
      dot: 'bg-rose-400',
      border: 'border-rose-800/60',
    },
    neutral: {
      bg: 'bg-slate-900/60',
      text: 'text-slate-300',
      dot: 'bg-slate-400',
      border: 'border-slate-800',
    },
    accent: {
      bg: 'bg-sky-950/40',
      text: 'text-sky-300',
      dot: 'bg-sky-400',
      border: 'border-sky-800/60',
    },
  };

  const style = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider font-medium rounded border ${style.bg} ${style.text} ${style.border} ${sizeClasses}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${style.dot} ${pulse ? 'animate-pulse' : ''}`}
      />
      {label}
    </span>
  );
};
