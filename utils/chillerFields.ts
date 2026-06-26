import { ChecklistFieldDef } from '@/types';

const REFRIGERANT_OPTIONS = [
  'R-22',
  'R-134a',
  'R-410A',
  'R-407C',
  'R-32',
  'R-404A',
  'Other',
];

export function getChillerBaseFields(): ChecklistFieldDef[] {
  return [
    {
      key: 'refrigerant_type',
      labelEn: 'Refrigerant Type',
      labelAr: 'نوع الفريون',
      type: 'dropdown',
      options: REFRIGERANT_OPTIONS,
      section: 'refrigerant',
    },
    {
      key: 'compressor_count',
      labelEn: 'Number of Compressors',
      labelAr: 'عدد الضواغط',
      type: 'count',
      options: ['1', '2', '3', '4'],
      section: 'config',
    },
    {
      key: 'circuit_count',
      labelEn: 'Number of Circuits/Cycles',
      labelAr: 'عدد الدوائر',
      type: 'count',
      options: ['1', '2', '3', '4'],
      section: 'config',
    },
    {
      key: 'phase_rotation',
      labelEn: 'Phase Rotation',
      labelAr: 'اتجاه الفازات',
      type: 'dropdown',
      options: ['OK', 'Not OK'],
    },
    {
      key: 'evap_water_in',
      labelEn: 'Evap. Water Temp In',
      labelAr: 'حرارة ماء المبخر دخول',
      type: 'temperature',
    },
    {
      key: 'evap_water_out',
      labelEn: 'Evap. Water Temp Out',
      labelAr: 'حرارة ماء المبخر خروج',
      type: 'temperature',
    },
    {
      key: 'cond_water_in',
      labelEn: 'Cond. Water Temp In',
      labelAr: 'حرارة ماء الكوندنسر دخول',
      type: 'temperature',
    },
    {
      key: 'cond_water_out',
      labelEn: 'Cond. Water Temp Out',
      labelAr: 'حرارة ماء الكوندنسر خروج',
      type: 'temperature',
    },
    {
      key: 'oil_pressure',
      labelEn: 'Oil Pressure',
      labelAr: 'ضغط الزيت',
      type: 'pressure',
    },
    {
      key: 'electrical_panel',
      labelEn: 'Electrical Panel',
      labelAr: 'لوحة الكهرباء',
      type: 'dropdown',
      options: ['OK', 'Not OK'],
    },
  ];
}

export function getCompressorFields(index: number): ChecklistFieldDef[] {
  const n = index + 1;
  return [
    {
      key: `compressor_${n}_amps`,
      labelEn: `Compressor ${n} Amps`,
      labelAr: `أمبير الضاغط ${n}`,
      type: 'number',
      unit: 'A',
      section: `compressor_${n}`,
    },
    {
      key: `compressor_${n}_voltage_type`,
      labelEn: `Compressor ${n} Voltage Type`,
      labelAr: `فولتيه الضاغط ${n}`,
      type: 'dropdown',
      options: ['Single Phase (1Ph)', 'Three Phase (3Ph)'],
      section: `compressor_${n}`,
    },
    {
      key: `compressor_${n}_voltage_1ph`,
      labelEn: `Compressor ${n} Voltage (1Ph)`,
      labelAr: `فولتيه الضاغط ${n} (أحادي)`,
      type: 'number',
      unit: 'V',
      section: `compressor_${n}`,
    },
    {
      key: `compressor_${n}_voltage_l1l2`,
      labelEn: `Compressor ${n} L1-L2`,
      labelAr: `الضاغط ${n} L1-L2`,
      type: 'number',
      unit: 'V',
      section: `compressor_${n}`,
    },
    {
      key: `compressor_${n}_voltage_l1l3`,
      labelEn: `Compressor ${n} L1-L3`,
      labelAr: `الضاغط ${n} L1-L3`,
      type: 'number',
      unit: 'V',
      section: `compressor_${n}`,
    },
    {
      key: `compressor_${n}_voltage_l2l3`,
      labelEn: `Compressor ${n} L2-L3`,
      labelAr: `الضاغط ${n} L2-L3`,
      type: 'number',
      unit: 'V',
      section: `compressor_${n}`,
    },
  ];
}

export function getCircuitFields(index: number): ChecklistFieldDef[] {
  const n = index + 1;
  return [
    {
      key: `circuit_${n}_suction_pressure`,
      labelEn: `Circuit ${n} Suction Pressure`,
      labelAr: `ضغط السحب - دائرة ${n}`,
      type: 'pressure',
      section: `circuit_${n}`,
    },
    {
      key: `circuit_${n}_discharge_pressure`,
      labelEn: `Circuit ${n} Discharge Pressure`,
      labelAr: `ضغط الضخ - دائرة ${n}`,
      type: 'pressure',
      section: `circuit_${n}`,
    },
    {
      key: `circuit_${n}_suction_temp`,
      labelEn: `Circuit ${n} Suction Temp`,
      labelAr: `درجة حرارة السحب - دائرة ${n}`,
      type: 'temperature',
      section: `circuit_${n}`,
    },
    {
      key: `circuit_${n}_discharge_temp`,
      labelEn: `Circuit ${n} Discharge Temp`,
      labelAr: `درجة حرارة الضخ - دائرة ${n}`,
      type: 'temperature',
      section: `circuit_${n}`,
    },
  ];
}

export function buildChillerChecklist(
  compressorCount: number,
  circuitCount: number,
): ChecklistFieldDef[] {
  const fields: ChecklistFieldDef[] = [];
  const base = getChillerBaseFields();

  for (const f of base) {
    if (f.key === 'compressor_count') {
      fields.push({ ...f, placeholder: String(compressorCount) });
    } else if (f.key === 'circuit_count') {
      fields.push({ ...f, placeholder: String(circuitCount) });
    } else {
      fields.push(f);
    }
  }

  for (let i = 0; i < Math.min(compressorCount, 4); i++) {
    fields.push(...getCompressorFields(i));
  }

  for (let i = 0; i < Math.min(circuitCount, 4); i++) {
    fields.push(...getCircuitFields(i));
  }

  return fields;
}

export function isChillerDynamicKey(key: string): boolean {
  return (
    key.startsWith('compressor_') ||
    key.startsWith('circuit_') ||
    key === 'compressor_count' ||
    key === 'circuit_count' ||
    key === 'refrigerant_type'
  );
}

export function getVisibleCompressorFields(
  index: number,
  voltageType: string,
): string[] {
  const n = index + 1;
  const keys = [`compressor_${n}_amps`, `compressor_${n}_voltage_type`];
  if (voltageType.includes('1Ph')) {
    keys.push(`compressor_${n}_voltage_1ph`);
  } else if (voltageType.includes('3Ph')) {
    keys.push(
      `compressor_${n}_voltage_l1l2`,
      `compressor_${n}_voltage_l1l3`,
      `compressor_${n}_voltage_l2l3`,
    );
  } else {
    keys.push(`compressor_${n}_voltage_1ph`);
  }
  return keys;
}

export { REFRIGERANT_OPTIONS };
