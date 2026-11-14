import {
  DefaultMaterialTemplate,
  CustomChecklistRowTemplate,
  Machine,
  MachineFilters,
  MachineTemplate,
  MachineType,
  PressureUnit,
  TempUnit,
  VoltageTypeConfig,
} from '@/types';
import { getDatabase } from '../database';
import { generateId } from '@/utils/helpers';

function rowToMachine(row: Record<string, unknown>): Machine {
  return {
    id: row.id as string,
    type: row.type as MachineType,
    brand: (row.brand as string) ?? '',
    model: (row.model as string) ?? '',
    serial_number: (row.serial_number as string) ?? '',
    capacity: (row.capacity as string) ?? '',
    client_name: (row.client_name as string) ?? '',
    site: (row.site as string) ?? '',
    location: (row.location as string) ?? '',
    installation_year: (row.installation_year as string) ?? '',
    created_at: row.created_at as string,
    web_id: (row.web_id as number) ?? null,
    name: (row.name as string) ?? '',
    project: (row.project as string) ?? '',
    web_documents: (row.web_documents as string) ?? '[]',
    web_visit_id: (row.web_visit_id as number) ?? null,
  };
}

/** What the phone already holds from the website, so a download can tell which sites and units are new. */
export function getWebMachineKeys(): { web_id: number; client_name: string }[] {
  return getDatabase().getAllSync<{ web_id: number; client_name: string }>(
    'SELECT web_id, client_name FROM machines WHERE web_id IS NOT NULL',
  );
}

/** Removes website units the website no longer sends (deleted or merged there). A unit with a report on this phone is kept, so no report loses its machine. */
export function removeWebMachinesNotIn(webIds: number[]): void {
  const keep = webIds.filter(Number.isInteger).join(','); // numbers only, so they are safe inside the SQL text (too many for parameters)
  getDatabase().runSync(
    `DELETE FROM machines WHERE web_id IS NOT NULL AND web_id NOT IN (${keep || 'NULL'})
       AND id NOT IN (SELECT machine_id FROM reports WHERE machine_id IS NOT NULL)`,
  );
}

/** One unit from the website's download. Updates the machine it matches, or adds it. Hand-typed details (capacity, year) are kept. */
export function upsertWebMachine(data: {
  web_id: number;
  type: MachineType;
  name: string;
  brand: string;
  model: string;
  serial_number: string;
  client_name: string;
  site: string;
  location: string;
  project: string;
  web_documents: string;
  web_visit_id: number | null;
}): void {
  const db = getDatabase();
  const existing = db.getFirstSync<{ id: string }>(
    'SELECT id FROM machines WHERE web_id = ?',
    [data.web_id],
  );
  if (existing) {
    db.runSync(
      `UPDATE machines SET name=?, brand=?, model=?, serial_number=?, client_name=?, site=?,
       location=?, project=?, web_documents=?, web_visit_id=? WHERE id=?`,
      [
        data.name, data.brand, data.model, data.serial_number, data.client_name, data.site,
        data.location, data.project, data.web_documents, data.web_visit_id, existing.id,
      ],
    );
    return;
  }
  db.runSync(
    `INSERT INTO machines (id, type, name, brand, model, serial_number, client_name, site,
     location, project, web_documents, web_visit_id, web_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(), data.type, data.name, data.brand, data.model, data.serial_number,
      data.client_name, data.site, data.location, data.project, data.web_documents,
      data.web_visit_id, data.web_id, new Date().toISOString(),
    ],
  );
}

function rowToTemplate(row: Record<string, unknown>): MachineTemplate {
  return {
    id: row.id as string,
    machine_id: row.machine_id as string,
    compressor_count: (row.compressor_count as number) ?? 1,
    circuit_count: (row.circuit_count as number) ?? 1,
    voltage_types: (row.voltage_types as string) ?? '[]',
    refrigerant_type: (row.refrigerant_type as string) ?? '',
    custom_checklist_rows: (row.custom_checklist_rows as string) ?? '[]',
    default_materials: (row.default_materials as string) ?? '[]',
    temp_unit: (row.temp_unit as TempUnit) ?? 'C',
    pressure_unit: (row.pressure_unit as PressureUnit) ?? 'bar',
    updated_at: row.updated_at as string,
  };
}

export function upsertMachine(data: {
  type: MachineType;
  brand?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  client_name?: string;
  site?: string;
  location?: string;
  installation_year?: string;
  id?: string;
}): Machine {
  const db = getDatabase();
  const now = new Date().toISOString();

  if (data.id) {
    const existing = getMachineById(data.id);
    if (existing) {
      db.runSync(
        `UPDATE machines SET type=?, brand=?, model=?, serial_number=?, capacity=?,
         client_name=?, site=?, location=?, installation_year=? WHERE id=?`,
        [
          data.type,
          data.brand ?? existing.brand,
          data.model ?? existing.model,
          data.serial_number ?? existing.serial_number,
          data.capacity ?? existing.capacity,
          data.client_name ?? existing.client_name,
          data.site ?? existing.site,
          data.location ?? existing.location,
          data.installation_year ?? existing.installation_year,
          data.id,
        ],
      );
      return getMachineById(data.id)!;
    }
  }

  const id = data.id ?? generateId();
  db.runSync(
    `INSERT INTO machines (id, type, brand, model, serial_number, capacity,
     client_name, site, location, installation_year, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.type,
      data.brand ?? '',
      data.model ?? '',
      data.serial_number ?? '',
      data.capacity ?? '',
      data.client_name ?? '',
      data.site ?? '',
      data.location ?? '',
      data.installation_year ?? '',
      now,
    ],
  );
  return getMachineById(id)!;
}

export function getMachineById(id: string): Machine | null {
  const db = getDatabase();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM machines WHERE id = ?',
    [id],
  );
  return row ? rowToMachine(row) : null;
}

export function getAllMachines(filters?: MachineFilters): Machine[] {
  const db = getDatabase();
  let query = 'SELECT * FROM machines WHERE 1=1';
  const params: string[] = [];

  if (filters?.search) {
    query +=
      ' AND (client_name LIKE ? OR model LIKE ? OR serial_number LIKE ? OR site LIKE ? OR brand LIKE ? OR name LIKE ? OR project LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term, term);
  }

  query += ' ORDER BY created_at DESC';

  return db
    .getAllSync<Record<string, unknown>>(query, params)
    .map(rowToMachine);
}

export function searchMachines(query: string): Machine[] {
  return getAllMachines({ search: query });
}

export function deleteMachine(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM machine_templates WHERE machine_id = ?', [id]);
  db.runSync('DELETE FROM machines WHERE id = ?', [id]);
}

export function getMachineTemplate(machineId: string): MachineTemplate | null {
  const db = getDatabase();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM machine_templates WHERE machine_id = ?',
    [machineId],
  );
  return row ? rowToTemplate(row) : null;
}

export function saveMachineTemplate(
  machineId: string,
  data: {
    compressor_count?: number;
    circuit_count?: number;
    voltage_types?: VoltageTypeConfig[];
    refrigerant_type?: string;
    custom_checklist_rows?: CustomChecklistRowTemplate[];
    default_materials?: DefaultMaterialTemplate[];
    temp_unit?: TempUnit;
    pressure_unit?: PressureUnit;
  },
): MachineTemplate {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = getMachineTemplate(machineId);

  const payload = {
    compressor_count: data.compressor_count ?? existing?.compressor_count ?? 1,
    circuit_count: data.circuit_count ?? existing?.circuit_count ?? 1,
    voltage_types: JSON.stringify(
      data.voltage_types ??
        (existing ? JSON.parse(existing.voltage_types) : []),
    ),
    refrigerant_type:
      data.refrigerant_type ?? existing?.refrigerant_type ?? '',
    custom_checklist_rows: JSON.stringify(
      data.custom_checklist_rows ??
        (existing ? JSON.parse(existing.custom_checklist_rows) : []),
    ),
    default_materials: JSON.stringify(
      data.default_materials ??
        (existing ? JSON.parse(existing.default_materials) : []),
    ),
    temp_unit: data.temp_unit ?? existing?.temp_unit ?? 'C',
    pressure_unit: data.pressure_unit ?? existing?.pressure_unit ?? 'bar',
  };

  if (existing) {
    db.runSync(
      `UPDATE machine_templates SET compressor_count=?, circuit_count=?, voltage_types=?,
       refrigerant_type=?, custom_checklist_rows=?, default_materials=?,
       temp_unit=?, pressure_unit=?, updated_at=? WHERE machine_id=?`,
      [
        payload.compressor_count,
        payload.circuit_count,
        payload.voltage_types,
        payload.refrigerant_type,
        payload.custom_checklist_rows,
        payload.default_materials,
        payload.temp_unit,
        payload.pressure_unit,
        now,
        machineId,
      ],
    );
  } else {
    db.runSync(
      `INSERT INTO machine_templates (id, machine_id, compressor_count, circuit_count,
       voltage_types, refrigerant_type, custom_checklist_rows, default_materials,
       temp_unit, pressure_unit, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        machineId,
        payload.compressor_count,
        payload.circuit_count,
        payload.voltage_types,
        payload.refrigerant_type,
        payload.custom_checklist_rows,
        payload.default_materials,
        payload.temp_unit,
        payload.pressure_unit,
        now,
      ],
    );
  }

  return getMachineTemplate(machineId)!;
}

export function getReportsForMachine(machineId: string) {
  const db = getDatabase();
  return db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM reports WHERE machine_id = ? ORDER BY created_at DESC',
    [machineId],
  );
}

export function findMachineBySerial(serial: string): Machine | null {
  if (!serial.trim()) return null;
  const db = getDatabase();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM machines WHERE serial_number = ? COLLATE NOCASE LIMIT 1',
    [serial.trim()],
  );
  return row ? rowToMachine(row) : null;
}

export function parseTemplateJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
