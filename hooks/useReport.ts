import { useCallback, useEffect, useState } from 'react';
import { getFullReport } from '@/db/repositories/reports';
import { FullReport } from '@/types';

export function useReport(reportId: string) {
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!reportId) return;
    setLoading(true);
    try {
      const data = getFullReport(reportId);
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { report, loading, refresh };
}
