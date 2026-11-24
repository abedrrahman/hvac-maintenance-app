import { ChecklistFieldDef } from '@/types';

/** One box of a report form as the website sends and receives it. `#` in key and names stands for the compressor, circuit or fan number. */
export interface FormRow {
  key: string;
  label_en: string;
  label_ar: string;
  hidden?: boolean;
  custom?: boolean;
}

export interface FormSetup {
  phase?: string;
  compressors?: number;
  circuits?: number;
  supply_fans?: number;
  extract_fans?: number;
  return_fans?: number;
  refrigerant?: string;
  temp_unit?: string;
  pressure_unit?: string;
}

/** A box a report starts with: a built-in field, or a website custom box (custom: true, free text). */
export type FormField = Pick<ChecklistFieldDef, 'key' | 'labelEn' | 'labelAr'> & { custom?: boolean };

// The phase and count rows decide which other rows exist: the website cannot hide them.
const CONFIG_KEYS = new Set([
  'unit_phase', 'compressor_count', 'circuit_count', 'supply_fan_count', 'extract_fan_count', 'return_fan_count',
]);

const NUMBERED = /^(compressor|circuit|supply_fan|extract_fan|return_fan)_(\d+)_/;

/** compressor_2_amps_l1 / "Compressor 2 Amps L1" -> compressor_#_amps_l1 / "Compressor # Amps L1". Other rows stay as they are. */
export function toPattern(key: string, labelEn: string, labelAr: string): FormRow {
  const match = key.match(NUMBERED);
  if (!match) return { key, label_en: labelEn, label_ar: labelAr };
  // the number on its own, not the 1 of "L1"
  const number = new RegExp(`(^|[^\\w])${match[2]}(?!\\w)`);
  const hash = (label: string) => label.replace(number, '$1#');
  return { key: key.replace(NUMBERED, `${match[1]}_#_`), label_en: hash(labelEn), label_ar: hash(labelAr) };
}

/**
 * Lays the built-in rows out as the website's form says: its order, its names, hidden rows left out, custom boxes at their place.
 * A built-in row the form does not mention stays after the row it follows in the built-in form.
 * Rows of a compressor, circuit or fan the unit does not have are not in `fields`, so they are not made.
 */
export function applyForm(fields: ChecklistFieldDef[], rows: FormRow[] | null | undefined): FormField[] {
  if (!rows?.length) return fields;
  const patternOf = new Map(fields.map((f) => [f.key, toPattern(f.key, f.labelEn, f.labelAr).key]));
  const out: FormField[] = [];
  const placed = new Set<string>();
  rows.forEach((row) => {
    if (row.custom) {
      if (!row.hidden && row.key) {
        out.push({ key: row.key, labelEn: String(row.label_en ?? ''), labelAr: String(row.label_ar ?? ''), custom: true });
      }
      return;
    }
    fields.forEach((f) => {
      if (placed.has(f.key) || patternOf.get(f.key) !== row.key) return;
      placed.add(f.key);
      if (row.hidden && !CONFIG_KEYS.has(f.key)) return;
      const n = f.key.match(NUMBERED)?.[2] ?? '';
      const name = (text: unknown, fallback: string) => (typeof text === 'string' && text ? text.replace(/#/g, n) : fallback);
      out.push({ key: f.key, labelEn: name(row.label_en, f.labelEn), labelAr: name(row.label_ar, f.labelAr) });
    });
  });
  // rows the form does not mention (the app gained them after the form was saved)
  fields.forEach((f, i) => {
    if (placed.has(f.key)) return;
    const before = fields.slice(0, i).reverse().find((p) => out.some((o) => o.key === p.key));
    out.splice(before ? out.findIndex((o) => o.key === before.key) + 1 : 0, 0, f);
  });
  return out;
}

/** Parses a JSON column holding form rows. Anything odd counts as "no form". */
export function parseFormRows(json: string | null | undefined): FormRow[] | null {
  try {
    const rows = JSON.parse(json ?? 'null');
    return Array.isArray(rows) ? rows.filter((r) => r && typeof r.key === 'string') : null;
  } catch {
    return null;
  }
}

/** True when date-time a is later than b. Website times carry a zone (+03:00), so they are compared as times, not as text. */
export function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = Date.parse(a ?? '');
  if (Number.isNaN(ta)) return false;
  const tb = Date.parse(b ?? '');
  return Number.isNaN(tb) || ta > tb;
}
