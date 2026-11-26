export const COMPANY = {
  nameEn: 'Aladdin Sweiti Engineering Est.',
  nameAr: 'مؤسسة علاء الدين السويطي الهندسية',
  footerEn:
    'Jordan- Amman- Princess Tharwat st.- 75 Joanna Center- Office 102\nTel +(962) (6) 585 5959   Fax +(962) (6) 581 4455\nE-mail  info@asee-eng.com   www.asee-eng.com',
  footerAr:
    'الأردن- عمان- شارع الأميرة ثروت- 75 مجمع جوانا- مكتب 102\nتلفون 0909 585 (6) (962)+ فاكس 4455 581 (6) (962) +\nبريد إلكتروني info@asee-eng.com   www.asee-eng.com',
};

export const MAINTENANCE_TYPES = [
  'Startup',
  'Preventive',
  'Corrective',
  'Emergency',
  'Commissioning',
] as const;

// The saved value stays English: the website reads it.
const MAINTENANCE_AR: Record<string, string> = {
  Startup: 'تشغيل أولي',
  Preventive: 'صيانة وقائية',
  Corrective: 'صيانة تصحيحية',
  Emergency: 'صيانة طارئة',
  Commissioning: 'تشغيل وتسليم',
};

export const maintenanceAr = (type: string): string => MAINTENANCE_AR[type] ?? '';

/** "صيانة وقائية / Preventive" for the screens. */
export const maintenanceLabel = (type: string): string =>
  MAINTENANCE_AR[type] ? `${MAINTENANCE_AR[type]} / ${type}` : type;

export const REFRIGERANT_TYPES = [
  'R410A',
  'R32',
  'R134a',
  'R22',
  'R407C',
  'R404A',
  'Other',
];
