import { ChecklistFieldDef, MachineType } from '@/types';
import { buildChillerChecklist } from '@/utils/chillerFields';
import { REFRIGERANT_TYPES } from './company';

const OK_NOT_OK = ['OK', 'Not OK'];
const OK_NOT_OK_NA = ['OK', 'Not OK', 'Not Available'];
const OK_REPLACED_DIRTY = ['OK', 'Replaced', 'Dirty'];
const OK_BLOCKED = ['OK', 'Blocked'];
const OK_NA = ['OK', 'Not Available'];
const OK_NOT_OK_COIL = ['OK', 'Not OK'];
const FAN_SPEED = ['Low', 'Med', 'High'];
const OK_REPLACED = ['OK', 'Replaced'];
const OK_LOW = ['OK', 'Low'];
const OK_FAULT = ['OK', 'Fault'];

export const CHECKLIST_TEMPLATES: Record<Exclude<MachineType, 'custom'>, ChecklistFieldDef[]> = {
  ahu: [
    {
      key: 'voltage',
      labelEn: '3-Phase Voltage (V)',
      labelAr: 'الفولتيه',
      type: 'voltage',
      placeholder: 'P1-P2: ___ P1-P3: ___ P2-P3: ___ / P1-E: ___ P2-E: ___ P3-E: ___',
    },
    {
      key: 'phase_rotation',
      labelEn: 'Phase Rotation',
      labelAr: 'اتجاه الفازات',
      type: 'dropdown',
      options: OK_NOT_OK,
    },
    {
      key: 'electrical_panel',
      labelEn: "Electrical Panel Status",
      labelAr: 'لوحة الكهرباء',
      type: 'dropdown',
      options: OK_NOT_OK,
    },
    {
      key: 'strainer',
      labelEn: "Strainer's Status",
      labelAr: 'السترينر',
      type: 'dropdown',
      options: OK_NOT_OK_NA,
    },
    {
      key: 'water_in_temp',
      labelEn: 'Water In Temperature',
      labelAr: 'حرارة الماء الداخل',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'water_out_temp',
      labelEn: 'Water Out Temperature',
      labelAr: 'حرارة الماء الخارج',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'air_supply_temp',
      labelEn: 'Air Temp Supply',
      labelAr: 'حرارة الهواء الداخل',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'air_return_temp',
      labelEn: 'Air Temp Return',
      labelAr: 'حرارة الهواء الراجع',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'filter',
      labelEn: 'Filter Status',
      labelAr: 'الفالتر',
      type: 'dropdown',
      options: OK_REPLACED_DIRTY,
    },
    {
      key: 'airflow',
      labelEn: 'Airflow Supply/Return',
      labelAr: 'تدفق الهواء',
      type: 'text',
      unit: 'm³/h',
      placeholder: '___ m³/h',
    },
    {
      key: 'drain',
      labelEn: 'Drain',
      labelAr: 'الدرين',
      type: 'dropdown',
      options: OK_BLOCKED,
    },
    {
      key: 'heaters',
      labelEn: 'Heaters',
      labelAr: 'الهياتر اذا وجدت',
      type: 'dropdown',
      options: OK_NA,
    },
    {
      key: 'coil',
      labelEn: 'Coil',
      labelAr: 'كويل الماء',
      type: 'dropdown',
      options: OK_NOT_OK_COIL,
    },
  ],
  chiller: buildChillerChecklist(1, 1),
  fcu: [
    {
      key: 'voltage',
      labelEn: 'Voltage',
      labelAr: 'الفولتيه',
      type: 'voltage',
    },
    {
      key: 'supply_air_temp',
      labelEn: 'Supply Air Temp',
      labelAr: 'حرارة الهواء المزود',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'return_air_temp',
      labelEn: 'Return Air Temp',
      labelAr: 'حرارة الهواء الراجع',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'compressor_amps',
      labelEn: 'Compressor Amps',
      labelAr: 'أمبير الضاغط',
      type: 'number',
      unit: 'A',
    },
    {
      key: 'fan_speed',
      labelEn: 'Fan Speed',
      labelAr: 'سرعة المروحة',
      type: 'dropdown',
      options: FAN_SPEED,
    },
    {
      key: 'refrigerant',
      labelEn: 'Refrigerant Type',
      labelAr: 'نوع الفريون',
      type: 'dropdown',
      options: REFRIGERANT_TYPES,
    },
    {
      key: 'filter',
      labelEn: 'Filter Status',
      labelAr: 'الفالتر',
      type: 'dropdown',
      options: OK_REPLACED,
    },
    {
      key: 'drain',
      labelEn: 'Drain',
      labelAr: 'الدرين',
      type: 'dropdown',
      options: OK_BLOCKED,
    },
  ],
  split: [
    {
      key: 'voltage',
      labelEn: 'Voltage',
      labelAr: 'الفولتيه',
      type: 'voltage',
    },
    {
      key: 'supply_air_temp',
      labelEn: 'Supply Air Temp',
      labelAr: 'حرارة الهواء المزود',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'return_air_temp',
      labelEn: 'Return Air Temp',
      labelAr: 'حرارة الهواء الراجع',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'compressor_amps',
      labelEn: 'Compressor Amps',
      labelAr: 'أمبير الضاغط',
      type: 'number',
      unit: 'A',
    },
    {
      key: 'fan_speed',
      labelEn: 'Fan Speed',
      labelAr: 'سرعة المروحة',
      type: 'dropdown',
      options: FAN_SPEED,
    },
    {
      key: 'refrigerant',
      labelEn: 'Refrigerant Type',
      labelAr: 'نوع الفريون',
      type: 'dropdown',
      options: REFRIGERANT_TYPES,
    },
    {
      key: 'filter',
      labelEn: 'Filter Status',
      labelAr: 'الفالتر',
      type: 'dropdown',
      options: OK_REPLACED,
    },
    {
      key: 'drain',
      labelEn: 'Drain',
      labelAr: 'الدرين',
      type: 'dropdown',
      options: OK_BLOCKED,
    },
  ],
  cooling_tower: [
    {
      key: 'water_in_temp',
      labelEn: 'Water In Temp',
      labelAr: 'حرارة الماء الداخل',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'water_out_temp',
      labelEn: 'Water Out Temp',
      labelAr: 'حرارة الماء الخارج',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'fan_amps',
      labelEn: 'Fan Amps',
      labelAr: 'أمبير المروحة',
      type: 'number',
      unit: 'A',
    },
    {
      key: 'basin_level',
      labelEn: 'Basin Water Level',
      labelAr: 'مستوى الماء',
      type: 'dropdown',
      options: OK_LOW,
    },
    {
      key: 'tds',
      labelEn: 'TDS',
      labelAr: 'TDS',
      type: 'number',
      unit: 'ppm',
    },
    {
      key: 'ph',
      labelEn: 'pH',
      labelAr: 'pH',
      type: 'text',
    },
    {
      key: 'conductivity',
      labelEn: 'Conductivity',
      labelAr: 'الناقلية',
      type: 'number',
      unit: 'µS/cm',
    },
  ],
  boiler: [
    {
      key: 'flow_temp',
      labelEn: 'Flow Temp',
      labelAr: 'حرارة الذهاب',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'return_temp',
      labelEn: 'Return Temp',
      labelAr: 'حرارة الرجوع',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'gas_pressure',
      labelEn: 'Gas Pressure',
      labelAr: 'ضغط الغاز',
      type: 'number',
      unit: 'mbar',
    },
    {
      key: 'flue_gas_temp',
      labelEn: 'Flue Gas Temp',
      labelAr: 'حرارة غازات العادم',
      type: 'temperature',
      unit: '°C',
    },
    {
      key: 'burner_amps',
      labelEn: 'Burner Amps',
      labelAr: 'أمبير الموقد',
      type: 'number',
      unit: 'A',
    },
    {
      key: 'co_level',
      labelEn: 'CO Level',
      labelAr: 'CO Level',
      type: 'number',
      unit: 'ppm',
    },
    {
      key: 'co2_level',
      labelEn: 'CO2 Level',
      labelAr: 'CO2 Level',
      type: 'number',
      unit: '%',
    },
  ],
  vrf: [
    {
      key: 'outdoor_amps',
      labelEn: 'Outdoor Unit Amps',
      labelAr: 'أمبير الوحدة الخارجية',
      type: 'number',
      unit: 'A',
    },
    {
      key: 'high_pressure',
      labelEn: 'High Pressure',
      labelAr: 'الضغط العالي',
      type: 'number',
      unit: 'bar',
    },
    {
      key: 'low_pressure',
      labelEn: 'Low Pressure',
      labelAr: 'الضغط المنخفض',
      type: 'number',
      unit: 'bar',
    },
    {
      key: 'refrigerant',
      labelEn: 'Refrigerant Type',
      labelAr: 'نوع الفريون',
      type: 'dropdown',
      options: REFRIGERANT_TYPES,
    },
    {
      key: 'indoor_count',
      labelEn: 'Indoor Unit Count',
      labelAr: 'عدد الوحدات الداخلية',
      type: 'number',
    },
    {
      key: 'indoor_status',
      labelEn: 'Indoor Unit Status',
      labelAr: 'حالة الوحدات الداخلية',
      type: 'dropdown',
      options: OK_FAULT,
    },
  ],
};

export function getChecklistTemplate(type: MachineType): ChecklistFieldDef[] {
  if (type === 'custom') return [];
  return CHECKLIST_TEMPLATES[type] ?? [];
}

export const DEFAULT_ATTENTION_ROWS = 1;

export const FORM_STEPS = [
  { step: 1, title: 'Report Info', titleAr: 'معلومات التقرير' },
  { step: 2, title: 'Machine Data', titleAr: 'بيانات المكينة' },
  { step: 3, title: 'Checklist & Readings', titleAr: 'قائمة الفحص والقراءات' },
  { step: 4, title: 'Work Performed', titleAr: 'الصيانة المطلوبة / العمل المنفذ' },
  { step: 5, title: 'Attention Needed', titleAr: 'بحاجة إلى انتباه' },
  { step: 6, title: 'Materials Used', titleAr: 'المواد المستخدمة' },
  { step: 7, title: 'Notes', titleAr: 'الملاحظات' },
  { step: 8, title: 'Photos', titleAr: 'صور الموقع' },
  { step: 9, title: 'Signatures', titleAr: 'التوقيعات' },
] as const;

export const TOTAL_STEPS = 9;
