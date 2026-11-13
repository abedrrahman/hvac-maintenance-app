export type ReportStatus = 'open' | 'locked';
export type MaintenanceType =
  | 'Startup'
  | 'Preventive'
  | 'Corrective'
  | 'Emergency'
  | 'Commissioning';

export type MachineType =
  | 'ahu'
  | 'chiller'
  | 'fcu'
  | 'split'
  | 'vrf'
  | 'cooling_tower'
  | 'boiler'
  | 'custom';

export type TempUnit = 'C' | 'F' | 'K';
export type PressureUnit = 'bar' | 'psi' | 'kPa' | 'MPa';
export type VoltagePhase = '1Ph' | '3Ph';

export type ChecklistFieldType =
  | 'text'
  | 'dropdown'
  | 'voltage'
  | 'temperature'
  | 'number'
  | 'pressure'
  | 'count';

export interface ChecklistFieldDef {
  key: string;
  labelEn: string;
  labelAr: string;
  type: ChecklistFieldType;
  options?: string[];
  placeholder?: string;
  unit?: string;
  section?: string;
}

export interface Machine {
  id: string;
  type: MachineType;
  brand: string;
  model: string;
  serial_number: string;
  capacity: string;
  client_name: string;
  site: string;
  location: string;
  installation_year: string;
  created_at: string;
  /** From the ASEE website. web_id is empty for machines typed in by hand. */
  web_id: number | null;
  name: string;
  project: string;
  web_documents: string;
  web_visit_id: number | null;
}

export interface WebDocument {
  name: string;
  type: string;
  url: string;
}

export interface CustomChecklistRowTemplate {
  label_en: string;
  label_ar: string;
}

export interface DefaultMaterialTemplate {
  description: string;
  unit: string;
}

export interface VoltageTypeConfig {
  compressorIndex: number;
  phase: VoltagePhase;
}

export interface MachineTemplate {
  id: string;
  machine_id: string;
  compressor_count: number;
  circuit_count: number;
  voltage_types: string;
  refrigerant_type: string;
  custom_checklist_rows: string;
  default_materials: string;
  temp_unit: TempUnit;
  pressure_unit: PressureUnit;
  updated_at: string;
}

export interface Report {
  id: string;
  type: MachineType;
  machine_id: string | null;
  client: string;
  site: string;
  date: string;
  technician: string;
  machine_model: string;
  serial_no: string;
  maintenance_type: MaintenanceType;
  status: ReportStatus;
  logo_uri: string | null;
  required_maintenance: string;
  general_notes: string;
  temp_unit: TempUnit;
  pressure_unit: PressureUnit;
  created_at: string;
  updated_at: string;
  /** When the locked report reached the website; empty while it waits for a connection. */
  uploaded_at: string | null;
  upload_error: string;
}

export interface ChecklistItem {
  id: string;
  report_id: string;
  label_en: string;
  label_ar: string;
  value: string;
  field_key: string | null;
  is_custom: number;
  sort_order: number;
}

export interface AttentionNote {
  id: string;
  report_id: string;
  unit_no: string;
  note: string;
  sort_order: number;
}

export interface Material {
  id: string;
  report_id: string;
  description: string;
  qty: string;
  unit: string;
  sort_order: number;
}

export interface Photo {
  id: string;
  report_id: string;
  uri: string;
  caption: string;
  sort_order: number;
}

export interface Signature {
  id: string;
  report_id: string;
  type: 'technician' | 'client';
  image_base64: string;
  signer_name: string;
  signed_at: string;
}

export interface CustomChecklistTemplate {
  id: string;
  label_en: string;
  label_ar: string;
  field_type: ChecklistFieldType;
  options: string | null;
  sort_order: number;
}

export interface FullReport extends Report {
  checklist_items: ChecklistItem[];
  attention_notes: AttentionNote[];
  materials: Material[];
  photos: Photo[];
  signatures: Signature[];
}

export interface ReportFilters {
  search: string;
  machineType: MachineType | 'all';
  dateFrom: string | null;
  dateTo: string | null;
}

export interface MachineFilters {
  search: string;
}

export interface SearchResult {
  report: Report;
  machineLabel: string;
}

export interface GlobalUnits {
  tempUnit: TempUnit;
  pressureUnit: PressureUnit;
}
