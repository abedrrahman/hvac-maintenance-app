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

describe('report forms from the website', () => {
  const { upsertWebMachine } = require('../../db/repositories/machines');
  const { replaceReportForms } = require('../../db/repositories/reportForms');
  const { deleteChecklistItem, reportForm } = require('../../db/repositories/reports');
  type Row = { key: string; label_en: string; hidden: boolean; custom: boolean };

  const webUnit = (webId: number) => {
    upsertWebMachine({
      web_id: webId, type: 'rtu', name: `Unit ${webId}`, brand: '', model: 'M', serial_number: `S${webId}`,
      client_name: 'Client', country: '', site: 'Site', location: '', project: '', web_documents: '[]',
      web_visit_id: null, web_visit_date: null,
    });
    return getDatabase().getFirstSync<{ id: string }>('SELECT id FROM machines WHERE web_id = ?', [webId])!.id;
  };
  const items = (id: string) => getFullReport(id)!.checklist_items;
  const item = (id: string, key: string) => items(id).find((i) => i.field_key === key)!;
  const keys = (id: string) => items(id).map((i) => i.field_key);
  const typeForm = {
    rows: [
      { key: 'phase_rotation', label_en: 'Rotation', label_ar: 'الدوران' },
      { key: 'voltage_l1l2', label_en: 'Voltage L1-L2', label_ar: 'الفولتيه', hidden: true },
      { key: 'custom_ab12cd34', label_en: 'Belt', label_ar: 'السير', custom: true },
      { key: 'compressor_#_amps_l1', label_en: 'Comp # L1', label_ar: 'ضاغط # L1' },
    ],
    materials: [{ description: 'Filter', unit: 'pcs' }],
    changed_at: '2099-01-01T10:00:00+03:00',
  };

  it('builds a new report from the type form: names, order, hidden and added boxes, parts', async () => {
    const unit = webUnit(501);
    replaceReportForms({ types: { rtu: typeForm } });
    const report = await createReport('rtu', { machineId: unit });
    const k = keys(report.id);
    expect(k.indexOf('phase_rotation')).toBeLessThan(k.indexOf('custom_ab12cd34'));
    expect(k.indexOf('custom_ab12cd34')).toBeLessThan(k.indexOf('compressor_1_amps_l1'));
    expect(k).not.toContain('voltage_l1l2');
    expect(k).toContain('refrigerant'); // not in the form: stays where the built-in form puts it
    expect(item(report.id, 'phase_rotation').label_en).toBe('Rotation');
    expect(item(report.id, 'compressor_1_amps_l1').label_ar).toBe('ضاغط 1 L1');
    expect(item(report.id, 'custom_ab12cd34').is_custom).toBe(1);
    expect(getFullReport(report.id)!.materials.map((m) => m.description)).toEqual(['Filter']);
  });

  it('a unit with its own form gets it, with its setup as starting values', async () => {
    const unit = webUnit(502);
    replaceReportForms({
      types: { rtu: typeForm },
      units: {
        '502': {
          report_type: 'rtu', rows: null, materials: [{ description: 'Belt', unit: 'pcs' }],
          setup: { phase: '1Ph', compressors: 2, refrigerant: 'R32', temp_unit: 'F', pressure_unit: 'psi' },
          changed_at: '2099-01-02T10:00:00Z',
        },
      },
    });
    const report = await createReport('rtu', { machineId: unit });
    const full = getFullReport(report.id)!;
    const v = values(report.id);
    expect(v.compressor_count).toBe('2');
    expect(v.unit_phase).toContain('1Ph');
    expect(keys(report.id)).toContain('compressor_2_amps'); // two compressors, single phase
    expect(keys(report.id)).not.toContain('compressor_3_amps');
    expect(v.refrigerant).toBe('R32');
    expect([full.temp_unit, full.pressure_unit]).toEqual(['F', 'psi']);
    expect(full.materials.map((m) => m.description)).toEqual(['Belt']);
    expect(item(report.id, 'phase_rotation').label_en).toBe('Rotation'); // its rows come from the type's form
  });

  it('an open report keeps its boxes after a changed form arrives; Back to default reaches new reports', async () => {
    const unit = webUnit(503);
    replaceReportForms({ types: { rtu: typeForm } });
    const open = await createReport('rtu', { machineId: unit });
    const before = items(open.id).map((i) => [i.field_key, i.label_en, i.sort_order]);
    replaceReportForms({}); // "Back to default" on the website, then a sync
    upgradeOpenReports(); // the app restarts
    expect(items(open.id).map((i) => [i.field_key, i.label_en, i.sort_order])).toEqual(before);
    // a second compressor in the open report: its rows follow the report's own form
    updateChecklistItem(item(open.id, 'compressor_count').id, '2');
    expect(item(open.id, 'compressor_2_amps_l1').label_en).toBe('Comp 2 L1');
    expect(keys(open.id)).toContain('custom_ab12cd34');
    expect(keys(open.id)).not.toContain('voltage_l1l2');

    const next = await createReport('rtu', { machineId: unit });
    expect(item(next.id, 'phase_rotation').label_en).toBe('Phase Rotation');
    expect(keys(next.id)).not.toContain('custom_ab12cd34');
    expect(keys(next.id)).toContain('voltage_l1l2');
  });

  it('the next report keeps the form while the website has not changed it', async () => {
    const unit = webUnit(504);
    replaceReportForms({ types: { rtu: { ...typeForm, changed_at: '2020-01-01T00:00:00Z' } } });
    const first = await createReport('rtu', { machineId: unit });
    expect(keys(first.id)).toContain('custom_ab12cd34');
    const second = await createReport('rtu', { machineId: unit });
    expect(keys(second.id)).toEqual(keys(first.id));
  });

  it('sends the form the report ended with: numbered boxes once with #, removed boxes hidden', async () => {
    const unit = webUnit(505);
    replaceReportForms({ types: { rtu: typeForm } });
    const report = await createReport('rtu', { machineId: unit });
    updateChecklistItem(item(report.id, 'compressor_count').id, '2');
    deleteChecklistItem(item(report.id, 'machine_load').id);
    addCustomChecklistItem(report.id, 'Noise', 'الضجيج');
    const form = reportForm(getFullReport(report.id)!);
    const rows: Row[] = form.rows;
    const amps = rows.filter((r) => r.key.startsWith('compressor_#_amps'));
    expect(amps.map((r) => r.key)).toEqual(['compressor_#_amps_l1', 'compressor_#_amps_l2', 'compressor_#_amps_l3']);
    expect(amps[0].label_en).toBe('Comp # L1');
    expect(amps[1].label_en).toBe('Compressor # Amps L2');
    expect(rows.find((r) => r.key === 'machine_load')).toMatchObject({ hidden: true });
    expect(rows.find((r) => r.key === 'voltage_l1l2')).toMatchObject({ hidden: true });
    expect(rows.find((r) => r.label_en === 'Noise')).toMatchObject({ custom: true, hidden: false });
    const shown = rows.filter((r) => !r.hidden).map((r) => r.key);
    expect(shown.indexOf('phase_rotation')).toBeLessThan(shown.indexOf('custom_ab12cd34'));
    expect(form.setup).toMatchObject({ compressors: 2, phase: '3Ph' });
    expect(form.materials).toEqual([{ description: 'Filter', unit: 'pcs' }]);
  });
});
