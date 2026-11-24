// The rebuild of an open report's rows (run at every start and when a count changes) must never lose a reading.
// Runs the real database code on Node's own SQLite, on a fresh database built by the app's migrations.
import { beforeAll, describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-sqlite', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('@/assets/data/alarms.json', () => ({
  version: 'built-in',
  fields: ['code', 'key', 'name_en'],
  alarms: [['D4.1', 'D41', 'High pressure'], ['E1', 'E1', 'Water flow']],
}));
jest.mock('@/services/photos', () => ({ deletePicture: () => {} }));
jest.mock('@/db/database', () => {
  // process.getBuiltinModule: jest's own module loader does not know node:sqlite
  const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).run(...params),
    getAllSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).get(...params) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params: unknown[]) => statement.run(...params), finalizeSync: () => {} };
    },
    withTransactionSync: (task: () => void) => {
      if (depth++ === 0) raw.exec('BEGIN');
      try {
        task();
        if (depth === 1) raw.exec('COMMIT');
      } catch (error) {
        if (depth === 1) raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
  };
  return { getDatabase: () => db };
});

import { LEGACY_ROW_KEYS } from '../../constants/checklists';
import { getDatabase } from '../../db/database';
import { runMigrations } from '../../db/migrations';
import {
  addCustomChecklistItem,
  createReport,
  getFullReport,
  updateChecklistItem,
  upgradeOpenReports,
} from '../../db/repositories/reports';

const values = (id: string) =>
  Object.fromEntries(getFullReport(id)!.checklist_items.map((i) => [i.field_key ?? i.label_en, i.value]));

describe('rebuilding an open report', () => {
  beforeAll(() => runMigrations(getDatabase() as never));

  it('keeps every reading typed, hand-added rows and readings of older templates', async () => {
    const report = await createReport('rtu');
    const db = getDatabase();
    // the technician fills every reading and adds a row of their own
    getFullReport(report.id)!.checklist_items
      .filter((i) => !/_count$|unit_phase/.test(i.field_key ?? ''))
      .forEach((i, n) => db.runSync('UPDATE checklist_items SET value = ? WHERE id = ?', [`r${n}`, i.id]));
    const own = addCustomChecklistItem(report.id, 'Belt tension', 'شد السير');
    db.runSync("UPDATE checklist_items SET value = 'tight' WHERE id = ?", [own.id]);
    // a reading made on a row an older template had
    const legacyKey = [...LEGACY_ROW_KEYS][0];
    db.runSync(
      `INSERT INTO checklist_items (id, report_id, label_en, label_ar, value, field_key, is_custom, sort_order)
       VALUES ('old-1', ?, 'Old row', 'صف قديم', 'kept', ?, 0, 99)`,
      [report.id, legacyKey],
    );
    const before = values(report.id);

    // the app restarts: nothing may change
    upgradeOpenReports();
    expect(values(report.id)).toEqual(before);

    // a second compressor: its rows are added empty, every other value stays
    const count = getFullReport(report.id)!.checklist_items.find((i) => i.field_key === 'compressor_count')!;
    updateChecklistItem(count.id, '2');
    const after = values(report.id);
    Object.entries(before).forEach(([key, value]) => {
      if (key !== 'compressor_count') expect(after[key]).toBe(value);
    });
    expect(after['Belt tension']).toBe('tight');
    expect(after[legacyKey]).toBe('kept');
    const added = Object.keys(after).filter((k) => !(k in before));
    expect(added.length).toBeGreaterThan(0);
    added.forEach((k) => expect(after[k]).toBe(''));
  });
});

describe('the next report of the same unit', () => {
  it('starts with the refrigerant of the last report', async () => {
    const first = await createReport('rtu', { machineId: 'unit-r' });
    const row = getFullReport(first.id)!.checklist_items.find((i) => i.field_key === 'refrigerant')!;
    updateChecklistItem(row.id, 'R410A');
    const next = await createReport('rtu', { machineId: 'unit-r' });
    expect(values(next.id).refrigerant).toBe('R410A');
    // a chiller's box has another name
    const chiller = await createReport('chiller', { machineId: 'unit-c' });
    const box = getFullReport(chiller.id)!.checklist_items.find((i) => i.field_key === 'refrigerant_type')!;
    updateChecklistItem(box.id, 'R134a');
    expect(values((await createReport('chiller', { machineId: 'unit-c' })).id).refrigerant_type).toBe('R134a');
  });

  it('shows the renamed Exhaust Fan rows, in open reports too', async () => {
    const report = await createReport('rtu');
    const db = getDatabase();
    db.runSync(
      "UPDATE checklist_items SET label_en = 'Number of Extract Fans' WHERE report_id = ? AND field_key = 'extract_fan_count'",
      [report.id],
    );
    upgradeOpenReports();
    const row = getFullReport(report.id)!.checklist_items.find((i) => i.field_key === 'extract_fan_count')!;
    expect(row.label_en).toBe('Number of Exhaust Fans');
  });
});

describe('alarm list built into the app', () => {
  it('fills an empty phone once, and never replaces a list the phone already has', () => {
    const { countAlarms, loadBuiltInAlarms, replaceAlarms, searchAlarms } = require('../../db/repositories/alarms');
    loadBuiltInAlarms();
    expect(countAlarms()).toBe(2);
    expect(searchAlarms('d4.1')[0].name_en).toBe('High pressure');
    replaceAlarms(['code', 'key'], [['X9', 'X9']]); // the website's list after a sync
    loadBuiltInAlarms();
    expect(countAlarms()).toBe(1);
  });
});
