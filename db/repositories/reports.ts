import { getDatabase } from '../database';
import {
  DEFAULT_ATTENTION_ROWS,
  getChecklistTemplate,
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
  VoltageTypeConfig,
} from '@/types';
import { buildChillerChecklist, isChillerDynamicKey } from '@/utils/chillerFields';
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
  };
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

function seedDefaultChecklist(
  reportId: string,
  type: MachineType,
  compressorCount = 1,
  circuitCount = 1,
): void {
  if (type === 'custom') {
    seedChecklistFromCustomTemplates(reportId);
    return;
  }

  const template =
    type === 'chiller'
      ? buildChillerChecklist(compressorCount, circuitCount)
      : getChecklistTemplate(type);

  template.forEach((field, index) => {
    insertChecklistItem(
      reportId,
      field.labelEn,
      field.labelAr,
      field.key,
      0,
      index,
    );
  });
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
  source: FullReport,
): void {
  const db = getDatabase();

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

  let machineId = options.machineId ?? null;
  let compressorCount = 1;
  let circuitCount = 1;

  let previousReport: FullReport | null = null;
  if (machineId) {
    const template = getMachineTemplate(machineId);
    if (template) {
      compressorCount = template.compressor_count;
      circuitCount = template.circuit_count;
    }
    const prevRow = db.getFirstSync<{ id: string }>(
      'SELECT id FROM reports WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1',
      [machineId],
    );
    if (prevRow) previousReport = getFullReport(prevRow.id);
  }

  db.runSync(
    `INSERT INTO reports (id, type, machine_id, date, maintenance_type, status,
     temp_unit, pressure_unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    [id, type, machineId, date, maintenanceType, tempUnit, pressureUnit, now, now],
  );

  const machineTemplate = machineId ? getMachineTemplate(machineId) : null;

  if (previousReport) {
    carryOverFromReport(id, previousReport);
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
    seedDefaultChecklist(id, type, machineTemplate.compressor_count, machineTemplate.circuit_count);
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
    seedDefaultChecklist(id, type, compressorCount, circuitCount);
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
    brand: extras?.brand ?? '',
    model: report.machine_model,
    serial_number: report.serial_no,
    capacity: extras?.capacity ?? '',
    client_name: report.client,
    site: report.site,
    location: extras?.location ?? '',
    installation_year: extras?.installation_year ?? '',
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

export function syncChillerDynamicFields(reportId: string): void {
  const db = getDatabase();
  const items = db.getAllSync<ChecklistItem>(
    'SELECT * FROM checklist_items WHERE report_id = ?',
    [reportId],
  );

  let compressorCount = 1;
  let circuitCount = 1;
  items.forEach((item) => {
    if (item.field_key === 'compressor_count') compressorCount = parseInt(item.value, 10) || 1;
    if (item.field_key === 'circuit_count') circuitCount = parseInt(item.value, 10) || 1;
  });

  compressorCount = Math.min(Math.max(compressorCount, 1), 4);
  circuitCount = Math.min(Math.max(circuitCount, 1), 4);

  const desired = buildChillerChecklist(compressorCount, circuitCount);
  const desiredKeys = new Set(desired.map((d) => d.key));

  items.forEach((item) => {
    if (item.field_key && isChillerDynamicKey(item.field_key) && !desiredKeys.has(item.field_key)) {
      if (!item.field_key.match(/^(compressor_count|circuit_count|refrigerant_type)$/)) {
        db.runSync('DELETE FROM checklist_items WHERE id = ?', [item.id]);
      }
    }
  });

  const remaining = db.getAllSync<ChecklistItem>(
    'SELECT * FROM checklist_items WHERE report_id = ?',
    [reportId],
  );
  const existingKeys = new Set(remaining.map((i) => i.field_key).filter(Boolean));

  let maxOrder = remaining.reduce((m, i) => Math.max(m, i.sort_order), 0);

  desired.forEach((field) => {
    if (!existingKeys.has(field.key)) {
      maxOrder += 1;
      insertChecklistItem(
        reportId,
        field.labelEn,
        field.labelAr,
        field.key,
        0,
        maxOrder,
      );
    }
  });
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
  if (
    item &&
    (item.field_key === 'compressor_count' || item.field_key === 'circuit_count')
  ) {
    syncChillerDynamicFields(item.report_id);
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

export function removeCustomChecklistItem(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM checklist_items WHERE id = ? AND is_custom = 1', [id]);
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
  db.runSync('DELETE FROM checklist_items WHERE report_id = ?', [id]);
  db.runSync('DELETE FROM attention_notes WHERE report_id = ?', [id]);
  db.runSync('DELETE FROM materials WHERE report_id = ?', [id]);
  db.runSync('DELETE FROM photos WHERE report_id = ?', [id]);
  db.runSync('DELETE FROM signatures WHERE report_id = ?', [id]);
  db.runSync('DELETE FROM reports WHERE id = ?', [id]);
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

  report.checklist_items.forEach((item) => {
    if (!item.value.trim()) return;
    const converted = convertChecklistValueOnUnitChange(
      item.value,
      item.field_key,
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
