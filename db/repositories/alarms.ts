import { getDatabase } from '../database';

export interface Alarm {
  code: string;
  key: string;
  controller: string;
  name_en: string;
  name_ar: string;
  causes_en: string;
  causes_ar: string;
  checks_en: string;
  checks_ar: string;
  effect_en: string;
  effect_ar: string;
  action_en: string;
  action_ar: string;
  reset_en: string;
  reset_ar: string;
}

const COLUMNS = [
  'code', 'key', 'controller', 'name_en', 'name_ar',
  'causes_en', 'causes_ar', 'checks_en', 'checks_ar', 'effect_en', 'effect_ar',
  'action_en', 'action_ar', 'reset_en', 'reset_ar',
] as const;

/** Letters and digits only, like the website: "D4.1", "d4 1" and "d41" are the same code. */
export function alarmKey(text: string): string {
  return text.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Replaces the phone's alarm list with the website's. `fields` names the position of each value in a row. */
export function replaceAlarms(fields: string[], rows: unknown[][]): void {
  const db = getDatabase();
  const at = COLUMNS.map((c) => fields.indexOf(c));
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM alarms');
    const insert = db.prepareSync(
      `INSERT INTO alarms (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
    );
    try {
      rows.forEach((row) => {
        insert.executeSync(at.map((i) => (i >= 0 && row[i] != null ? String(row[i]) : '')));
      });
    } finally {
      insert.finalizeSync();
    }
  });
}

export function countAlarms(): number {
  return getDatabase().getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM alarms')?.c ?? 0;
}

/**
 * A typed code finds that alarm (E01 also finds E1); anything else finds alarms holding every word typed,
 * in the code, the name (English or Arabic) or the causes.
 */
export function searchAlarms(text: string, limit = 30): Alarm[] {
  const db = getDatabase();
  const typed = text.trim();
  if (!typed) return [];
  const key = alarmKey(typed);
  if (key) {
    const exact = db.getAllSync<Alarm>(
      'SELECT * FROM alarms WHERE key IN (?, ?) ORDER BY controller LIMIT ?',
      [key, key.replace(/([A-Z])0+(\d)/, '$1$2'), limit],
    );
    if (exact.length > 0) return exact;
  }
  const words = typed.split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
  if (words.length === 0) return [];
  const where = words
    .map(() => '(code LIKE ? OR name_en LIKE ? OR name_ar LIKE ? OR causes_en LIKE ? OR causes_ar LIKE ?)')
    .join(' AND ');
  const params = words.flatMap((w) => Array(5).fill(`%${w}%`) as string[]);
  return db.getAllSync<Alarm>(
    `SELECT * FROM alarms WHERE ${where} ORDER BY LENGTH(name_en) LIMIT ?`,
    [...params, limit],
  );
}
