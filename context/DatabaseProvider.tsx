import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { initDatabase } from '@/db/database';
import { upgradeOpenReports } from '@/db/repositories/reports';

/** Opens the database before any screen draws. If that fails the reason is shown, not a blank screen. */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      initDatabase();
      upgradeOpenReports();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (error) {
    return (
      <Text style={{ margin: 40, marginTop: 120, textAlign: 'center' }}>
        تعذر فتح قاعدة البيانات. أعد تشغيل التطبيق.{'\n\n'}
        {error}
      </Text>
    );
  }
  return ready ? <>{children}</> : null;
}
