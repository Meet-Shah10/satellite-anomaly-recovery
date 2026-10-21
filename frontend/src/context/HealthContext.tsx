import React, { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../api/client';
import type { HealthResponse } from '../api/types';
import { HealthContext } from './HealthContextDef';

export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Failed to reach research backend';
      setError(msg);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const data = await api.getHealth();
        if (mounted) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const msg = err instanceof ApiError ? err.detail : 'Failed to reach research backend';
          setError(msg);
          setHealth(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchHealth();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <HealthContext.Provider value={{ health, loading, error, refreshHealth }}>
      {children}
    </HealthContext.Provider>
  );
};
