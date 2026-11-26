import { Machine, Visit } from '@/types';
import { formatDate } from '@/utils/helpers';
import { getDatabase } from '../database';
import { getMachineById } from './machines';
import { VisitReport, getContractReports, getReportForVisit, isReadyToSign } from './reports';

/** The visits of the last download replace the ones before: the website sends every open visit each time. */
export function replaceVisits(visits: Visit[]): void {
  const db = getDatabase();
  db.runSync('DELETE FROM visits');
  visits.forEach((v) =>
    db.runSync(
      `INSERT OR REPLACE INTO visits (id, number, unit_id, client_id, client_name, scheduled_date, type, status,
       overdue, assigned_to_me, contract_id, contract_number, contract_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        v.id, v.number, v.unit_id, v.client_id, v.client_name, v.scheduled_date, v.type, v.status,
        v.overdue, v.assigned_to_me, v.contract_id, v.contract_number, v.contract_title,
      ],
    ),
  );
}

export function getVisit(id: number): Visit | null {
  return getDatabase().getFirstSync<Visit>('SELECT * FROM visits WHERE id = ?', [id]);
}

/** The unit a visit is for, when the phone has it (units arrive in the same download). */
export function machineForVisit(visit: Pick<Visit, 'unit_id'>): Machine | null {
  const row = getDatabase().getFirstSync<{ id: string }>('SELECT id FROM machines WHERE web_id = ?', [visit.unit_id]);
  return row ? getMachineById(row.id) : null;
}

function day(date: string): string {
  return (date ?? '').slice(0, 10);
}

/**
 * Where a visit comes in "My visits": 0 = the office started it for me, 1 = today, 2 = another visit of mine.
 * Visits of other technicians on other days are not shown (null).
 */
function rankOf(v: Visit, today: string): number | null {
  if (v.assigned_to_me && v.status === 'in_progress') return 0;
  if (day(v.scheduled_date) === today) return 1;
  if (v.assigned_to_me) return 2;
  return null;
}

/** A unit of a contract, or of a single visit, with how far its report has come. */
export interface VisitUnit {
  unitId: number;
  unitName: string;
  visit: Visit | null;
  report: VisitReport | null;
  state: 'not_started' | 'draft' | 'ready' | 'signed';
}

function stateOf(report: VisitReport | null): VisitUnit['state'] {
  if (!report) return 'not_started';
  if (report.status === 'locked') return 'signed';
  return isReadyToSign(report) ? 'ready' : 'draft';
}

function unitName(unitId: number): string {
  const row = getDatabase().getFirstSync<{ name: string }>(
    `SELECT COALESCE(NULLIF(name, ''), NULLIF(model, ''), serial_number) AS name FROM machines WHERE web_id = ?`,
    [unitId],
  );
  return row?.name ?? '';
}

/**
 * The units of a contract: the visits the website still sends, and the reports already made for it on the phone.
 * A report stays listed after its visit is closed on the website, so the contract PDF can still include it.
 */
export function getContractUnits(contractId: number): VisitUnit[] {
  const visits = getDatabase().getAllSync<Visit>(
    'SELECT * FROM visits WHERE contract_id = ? ORDER BY scheduled_date, number',
    [contractId],
  );
  const reports = getContractReports(contractId);
  const units = new Map<number, VisitUnit>();
  visits.forEach((visit) => {
    if (units.has(visit.unit_id)) return;
    const report = reports.find((r) => r.visit_id === visit.id) ?? null;
    units.set(visit.unit_id, { unitId: visit.unit_id, unitName: unitName(visit.unit_id), visit, report, state: stateOf(report) });
  });
  // reports whose visit the website no longer sends (done, or moved): newest per unit
  reports.forEach((report) => {
    const unitId = report.unit_web_id ?? -1;
    if (units.has(unitId)) return;
    units.set(unitId, { unitId, unitName: report.unit_name, visit: null, report, state: stateOf(report) });
  });
  return [...units.values()].sort((a, b) => a.unitName.localeCompare(b.unitName));
}

export type VisitCard =
  | {
      kind: 'contract';
      key: string;
      rank: number;
      contractId: number;
      number: string;
      title: string;
      client: string;
      date: string;
      overdue: boolean;
      units: number;
      done: number;
    }
  | { kind: 'single'; key: string; rank: number; visit: Visit; unit: VisitUnit };

// A contract whose visits are all closed stays on the home page this long, for its PDF.
const KEEP_DONE_CONTRACT_MS = 24 * 3600 * 1000;

/** "My visits" on the home page: contracts as one card each, single visits as their own card, most urgent first. */
export function getVisitCards(today = formatDate()): VisitCard[] {
  const db = getDatabase();
  const cards: VisitCard[] = [];
  const contracts = new Map<number, { rank: number; visits: Visit[] }>();

  db.getAllSync<Visit>('SELECT * FROM visits ORDER BY scheduled_date, number').forEach((visit) => {
    const rank = rankOf(visit, today);
    if (rank === null) return;
    if (visit.contract_id == null) {
      const report = getReportForVisit(visit.id);
      cards.push({
        kind: 'single',
        key: `v${visit.id}`,
        rank,
        visit,
        unit: { unitId: visit.unit_id, unitName: unitName(visit.unit_id), visit, report, state: stateOf(report) },
      });
      return;
    }
    const entry = contracts.get(visit.contract_id) ?? { rank, visits: [] };
    entry.rank = Math.min(entry.rank, rank);
    entry.visits.push(visit);
    contracts.set(visit.contract_id, entry);
  });

  // Contracts signed on this phone whose visits the website has already closed: kept a day, or until they are uploaded.
  const since = new Date(Date.now() - KEEP_DONE_CONTRACT_MS).toISOString();
  db.getAllSync<{ contract_id: number }>(
    `SELECT DISTINCT contract_id FROM reports WHERE contract_id IS NOT NULL
     AND (uploaded_at IS NULL OR updated_at > ?)`,
    [since],
  ).forEach(({ contract_id }) => {
    if (!contracts.has(contract_id)) contracts.set(contract_id, { rank: 3, visits: [] });
  });

  contracts.forEach(({ rank, visits }, contractId) => {
    const units = getContractUnits(contractId);
    if (units.length === 0) return;
    const first = visits[0];
    const report = units.find((u) => u.report)?.report ?? null;
    cards.push({
      kind: 'contract',
      key: `c${contractId}`,
      rank,
      contractId,
      number: first?.contract_number || report?.contract_number || '',
      title: first?.contract_title || report?.contract_title || '',
      client: first?.client_name || report?.client || '',
      date: day(first?.scheduled_date ?? report?.date ?? ''),
      overdue: visits.some((v) => !!v.overdue),
      units: units.length,
      done: units.filter((u) => u.state === 'signed').length,
    });
  });

  const dateOf = (c: VisitCard) => (c.kind === 'contract' ? c.date : day(c.visit.scheduled_date));
  return cards.sort((a, b) => a.rank - b.rank || dateOf(a).localeCompare(dateOf(b)));
}
