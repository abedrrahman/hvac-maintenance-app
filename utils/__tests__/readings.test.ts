// The two pieces of logic a wrong edit would silently corrupt: converting readings, and which chiller rows a report shows.
import { describe, expect, it, jest } from '@jest/globals';
import { CHECKLIST_TEMPLATES, buildChecklist, getFieldDefinitions, unitConfigFromValues } from '../../constants/checklists';
import { MACHINE_TYPES } from '../../constants/machineTypes';
import { buildChillerChecklist, getVisibleCompressorFields, visibleChecklistItems } from '../chillerFields';
import { reportNumber } from '../helpers';
import { convertChecklistValueOnUnitChange, convertPressure, convertTemperature } from '../units';

jest.mock('@react-native-async-storage/async-storage', () => ({}));

describe('unit conversion', () => {
  it('converts temperatures both ways', () => {
    expect(convertTemperature(100, 'C', 'F')).toBe(212);
    expect(convertTemperature(32, 'F', 'C')).toBe(0);
    expect(convertTemperature(0, 'C', 'K')).toBe(273.15);
    expect(convertTemperature(7, 'C', 'C')).toBe(7);
  });

  it('converts pressures both ways', () => {
    expect(convertPressure(1, 'bar', 'kPa')).toBe(100);
    expect(convertPressure(1, 'bar', 'psi')).toBe(14.5);
    expect(convertPressure(0.5, 'MPa', 'bar')).toBe(5);
    expect(convertPressure(145.038, 'psi', 'bar')).toBe(10);
  });

  it('changes only readings declared as temperature or pressure', () => {
    const change = (value: string, type?: string) =>
      convertChecklistValueOnUnitChange(value, type, 'C', 'F', 'bar', 'psi');
    expect(change('100', 'temperature')).toBe('212');
    expect(change('2', 'pressure')).toBe('29.01');
    // "gas_pressure" is a plain number with its own fixed unit: its name must not make it convert
    expect(change('20', 'number')).toBe('20');
    expect(change('OK', 'temperature')).toBe('OK');
    expect(change('5', undefined)).toBe('5');
  });
});

describe('chiller rows', () => {
  it('builds rows for the compressors and circuits the machine has, 4 at most', () => {
    const keys = (c: number, r: number) => buildChillerChecklist(c, r).map((f) => f.key);
    expect(keys(1, 1)).toContain('compressor_1_amps');
    expect(keys(1, 1)).not.toContain('compressor_2_amps');
    expect(keys(2, 3).filter((k) => k.endsWith('_amps'))).toHaveLength(2);
    expect(keys(9, 9).filter((k) => k.endsWith('_amps'))).toHaveLength(4);
  });

  it('shows the voltage rows that match the phase', () => {
    expect(getVisibleCompressorFields(0, 'Single Phase (1Ph)')).toEqual([
      'compressor_1_amps', 'compressor_1_voltage_type', 'compressor_1_voltage_1ph',
    ]);
    expect(getVisibleCompressorFields(1, 'Three Phase (3Ph)')).toEqual([
      'compressor_2_amps', 'compressor_2_voltage_type',
      'compressor_2_voltage_l1l2', 'compressor_2_voltage_l1l3', 'compressor_2_voltage_l2l3',
    ]);
    // nothing chosen yet: single phase is shown
    expect(getVisibleCompressorFields(0, '')).toContain('compressor_1_voltage_1ph');
  });

  it('keeps only the rows of the compressors and circuits the report says it has', () => {
    const items = buildChillerChecklist(4, 4).map((f) => ({ field_key: f.key, value: '' }));
    const set = (key: string, value: string) => (items.find((i) => i.field_key === key)!.value = value);
    set('compressor_count', '2');
    set('circuit_count', '1');
    set('compressor_2_voltage_type', 'Three Phase (3Ph)');
    const keys = visibleChecklistItems('chiller', items).map((i) => i.field_key);
    expect(keys).toContain('oil_pressure');
    expect(keys).toContain('compressor_1_voltage_1ph');
    expect(keys).toContain('compressor_2_voltage_l1l2');
    expect(keys).not.toContain('compressor_2_voltage_1ph');
    expect(keys).not.toContain('compressor_3_amps');
    expect(keys).not.toContain('circuit_2_suction_pressure');
    // other machine types show every row
    expect(visibleChecklistItems('split', items)).toHaveLength(items.length);
  });

  it('gives reports made 2 seconds apart different numbers', () => {
    expect(reportNumber('1794671997351-abc')).not.toBe(reportNumber('1794671999351-abc'));
  });
});

describe('default templates', () => {
  it('has a checklist with no repeated row for every equipment type except Custom', () => {
    MACHINE_TYPES.filter((t) => t.id !== 'custom').forEach((t) => {
      const keys = CHECKLIST_TEMPLATES[t.id as keyof typeof CHECKLIST_TEMPLATES].map((f) => f.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});

describe('compressor, circuit and fan rows', () => {
  const keys = (type: Parameters<typeof buildChecklist>[0], values: Record<string, string>) =>
    buildChecklist(type, unitConfigFromValues(type, values)).map((f) => f.key);

  it('gives every compressor and fan one amps row per phase on a three-phase unit', () => {
    const rtu = keys('rtu', {
      unit_phase: 'Three Phase (3Ph)', compressor_count: '2', circuit_count: '2',
      supply_fan_count: '2', extract_fan_count: '1', return_fan_count: '0',
    });
    expect(rtu).toEqual(expect.arrayContaining([
      'compressor_2_amps_l1', 'compressor_2_amps_l3', 'circuit_2_discharge_pressure',
      'supply_fan_2_amps_l2', 'extract_fan_1_amps_l1', 'condenser_fan_amps_l3',
    ]));
    expect(rtu).not.toContain('compressor_1_amps');
    expect(rtu).not.toContain('compressor_3_amps_l1');
    expect(rtu).not.toContain('return_fan_1_amps_l1');
    // three phase: three phase-to-phase voltages and one to neutral
    expect(rtu.filter((k) => k.startsWith('voltage'))).toEqual(['voltage_l1l2', 'voltage_l1l3', 'voltage_l2l3', 'voltage_ln']);
    // only chillers record the circuit temperatures
    expect(rtu).not.toContain('circuit_1_suction_temp');
  });

  it('gives one amps row each on a single-phase unit', () => {
    const split = keys('split', { unit_phase: 'Single Phase (1Ph)' });
    expect(split).toContain('compressor_1_amps');
    expect(split).not.toContain('compressor_1_amps_l1');
    expect(split).not.toContain('supply_fan_count');
    expect(split.filter((k) => k.startsWith('voltage'))).toEqual(['voltage']);
    const dehumidifier = keys('dehumidifier', { extract_fan_count: '2' });
    expect(dehumidifier).toContain('extract_fan_2_amps_l1');
    // the phase choice comes first, with the four voltages right under it
    expect(dehumidifier.slice(0, 5)).toEqual(['unit_phase', 'voltage_l1l2', 'voltage_l1l3', 'voltage_l2l3', 'voltage_ln']);
  });

  it('stops at 5 compressors, 3 circuits and 5 fans of a kind', () => {
    const ahu = keys('ahu', { supply_fan_count: '9', return_fan_count: '5' });
    expect(ahu.filter((k) => /^supply_fan_\d_amps_l1$/.test(k))).toHaveLength(5);
    expect(ahu.filter((k) => /^return_fan_\d_amps_l1$/.test(k))).toHaveLength(5);
    expect(ahu).not.toContain('compressor_count');
    const chiller = keys('chiller', { compressor_count: '9', circuit_count: '9' });
    expect(chiller.filter((k) => /^compressor_\d_amps_l1$/.test(k))).toHaveLength(5);
    expect(chiller.filter((k) => /^circuit_\d_suction_temp$/.test(k))).toHaveLength(3);
    expect(chiller).toContain('compressor_5_voltage_l1l2');
    expect(chiller).toContain('compressor_5_voltage_ln');
    expect(chiller).not.toContain('compressor_1_voltage_type');
  });

  it('never repeats a row, and knows the type of rows from older reports', () => {
    const all = keys('rtu', { compressor_count: '5', circuit_count: '3', supply_fan_count: '5', extract_fan_count: '5', return_fan_count: '5' });
    expect(new Set(all).size).toBe(all.length);
    const type = (key: string) => getFieldDefinitions('rtu').find((d) => d.key === key)?.type;
    expect(type('circuit_3_suction_pressure')).toBe('pressure');
    expect(type('suction_pressure')).toBe('pressure');
  });
});
