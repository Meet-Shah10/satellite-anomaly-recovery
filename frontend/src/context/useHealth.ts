import { useContext } from 'react';
import { HealthContext } from './HealthContextDef';
import type { HealthContextValue } from './HealthContextDef';

export const useHealth = (): HealthContextValue => {
  const context = useContext(HealthContext);
  if (!context) {
    throw new Error('useHealth must be used within a HealthProvider');
  }
  return context;
};
