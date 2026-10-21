import { createContext } from 'react';
import type { HealthResponse } from '../api/types';

export interface HealthContextValue {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
  refreshHealth: () => Promise<void>;
}

export const HealthContext = createContext<HealthContextValue | undefined>(undefined);
