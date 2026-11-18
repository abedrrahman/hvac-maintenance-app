/**
 * Starting work on a website visit: its report is made once, filled with the visit's unit and linked to the visit,
 * so the upload closes that visit on the website. Works with no signal: everything is on the phone already.
 */
import { createReport, getReportForVisit } from '@/db/repositories/reports';
import { machineForVisit } from '@/db/repositories/visits';
import { Visit } from '@/types';
import { loadGlobalUnits } from '@/utils/units';

/** The report's page to open for this visit: the report already started, or a new one. Null when the phone lacks the unit. */
export async function openVisitReport(visit: Visit): Promise<string | null> {
  const existing = getReportForVisit(visit.id);
  if (existing) return existing.status === 'locked' ? `/report/${existing.id}/view` : `/report/${existing.id}/3`;
  const machine = machineForVisit(visit);
  if (!machine) return null;
  const report = await createReport(machine.type, { machineId: machine.id, visit, ...(await loadGlobalUnits()) });
  return `/report/${report.id}/1`;
}

export const VISIT_STATE_TEXT = {
  not_started: 'لم يبدأ',
  draft: 'مسودة',
  ready: 'جاهز للتوقيع',
  signed: 'تم التوقيع',
} as const;
