import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'API Communication Error',
  message,
  onRetry,
  isRetrying = false,
}) => {
  return (
    <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-4 text-slate-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-rose-300 font-mono">{title}</h4>
          <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">{message}</p>

          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/60 text-xs font-mono text-rose-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Reconnecting...' : 'Retry Connection'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
