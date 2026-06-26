import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlobalUnits, PressureUnit, TempUnit } from '@/types';

const UNITS_KEY = '@hvac_global_units';

export const DEFAULT_UNITS: GlobalUnits = {
  tempUnit: 'C',
  pressureUnit: 'bar',
};

export async function loadGlobalUnits(): Promise<GlobalUnits> {
  try {
    const raw = await AsyncStorage.getItem(UNITS_KEY);
    if (raw) return JSON.parse(raw) as GlobalUnits;
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_UNITS };
}

export async function saveGlobalUnits(units: GlobalUnits): Promise<void> {
  await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(units));
}

export function tempUnitLabel(unit: TempUnit): string {
  if (unit === 'C') return '°C';
  if (unit === 'F') return '°F';
  return 'K';
}

export function pressureUnitLabel(unit: PressureUnit): string {
  return unit;
}

export function convertTemperature(
  value: number,
  from: TempUnit,
  to: TempUnit,
): number {
  if (from === to) return value;
  let celsius = value;
  if (from === 'F') celsius = ((value - 32) * 5) / 9;
  if (from === 'K') celsius = value - 273.15;
  if (to === 'C') return Math.round(celsius * 100) / 100;
  if (to === 'F') return Math.round(((celsius * 9) / 5 + 32) * 100) / 100;
  return Math.round((celsius + 273.15) * 100) / 100;
}

export function convertPressure(
  value: number,
  from: PressureUnit,
  to: PressureUnit,
): number {
  if (from === to) return value;
  let bar = value;
  if (from === 'psi') bar = value / 14.5038;
  if (from === 'kPa') bar = value / 100;
  if (from === 'MPa') bar = value / 0.1;
  if (to === 'bar') return Math.round(bar * 1000) / 1000;
  if (to === 'psi') return Math.round(bar * 14.5038 * 100) / 100;
  if (to === 'kPa') return Math.round(bar * 100 * 100) / 100;
  return Math.round(bar * 0.1 * 1000) / 1000;
}

export function convertChecklistValueOnUnitChange(
  value: string,
  fieldKey: string | null,
  fromTemp: TempUnit,
  toTemp: TempUnit,
  fromPressure: PressureUnit,
  toPressure: PressureUnit,
): string {
  if (!value.trim() || !fieldKey) return value;

  const num = parseFloat(value.replace(/[^\d.-]/g, ''));
  if (isNaN(num)) return value;

  if (
    fieldKey.includes('temp') ||
    fieldKey.includes('temperature') ||
    fieldKey.endsWith('_temp')
  ) {
    return String(convertTemperature(num, fromTemp, toTemp));
  }

  if (
    fieldKey.includes('pressure') ||
    fieldKey.includes('suction') ||
    fieldKey.includes('discharge') ||
    fieldKey === 'oil_pressure' ||
    fieldKey.includes('high_pressure') ||
    fieldKey.includes('low_pressure')
  ) {
    return String(convertPressure(num, fromPressure, toPressure));
  }

  return value;
}

export const TEMP_UNITS: TempUnit[] = ['C', 'F', 'K'];
export const PRESSURE_UNITS: PressureUnit[] = ['bar', 'psi', 'kPa', 'MPa'];

export const TEMP_UNIT_LABELS: Record<TempUnit, string> = {
  C: '°C (Celsius)',
  F: '°F (Fahrenheit)',
  K: 'K (Kelvin)',
};

export const PRESSURE_UNIT_LABELS: Record<PressureUnit, string> = {
  bar: 'bar',
  psi: 'psi',
  kPa: 'kPa',
  MPa: 'MPa',
};
