import { getDatabase } from '../database';
import { parseTemplateJson } from '@/db/repositories/machines';
import { DefaultMaterialTemplate, MachineType } from '@/types';
import { FormRow, FormSetup, isNewer, parseFormRows } from '@/utils/reportForm';

/** One form as GET /api/sync/ sends it in report_forms.types / report_forms.units. */
export interface WebForm {
  report_type?: string;
  rows?: FormRow[] | null;
  materials?: DefaultMaterialTemplate[] | null;
  setup?: FormSetup | null;
  changed_at?: string;
}

/** The form a new report of a unit starts from: rows and materials from the unit's form, else its type's form. */
export interface ResolvedForm {
  rows: FormRow[] | null;
  materials: DefaultMaterialTemplate[] | null;
  setup: FormSetup | null;
  changedAt: string;
}

interface FormRowInDb {
  report_type: string;
  rows: string | null;
  materials: string | null;
  setup: string | null;
  changed_at: string;
}

const json = (value: unknown) => (value == null ? null : JSON.stringify(value));

/** Replaces every saved form with the website's. Call inside the sync's transaction. */
export function replaceReportForms(forms: { types?: Record<string, WebForm>; units?: Record<string, WebForm> }): void {
  const db = getDatabase();
  db.runSync('DELETE FROM report_forms');
  const save = (scope: string, key: string, f: WebForm) =>
    db.runSync(
      'INSERT INTO report_forms (scope, key, report_type, rows, materials, setup, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [scope, key, f.report_type ?? '', json(f.rows), json(f.materials), json(f.setup), f.changed_at ?? ''],
    );
  Object.entries(forms.types ?? {}).forEach(([key, f]) => f && save('type', key, f));
  Object.entries(forms.units ?? {}).forEach(([key, f]) => f && save('unit', key, f));
}

// The website's data is checked here: a wrong shape counts as "not set", so it can never stop a new report.
function materialsOf(text: string | null | undefined): DefaultMaterialTemplate[] | null {
  const list = parseTemplateJson<unknown>(text ?? '', null);
  return Array.isArray(list) ? list.filter((m) => typeof m?.description === 'string') : null;
}

function setupOf(text: string | null | undefined): FormSetup | null {
  const setup = parseTemplateJson<unknown>(text ?? '', null);
  return setup && typeof setup === 'object' && !Array.isArray(setup) ? (setup as FormSetup) : null;
}

/** The website's form for this unit and report type, or null when the website has none (the built-in form applies). */
export function webFormFor(webId: number | null | undefined, type: MachineType): ResolvedForm | null {
  const db = getDatabase();
  const get = (scope: string, key: string) =>
    db.getFirstSync<FormRowInDb>('SELECT * FROM report_forms WHERE scope = ? AND key = ?', [scope, key]);
  let unit = webId != null ? get('unit', String(webId)) : null;
  // a unit's form made for another type of report does not fit this report's rows
  if (unit?.report_type && unit.report_type !== type) unit = null;
  const typeForm = get('type', type);
  if (!unit && !typeForm) return null;

  const unitRows = parseFormRows(unit?.rows);
  const unitMaterials = materialsOf(unit?.materials);
  // null at the unit means "use the type's form"; null at the type means "the app's built-in form"
  const useType = typeForm && (!unitRows || !unitMaterials);
  const times = [unit?.changed_at, useType ? typeForm.changed_at : null];
  return {
    rows: unitRows ?? (typeForm ? parseFormRows(typeForm.rows) : null),
    materials: unitMaterials ?? (typeForm ? materialsOf(typeForm.materials) : null),
    setup: setupOf(unit?.setup),
    changedAt: times.reduce<string>((a, b) => (isNewer(b, a) ? b! : a), ''),
  };
}
