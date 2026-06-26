import { MachineType } from '@/types';

export interface MachineTypeInfo {
  id: MachineType;
  labelEn: string;
  labelAr: string;
  reportTitle: (maintenanceType: string) => string;
}

export const MACHINE_TYPES: MachineTypeInfo[] = [
  {
    id: 'ahu',
    labelEn: 'AHU (Air Handling Unit)',
    labelAr: 'وحدة معالجة الهواء',
    reportTitle: (m) => `AHU ${m} Report`,
  },
  {
    id: 'chiller',
    labelEn: 'Chiller',
    labelAr: 'المبرد',
    reportTitle: (m) => `Chiller ${m} Report`,
  },
  {
    id: 'fcu',
    labelEn: 'FCU (Fan Coil Unit)',
    labelAr: 'وحدة ملف المروحة',
    reportTitle: (m) => `FCU ${m} Report`,
  },
  {
    id: 'split',
    labelEn: 'Split Unit',
    labelAr: 'وحدة سبليت',
    reportTitle: (m) => `Split Unit ${m} Report`,
  },
  {
    id: 'vrf',
    labelEn: 'VRF System',
    labelAr: 'نظام VRF',
    reportTitle: (m) => `VRF ${m} Report`,
  },
  {
    id: 'cooling_tower',
    labelEn: 'Cooling Tower',
    labelAr: 'برج التبريد',
    reportTitle: (m) => `Cooling Tower ${m} Report`,
  },
  {
    id: 'boiler',
    labelEn: 'Boiler',
    labelAr: 'الغلاية',
    reportTitle: (m) => `Boiler ${m} Report`,
  },
  {
    id: 'custom',
    labelEn: 'Custom',
    labelAr: 'مخصص',
    reportTitle: (m) => `Custom ${m} Report`,
  },
];

export function getMachineTypeInfo(type: MachineType): MachineTypeInfo {
  return MACHINE_TYPES.find((m) => m.id === type) ?? MACHINE_TYPES[0];
}
