import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  label?: string;
  sublabel?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label = 'Interrogating Telemetry Bus...',
  sublabel = 'Querying research backend on http://127.0.0.1:8000',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border border-sky-500/20 animate-ping absolute" />
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin relative" />
      </div>
      <p className="mt-4 text-sm font-mono font-medium text-slate-200">{label}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-400 font-mono">{sublabel}</p>}
    </div>
  );
};
