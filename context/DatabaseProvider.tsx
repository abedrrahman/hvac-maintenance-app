import React, { createContext, useContext, useEffect, useState } from 'react';
import { initDatabase } from '@/db/database';

interface DatabaseContextValue {
  ready: boolean;
  error: string | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  ready: false,
  error: null,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initDatabase();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Database init failed');
    }
  }, []);

  if (error) {
    return null;
  }

  if (!ready) {
    return null;
  }

  return (
    <DatabaseContext.Provider value={{ ready, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
