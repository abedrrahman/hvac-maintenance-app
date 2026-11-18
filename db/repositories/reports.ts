import { getDatabase } from '../database';
import {
  DEFAULT_ATTENTION_ROWS,
  LEGACY_ROW_KEYS,
  UNIT_CONFIG_TYPES,
  UnitConfig,
  buildChecklist,
  defaultUnitConfig,
  getFieldDefinitions,
  hasUnitConfig,
  unitConfigFromValues,
  unitConfigValues,
  unitRowKeys,
} from '@/constants/checklists';
import {
  getMachineById,
  getMachineTemplate,
  parseTemplateJson,
  saveMachineTemplate,
  upsertMachine,
} from '@/db/repositories/machines';
import {
  AttentionNote,
  ChecklistItem,
  CustomChecklistRowTemplate,
  CustomChecklistTemplate,
  DefaultMaterialTemplate,
  FullReport,
  MachineType,
  MaintenanceType,
  Material,
  Photo,
  PressureUnit,
  Report,
  ReportFilters,
  Signature,
  TempUnit,
  Visit,
  VoltageTypeConfig,
} from '@/types';
import { formatDate, generateId } from '@/utils/helpers';
import { DEFAULT_UNITS, convertChecklistValueOnUnitChange } from '@/utils/units';

function rowToReport(row: Record<string, unknown>): Report {
  return {
    id: row.id as string,
    type: row.type as MachineType,
    machine_id: (row.machine_id as string) ?? null,
    client: (row.client as string) ?? '',
    site: (row.site as string) ?? '',
    date: row.date as string,
    technician: (row.technician as string) ?? '',
    machine_model: (row.machine_model as string) ?? '',
    serial_no: (row.serial_no as string) ?? '',
    maintenance_type: row.maintenance_type as MaintenanceType,
    status: row.status as Report['status'],
    logo_uri: (row.logo_uri as string) ?? null,
    required_maintenance: (row.required_maintenance as string) ?? '',
    general_notes: (row.general_notes as string) ?? '',
    temp_unit: (row.temp_unit as TempUnit) ?? 'C',
    pressure_unit: (row.pressure_unit as PressureUnit) ?? 'bar',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    uploaded_at: (row.uploaded_at as string) ?? null,
    upload_error: (row.upload_error as string) ?? '',
    visit_group: (row.visit_group as string) ?? null,
    visit_id: (row.visit_id as number) ?? null,
    contract_id: (row.contract_id as number) ?? null,
    contract_number: (row.contract_number as string) ?? '',
    contract_title: (row.contract_title as string) ?? '',
    contract_batch_id: (row.contract_batch_id as string) ?? null,
  };
}

/** Locked reports that have not reached the website yet, oldest first. */
export function getReportsToUpload(): Report[] {
  const db = getDatabase();
  return db
    .getAllSync<Record<string, unknown>>(
      "SELECT * FROM reports WHERE status = 'locked' AND uploaded_at IS NULL ORDER BY updated_at",
    )
    .map(rowToReport);
}

export function markReportUploaded(id: string): void {
  getDatabase().runSync(
    "UPDATE reports SET uploaded_at = ?, upload_error = '' WHERE id = ?",
    [new Date().toISOString(), id],
  );
}

export function markReportUploadError(id: string, message: string): void {
  getDatabase().runSync('UPDATE reports SET upload_error = ? WHERE id = ?', [
    message.slice(0, 300),
    id,
  ]);
}

export interface CreateReportOptions {
  machineId?: string;
  maintenanceType?: MaintenanceType;
  tempUnit?: TempUnit;
  pressureUnit?: PressureUnit;
  brand?: string;
  capacity?: string;
  location?: string;
  installationYear?: string;
  /** The website visit this report is made for, with its contract when it has one. */
  visit?: Pick<Visit, 'id' | 'contract_id' | 'contract_number' | 'contract_title'>;
}

function insertChecklistItem(
  reportId: string,
  labelEn: string,
  labelAr: string,
  fieldKey: string | null,
  isCustom: number,
  sortOrder: number,
  value = '',
): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO checklist_items (id, report_id, label_en, label_ar, value, field_key, is_custom, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), reportId, labelEn, labelAr, value, fieldKey, isCustom, sortOrder],
  );
}

/** The phase and count rows start filled in, so the report shows what its rows were built for. */
function seedDefaultChecklist(
  reportId: string,
  type: MachineType,
  config: UnitConfig = defaultUnitConfig(type),
): void {
  if (type === 'custom') {
    seedChecklistFromCustomTemplates(reportId);
    return;
  }

  const values = hasUnitConfig(type) ? unitConfigValues(config) : {};
  buildChecklist(type, config).forEach((field, index) => {
    insertChecklistItem(
      reportId,
      field.labelEn,
      field.labelAr,
      field.key,
      0,
      index,
      values[field.key] ?? '',
    );
  });
}

function valuesByKey(items: ChecklistItem[]): Record<string, string> {
  const values: Record<string, string> = {};
  items.forEach((i) => {
    if (i.field_key) values[i.field_key] = i.value;
  });
  return values;
}

function seedMaterialsFromTemplate(
  reportId: string,
  materials: DefaultMaterialTemplate[],
): void {
  const db = getDatabase();
  if (materials.length === 0) {
    db.runSync(
      `INSERT INTO materials (id, report_id, description, qty, unit, sort_order) VALUES (?, ?, '', '', '', 0)`,
      [generateId(), reportId],
    );
    return;
  }
  materials.forEach((m, i) => {
    db.runSync(
      `INSERT INTO materials (id, report_id, description, qty, unit, sort_order) VALUES (?, ?, ?, '', ?, ?)`,
      [generateId(), reportId, m.description, m.unit ?? '', i],
    );
  });
}

function seedAttentionRows(reportId: string, count = DEFAULT_ATTENTION_ROWS): void {
  const db = getDatabase();
  for (let i = 0; i < count; i++) {
    db.runSync(
      `INSERT INTO attention_notes (id, report_id, unit_no, note, sort_order) VALUES (?, ?, '', '', ?)`,
      [generateId(), reportId, i],
    );
  }
}

function carryOverFromReport(
  newReportId: string,
  type: MachineType,
  source: FullReport,
): void {
  const db = getDatabase();

  if (type !== 'custom' || source.type !== type) {
    // Rows come from today's template, built for the compressors, circuits and fans the last report recorded.
    // Only the rows the technician added by hand are copied. A row removed from the last report is back.
    seedDefaultChecklist(newReportId, type, unitConfigFromValues(type, valuesByKey(source.checklist_items)));
    source.checklist_items
      .filter((item) => item.is_custom)
      .forEach((item, i) => insertChecklistItem(newReportId, item.label_en, item.label_ar, null, 1, 1000 + i));
  } else {
    source.checklist_items.forEach((item, index) => {
      insertChecklistItem(
        newReportId,
        item.label_en,
        item.label_ar,
        item.field_key,
        item.is_custom,
        index,
        '',
      );
    });
  }

  seedAttentionRows(newReportId);

  const filledMaterials = source.materials.filter((m) => m.description.trim());
  if (filledMaterials.length > 0) {
    filledMaterials.forEach((m, i) => {
      db.runSync(
        `INSERT INTO materials (id, report_id, description, qty, unit, sort_order) VALUES (?, ?, ?, '', ?, ?)`,
        [generateId(), newReportId, m.description, m.unit ?? '', i],
      );
    });
  } else {
    seedMaterialsFromTemplate(newReportId, []);
  }
}

export async function createReport(
  type: MachineType,
  options: CreateReportOptions = {},
): Promise<Report> {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const date = formatDate();
  const maintenanceType = options.maintenanceType ?? 'Preventive';
  const tempUnit = options.tempUnit ?? DEFAULT_UNITS.tempUnit;
  const pressureUnit = options.pressureUnit ?? DEFAULT_UNITS.pressureUnit;

  // One transaction: a crash halfway must not leave a report with half its rows.
  db.withTransactionSync(() => {
  let machineId = options.machineId ?? null;

  let previousReport: FullReport | null = null;
  if (machineId) {
    const prevRow = db.getFirstSync<{ id: string }>(
      'SELECT id FROM reports WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1',
      [machineId],
    );
    if (prevRow) previousReport = getFullReport(prevRow.id);
  }

  db.runSync(
    `INSERT INTO reports (id, type, machine_id, date, maintenance_type, status,
     temp_unit, pressure_unit, created_at, updated_at, visit_id, contract_id, contract_number, contract_title)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, type, machineId, date, maintenanceType, tempUnit, pressureUnit, now, now,
      options.visit?.id ?? null, options.visit?.contract_id ?? null,
      options.visit?.contract_number ?? '', options.visit?.contract_title ?? '',
    ],
  );

  const machineTemplate = machineId ? getMachineTemplate(machineId) : null;

  if (previousReport) {
    carryOverFromReport(id, type, previousReport);
    db.runSync(
      'UPDATE reports SET client = ?, site = ?, machine_model = ?, serial_no = ?, temp_unit = ?, pressure_unit = ? WHERE id = ?',
      [
        previousReport.client,
        previousReport.site,
        previousReport.machine_model,
        previousReport.serial_no,
        previousReport.temp_unit,
        previousReport.pressure_unit,
        id,
      ],
    );
  } else if (machineTemplate) {
    seedDefaultChecklist(
      id,
      type,
      unitConfigFromValues(type, {
        compressor_count: String(machineTemplate.compressor_count),
        circuit_count: String(machineTemplate.circuit_count),
      }),
    );
    const customRows = parseTemplateJson<CustomChecklistRowTemplate[]>(
      machineTemplate.custom_checklist_rows,
      [],
    );
    customRows.forEach((row, i) => {
      insertChecklistItem(id, row.label_en, row.label_ar, null, 1, 1000 + i);
    });
    const defaultMaterials = parseTemplateJson<DefaultMaterialTemplate[]>(
      machineTemplate.default_materials,
      [],
    );
    seedMaterialsFromTemplate(id, defaultMaterials);
    seedAttentionRows(id);
  } else {
    seedDefaultChecklist(id, type);
    seedMaterialsFromTemplate(id, []);
    seedAttentionRows(id);
  }

  if (machineId) {
    const machine = getMachineById(machineId);
    if (machine && !previousReport) {
      db.runSync(
        'UPDATE reports SET client = ?, site = ?, machine_model = ?, serial_no = ? WHERE id = ?',
        [machine.client_name, machine.site, machine.model, machine.serial_number, id],
      );
    }
  }

  if (machineId && options.brand) {
    upsertMachine({
      id: machineId,
      type,
      brand: options.brand,
      capacity: options.capacity,
      location: options.location,
      installation_year: options.installationYear,
    });
  }
  });

  return getReportById(id)!;
}

export function linkReportToMachine(reportId: string, machineId: string): void {
  const db = getDatabase();
  db.runSync('UPDATE reports SET machine_id = ?, updated_at = ? WHERE id = ?', [
    machineId,
    new Date().toISOString(),
    reportId,
  ]);
}

export function syncMachineFromReport(report: Report, extras?: {
  brand?: string;
  capacity?: string;
  location?: string;
  installation_year?: string;
}): string {
  const machine = upsertMachine({
    id: report.machine_id ?? undefined,
    type: report.type,
    brand: extras?.brand,
    model: report.machine_model,
    serial_number: report.serial_no,
    capacity: extras?.capacity,
    client_name: report.client,
    site: report.site,
    location: extras?.location,
    installation_year: extras?.installation_year,
  });

  if (!report.machine_id) {
    linkReportToMachine(report.id, machine.id);
  }

  return machine.id;
}

export function saveMachineTemplateFromReport(report: FullReport): void {
  if (!report.machine_id) return;

  const customRows: CustomChecklistRowTemplate[] = report.checklist_items
    .filter((i) => i.is_custom)
    .map((i) => ({ label_en: i.label_en, label_ar: i.label_ar }));

  const defaultMaterials: DefaultMaterialTemplate[] = report.materials
    .filter((m) => m.description.trim())
    .map((m) => ({ description: m.description, unit: m.unit ?? '' }));

  let compressorCount = 1;
  let circuitCount = 1;
  let refrigerantType = '';
  const voltageTypes: VoltageTypeConfig[] = [];

  report.checklist_items.forEach((item) => {
    if (item.field_key === 'compressor_count') compressorCount = parseInt(item.value, 10) || 1;
    if (item.field_key === 'circuit_count') circuitCount = parseInt(item.value, 10) || 1;
    if (item.field_key === 'refrigerant_type') refrigerantType = item.value;
    const vtMatch = item.field_key?.match(/^compressor_(\d+)_voltage_type$/);
    if (vtMatch && item.value) {
      voltageTypes.push({
        compressorIndex: parseInt(vtMatch[1], 10),
        phase: item.value.includes('3Ph') ? '3Ph' : '1Ph',
      });
    }
  });

  saveMachineTemplate(report.machine_id, {
    compressor_count: compressorCount,
    circuit_count: circuitCount,
    voltage_types: voltageTypes,
    refrigerant_type: refrigerantType,
    custom_checklist_rows: customRows,
    default_materials: defaultMaterials,
    temp_unit: report.temp_unit,
    pressure_unit: report.pressure_unit,
  });
}

/** Template rows the technician removed from this report (held on a row): they must not come back when the rows are rebuilt. */
function removedRows(reportId: string): Set<string> {
  const row = getDatabase().getFirstSync<{ removed_rows: string | null }>(
    'SELECT removed_rows FROM reports WHERE id = ?',
    [reportId],
  );
  return new Set((row?.removed_rows ?? '').split('|').filter(Boolean));
}

/** Removes one row from this report only. The unit's next report has it again. */
export function deleteChecklistItem(id: string): void {
  const db = getDatabase();
  const item = db.getFirstSync<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', [id]);
  if (!item) return;
  db.withTransactionSync(() => {
    if (item.field_key && !item.is_custom) {
      const removed = removedRows(item.report_id).add(item.field_key);
      db.runSync('UPDATE reports SET removed_rows = ? WHERE id = ?', [[...removed].join('|'), item.report_id]);
    }
    db.runSync('DELETE FROM checklist_items WHERE id = ?', [id]);
  });
}

export const UNIT_CONFIG_KEYS = Object.keys(unitConfigValues(defaultUnitConfig('rtu')));

/**
 * After the phase or a count changed: the report gets exactly the rows its unit now has, in template order.
 * Rows that stay keep their values. Rows of a compressor, circuit or fan that is gone are deleted.
 */
export function syncUnitRows(reportId: string): void {
  const db = getDatabase();
  const report = getReportById(reportId);
  if (!report || !hasUnitConfig(report.type)) return;
  const items = db.getAllSync<ChecklistItem>(
    'SELECT * FROM checklist_items WHERE report_id = ? ORDER BY sort_order',
    [reportId],
  );
  const config = unitConfigFromValues(report.type, valuesByKey(items));
  const desired = buildChecklist(report.type, config);
  const place = new Map(desired.map((field, index) => [field.key, index]));
  const templateKeys = unitRowKeys(report.type);
  const kept = new Set<string>();
  let after = 1000; // hand-added rows and rows of older templates stay, below the template's rows

  items.forEach((item) => {
    const key = item.field_key ?? '';
    const at = item.is_custom ? undefined : place.get(key);
    if (at !== undefined && !kept.has(key)) {
      kept.add(key);
      if (item.sort_order !== at) db.runSync('UPDATE checklist_items SET sort_order = ? WHERE id = ?', [at, item.id]);
    } else if (
      !item.is_custom &&
      (templateKeys.has(key) ||
        /^compressor_\d+_voltage_type$/.test(key) ||
        // a row of the older template goes once it is empty; a reading typed into it is kept
        (LEGACY_ROW_KEYS.has(key) && !item.value.trim()))
    ) {
      db.runSync('DELETE FROM checklist_items WHERE id = ?', [item.id]);
    } else {
      db.runSync('UPDATE checklist_items SET sort_order = ? WHERE id = ?', [after++, item.id]);
    }
  });

  const values = unitConfigValues(config);
  const removed = removedRows(reportId);
  desired.forEach((field, index) => {
    if (!kept.has(field.key) && !removed.has(field.key)) {
      insertChecklistItem(reportId, field.labelEn, field.labelAr, field.key, 0, index, values[field.key] ?? '');
    }
  });
}

/**
 * Open reports started on an older template get today's rows (phase, counts, compressors, circuits, fans).
 * Locked reports are left exactly as they were signed. Runs at every start over the few open reports:
 * one that already matches is only read, so a report made by any earlier version is brought in line.
 */
export function upgradeOpenReports(): void {
  const db = getDatabase();
  const marks = UNIT_CONFIG_TYPES.map(() => '?').join(', ');
  const old = db.getAllSync<{ id: string }>(
    `SELECT id FROM reports WHERE status = 'open' AND type IN (${marks})`,
    UNIT_CONFIG_TYPES,
  );
  if (old.length === 0) return;
  db.withTransactionSync(() => old.forEach((r) => syncUnitRows(r.id)));
}

export function getReportById(id: string): Report | null {
  const db = getDatabase();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM reports WHERE id = ?',
    [id],
  );
  return row ? rowToReport(row) : null;
}

export function getFullReport(id: string): FullReport | null {
  const report = getReportById(id);
  if (!report) return null;

  const db = getDatabase();

  const checklist_items = db
    .getAllSync<ChecklistItem>(
      'SELECT * FROM checklist_items WHERE report_id = ? ORDER BY sort_order',
      [id],
    )
    .map((r: ChecklistItem) => ({ ...r, is_custom: r.is_custom ?? 0 }));

  const attention_notes = db.getAllSync<AttentionNote>(
    'SELECT * FROM attention_notes WHERE report_id = ? ORDER BY sort_order',
    [id],
  );

  const materials = db.getAllSync<Material>(
    'SELECT * FROM materials WHERE report_id = ? ORDER BY sort_order',
    [id],
  );

  const photos = db.getAllSync<Photo>(
    'SELECT * FROM photos WHERE report_id = ? ORDER BY sort_order',
    [id],
  );

  const signatures = db.getAllSync<Signature>(
    'SELECT * FROM signatures WHERE report_id = ?',
    [id],
  );

  return {
    ...report,
    checklist_items,
    attention_notes,
    materials,
    photos,
    signatures,
  };
}

export function getAllReports(filters?: ReportFilters): Report[] {
  const db = getDatabase();
  let query = 'SELECT * FROM reports WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters?.search) {
    query +=
      ' AND (client LIKE ? OR site LIKE ? OR technician LIKE ? OR machine_model LIKE ? OR serial_no LIKE ? OR date LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }

  if (filters?.machineType && filters.machineType !== 'all') {
    query += ' AND type = ?';
    params.push(filters.machineType);
  }

  if (filters?.dateFrom) {
    query += ' AND date >= ?';
    params.push(filters.dateFrom);
  }

  if (filters?.dateTo) {
    query += ' AND date <= ?';
    params.push(filters.dateTo);
  }

  query += ' ORDER BY created_at DESC';

  return db
    .getAllSync<Record<string, unknown>>(query, params)
    .map(rowToReport);
}

export function searchReportsGlobal(query: string): Report[] {
  return getAllReports({ search: query, machineType: 'all', dateFrom: null, dateTo: null });
}

export function getReportsByMachineId(machineId: string): Report[] {
  const db = getDatabase();
  return db
    .getAllSync<Record<string, unknown>>(
      'SELECT * FROM reports WHERE machine_id = ? ORDER BY created_at DESC',
      [machineId],
    )
    .map(rowToReport);
}

export function updateReport(
  id: string,
  fields: Partial<
    Pick<
      Report,
      | 'client'
      | 'site'
      | 'date'
      | 'technician'
      | 'machine_model'
      | 'serial_no'
      | 'maintenance_type'
      | 'logo_uri'
      | 'required_maintenance'
      | 'general_notes'
      | 'temp_unit'
      | 'pressure_unit'
      | 'machine_id'
    >
  >,
): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: (string | null)[] = [];

  Object.entries(fields).forEach(([key, value]) => {
    sets.push(`${key} = ?`);
    values.push(value != null ? String(value) : '');
  });

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.runSync(`UPDATE reports SET ${sets.join(', ')} WHERE id = ?`, values);
}

export function updateChecklistItem(id: string, value: string): void {
  const db = getDatabase();
  db.runSync('UPDATE checklist_items SET value = ? WHERE id = ?', [value, id]);

  const item = db.getFirstSync<ChecklistItem>(
    'SELECT * FROM checklist_items WHERE id = ?',
    [id],
  );
  if (item?.field_key && UNIT_CONFIG_KEYS.includes(item.field_key)) {
    syncUnitRows(item.report_id);
  }
}

export function addCustomChecklistItem(
  reportId: string,
  labelEn: string,
  labelAr: string,
): ChecklistItem {
  const db = getDatabase();
  const itemId = generateId();
  const maxOrder = db.getFirstSync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as m FROM checklist_items WHERE report_id = ?',
    [reportId],
  );
  const sortOrder = maxOrder?.m ?? 0;

  db.runSync(
    `INSERT INTO checklist_items (id, report_id, label_en, label_ar, value, field_key, is_custom, sort_order)
     VALUES (?, ?, ?, ?, '', NULL, 1, ?)`,
    [itemId, reportId, labelEn, labelAr, sortOrder],
  );

  return db.getFirstSync<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', [
    itemId,
  ])!;
}

export function updateAttentionNote(
  id: string,
  unitNo: string,
  note: string,
): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE attention_notes SET unit_no = ?, note = ? WHERE id = ?',
    [unitNo, note, id],
  );
}

export function addAttentionRow(reportId: string): void {
  const db = getDatabase();
  const maxOrder = db.getFirstSync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as m FROM attention_notes WHERE report_id = ?',
    [reportId],
  );
  db.runSync(
    'INSERT INTO attention_notes (id, report_id, unit_no, note, sort_order) VALUES (?, ?, ?, ?, ?)',
    [generateId(), reportId, '', '', maxOrder?.m ?? 0],
  );
}

export function updateMaterial(
  id: string,
  description: string,
  qty: string,
  unit = '',
): void {
  const db = getDatabase();
  db.runSync(
    'UPDATE materials SET description = ?, qty = ?, unit = ? WHERE id = ?',
    [description, qty, unit, id],
  );
}

export function addMaterialRow(reportId: string): void {
  const db = getDatabase();
  const maxOrder = db.getFirstSync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as m FROM materials WHERE report_id = ?',
    [reportId],
  );
  db.runSync(
    'INSERT INTO materials (id, report_id, description, qty, unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [generateId(), reportId, '', '', '', maxOrder?.m ?? 0],
  );
}

export function removeMaterialRow(id: string, reportId: string): void {
  const db = getDatabase();
  const count = db.getFirstSync<{ c: number }>(
    'SELECT COUNT(*) as c FROM materials WHERE report_id = ?',
    [reportId],
  );
  if ((count?.c ?? 0) <= 1) return;
  db.runSync('DELETE FROM materials WHERE id = ?', [id]);
}

export function addPhoto(
  reportId: string,
  uri: string,
  caption: string = '',
): Photo {
  const db = getDatabase();
  const photoId = generateId();
  const maxOrder = db.getFirstSync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as m FROM photos WHERE report_id = ?',
    [reportId],
  );

  db.runSync(
    'INSERT INTO photos (id, report_id, uri, caption, sort_order) VALUES (?, ?, ?, ?, ?)',
    [photoId, reportId, uri, caption, maxOrder?.m ?? 0],
  );

  return db.getFirstSync<Photo>('SELECT * FROM photos WHERE id = ?', [photoId])!;
}

export function updatePhotoCaption(id: string, caption: string): void {
  const db = getDatabase();
  db.runSync('UPDATE photos SET caption = ? WHERE id = ?', [caption, id]);
}

export function deletePhoto(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM photos WHERE id = ?', [id]);
}

export function saveSignature(
  reportId: string,
  type: 'technician' | 'client',
  imageBase64: string,
  signerName: string,
  signedAt: string,
): void {
  const db = getDatabase();
  const existing = db.getFirstSync<{ id: string }>(
    'SELECT id FROM signatures WHERE report_id = ? AND type = ?',
    [reportId, type],
  );

  if (existing) {
    db.runSync(
      'UPDATE signatures SET image_base64 = ?, signer_name = ?, signed_at = ? WHERE id = ?',
      [imageBase64, signerName, signedAt, existing.id],
    );
  } else {
    db.runSync(
      `INSERT INTO signatures (id, report_id, type, image_base64, signer_name, signed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), reportId, type, imageBase64, signerName, signedAt],
    );
  }
}

export function lockReport(id: string): void {
  const db = getDatabase();
  const full = getFullReport(id);
  if (full?.machine_id) {
    syncMachineFromReport(full);
    saveMachineTemplateFromReport(full);
  }
  db.runSync(
    "UPDATE reports SET status = 'locked', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), id],
  );
}

export function deleteReport(id: string): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM checklist_items WHERE report_id = ?', [id]);
    db.runSync('DELETE FROM attention_notes WHERE report_id = ?', [id]);
    db.runSync('DELETE FROM materials WHERE report_id = ?', [id]);
    db.runSync('DELETE FROM photos WHERE report_id = ?', [id]);
    db.runSync('DELETE FROM signatures WHERE report_id = ?', [id]);
    db.runSync('DELETE FROM reports WHERE id = ?', [id]);
  });
}

export function getCustomChecklistTemplates(): CustomChecklistTemplate[] {
  const db = getDatabase();
  return db.getAllSync<CustomChecklistTemplate>(
    'SELECT * FROM custom_checklist_templates ORDER BY sort_order',
  );
}

export function saveCustomChecklistTemplate(
  labelEn: string,
  labelAr: string,
  fieldType: string = 'text',
  options: string | null = null,
): void {
  const db = getDatabase();
  const maxOrder = db.getFirstSync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as m FROM custom_checklist_templates',
  );
  db.runSync(
    `INSERT INTO custom_checklist_templates (id, label_en, label_ar, field_type, options, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [generateId(), labelEn, labelAr, fieldType, options, maxOrder?.m ?? 0],
  );
}

export function deleteCustomChecklistTemplate(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM custom_checklist_templates WHERE id = ?', [id]);
}

export function seedChecklistFromCustomTemplates(reportId: string): void {
  const templates = getCustomChecklistTemplates();
  templates.forEach((t, index) => {
    insertChecklistItem(reportId, t.label_en, t.label_ar, t.id, 0, index);
  });
}

export function updateReportUnits(
  reportId: string,
  tempUnit: TempUnit,
  pressureUnit: PressureUnit,
): void {
  const report = getFullReport(reportId);
  if (!report) return;

  const defs = getFieldDefinitions(report.type);
  report.checklist_items.forEach((item) => {
    if (!item.value.trim()) return;
    const converted = convertChecklistValueOnUnitChange(
      item.value,
      defs.find((d) => d.key === item.field_key)?.type,
      report.temp_unit,
      tempUnit,
      report.pressure_unit,
      pressureUnit,
    );
    if (converted !== item.value) {
      updateChecklistItem(item.id, converted);
    }
  });

  updateReport(reportId, { temp_unit: tempUnit, pressure_unit: pressureUnit });
}

/** A report as the visit pages show it: its unit, and whether it is ready to be signed. */
export interface VisitReport extends Report {
  unit_name: string;
  unit_web_id: number | null;
  /** Checklist rows with no value. Ready to sign = none left (a row that does not apply can be deleted). */
  empty_rows: number;
  rows: number;
}

const VISIT_REPORT_SELECT = `SELECT r.*, COALESCE(NULLIF(m.name, ''), NULLIF(r.machine_model, ''), r.serial_no) AS unit_name,
    m.web_id AS unit_web_id,
    (SELECT COUNT(*) FROM checklist_items c WHERE c.report_id = r.id AND TRIM(c.value) = '') AS empty_rows,
    (SELECT COUNT(*) FROM checklist_items c WHERE c.report_id = r.id) AS row_count
  FROM reports r LEFT JOIN machines m ON m.id = r.machine_id`;

function rowToVisitReport(row: Record<string, unknown>): VisitReport {
  return {
    ...rowToReport(row),
    unit_name: (row.unit_name as string) ?? '',
    unit_web_id: (row.unit_web_id as number) ?? null,
    empty_rows: row.empty_rows as number,
    rows: row.row_count as number,
  };
}

export function isReadyToSign(report: VisitReport): boolean {
  return report.status === 'open' && report.rows > 0 && report.empty_rows === 0;
}

/** The newest report made for this website visit, if the technician has started one. */
export function getReportForVisit(visitId: number): VisitReport | null {
  const row = getDatabase().getFirstSync<Record<string, unknown>>(
    `${VISIT_REPORT_SELECT} WHERE r.visit_id = ? ORDER BY r.created_at DESC LIMIT 1`,
    [visitId],
  );
  return row ? rowToVisitReport(row) : null;
}

/** Every report made for this contract on the phone, newest first. */
export function getContractReports(contractId: number): VisitReport[] {
  return getDatabase()
    .getAllSync<Record<string, unknown>>(
      `${VISIT_REPORT_SELECT} WHERE r.contract_id = ? ORDER BY r.created_at DESC`,
      [contractId],
    )
    .map(rowToVisitReport);
}

export interface SignatureInput {
  image: string;
  name: string;
}

/**
 * The contract's "sign all": the two signatures go into every chosen report, which all get one batch id and are locked.
 * All of them or none: one transaction. Returns the batch id.
 */
export function signContractReports(
  reportIds: string[],
  technician: SignatureInput,
  client: SignatureInput,
  signedAt: string,
): string {
  const db = getDatabase();
  const batch = `batch-${generateId()}`;
  db.withTransactionSync(() => {
    reportIds.forEach((id) => {
      const report = getReportById(id);
      if (!report || report.status !== 'open') return;
      saveSignature(id, 'technician', technician.image, technician.name, signedAt);
      saveSignature(id, 'client', client.image, client.name, signedAt);
      db.runSync(
        "UPDATE reports SET contract_batch_id = ?, technician = CASE WHEN technician = '' THEN ? ELSE technician END WHERE id = ?",
        [batch, technician.name.trim(), id],
      );
      lockReport(id);
    });
  });
  return batch;
}
