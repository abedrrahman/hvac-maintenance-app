import { getFieldDefinitions } from '@/constants/checklists';
import { COMPANY } from '@/constants/company';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { ChecklistFieldDef, ChecklistItem, FullReport } from '@/types';
import { visibleChecklistItems } from '@/utils/chillerFields';
import { hasValue, reportNumber } from '@/utils/helpers';
import { pressureUnitLabel, tempUnitLabel } from '@/utils/units';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';

// Same colours as the app and the ASEE website.
const BRAND = '#D1003C';
const TINT = '#FDECF1';
const INK = '#16181D';
const MUTED = '#636874';
const LINE = '#DADAE1';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

/** A picture on the phone as text the PDF can hold. Empty when the file is gone, so one lost photo does not stop the report. */
async function imageData(uri: string | null): Promise<string> {
  if (!uri) return '';
  try {
    const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${await new File(uri).base64()}`;
  } catch {
    return '';
  }
}

/** A logo shipped inside the app. */
async function bundledLogo(module: number): Promise<string> {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    return await imageData(asset.localUri);
  } catch {
    return '';
  }
}

function styles(): string {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: ${INK}; }
    .ar { direction: rtl; unicode-bidi: isolate; }

    /* The outer table only repeats an empty top and bottom band on every printed page, so text never runs under the footer. */
    table.frame { width: 100%; border-collapse: collapse; }
    .top-space { height: 11mm; }
    .bottom-space { height: 24mm; }
    .content { padding: 0 12mm; }

    .footer {
      position: fixed; bottom: 0; left: 0; right: 0; height: 19mm;
      padding: 3mm 12mm 0; border-top: 2px solid ${BRAND}; background: #fff;
      display: flex; justify-content: space-between; gap: 8mm;
      font-size: 7.5px; line-height: 1.4; color: ${MUTED};
    }
    .footer .ar { text-align: right; }

    .head { display: flex; justify-content: space-between; align-items: center; }
    .head img.company { height: 52px; }
    .head img.brand { max-height: 52px; max-width: 150px; object-fit: contain; }
    .title {
      margin: 9px 0 12px; padding: 9px 12px; background: ${BRAND}; color: #fff; border-radius: 6px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .title .name { font-size: 16px; font-weight: bold; }
    .title .no { font-size: 10px; opacity: 0.9; }

    h2 {
      margin: 14px 0 6px; padding: 5px 9px; font-size: 11.5px; background: ${TINT}; color: ${BRAND};
      border-left: 4px solid ${BRAND}; border-radius: 3px;
      display: flex; justify-content: space-between; page-break-after: avoid;
    }

    table.grid { width: 100%; border-collapse: collapse; }
    table.grid td, table.grid th { border: 1px solid ${LINE}; padding: 5px 8px; vertical-align: middle; }
    table.grid th { background: #F5F5F7; font-size: 9.5px; color: ${MUTED}; text-align: left; }
    table.grid tr, .block { page-break-inside: avoid; }
    td.k { width: 22%; background: #F5F5F7; font-size: 9.5px; color: ${MUTED}; }
    td.k .ar { float: right; }
    td.v { width: 28%; font-weight: bold; }
    table.list td.en { width: 37%; }
    table.list td.val { width: 26%; text-align: center; font-weight: bold; }
    table.list td.arl { width: 37%; text-align: right; }
    table.list tr:nth-child(even) td { background: #FAFAFB; }
    table.list tr.sec td { background: ${TINT}; color: ${BRAND}; font-weight: bold; text-align: center; }
    .empty { color: #B4B7BF; font-weight: normal; }

    .text { border: 1px solid ${LINE}; border-radius: 4px; padding: 8px 10px; min-height: 36px; line-height: 1.5; }

    .photos { display: flex; flex-wrap: wrap; gap: 8px; }
    .photo { width: calc(50% - 4px); page-break-inside: avoid; text-align: center; }
    .photo img { width: 100%; max-height: 230px; object-fit: contain; border: 1px solid ${LINE}; border-radius: 4px; }
    .photo div { font-size: 9.5px; color: ${MUTED}; margin-top: 3px; }

    .signs { display: flex; gap: 12px; margin-top: 16px; page-break-inside: avoid; }
    .sign { flex: 1; border: 1px solid ${LINE}; border-radius: 6px; overflow: hidden; text-align: center; }
    .sign .cap { background: #F5F5F7; padding: 5px 8px; font-size: 9.5px; color: ${MUTED}; display: flex; justify-content: space-between; }
    .sign .pad { height: 92px; display: flex; align-items: center; justify-content: center; }
    .sign img { max-height: 86px; max-width: 90%; }
    .sign .who { border-top: 1px solid ${LINE}; padding: 5px 8px; font-weight: bold; }
    .sign .when { font-weight: normal; color: ${MUTED}; font-size: 9.5px; }
  `;
}

function heading(en: string, ar: string): string {
  return `<h2><span>${en}</span><span class="ar">${ar}</span></h2>`;
}

/** A short section that must not be cut across two pages (a title alone at the bottom of a page). */
function block(en: string, ar: string, body: string): string {
  return `<div class="block">${heading(en, ar)}${body}</div>`;
}

function shown(value: string): string {
  return hasValue(value) ? escapeHtml(value) : '<span class="empty">—</span>';
}

/** One "label | value" pair of the details grid. */
function pair(en: string, ar: string, value: string, span = 1): string {
  return `<td class="k">${en}<span class="ar">${ar}</span></td><td class="v" colspan="${span}">${shown(value)}</td>`;
}

function checklistValue(item: ChecklistItem, def: ChecklistFieldDef | undefined, report: FullReport): string {
  if (!hasValue(item.value)) return '';
  let unit = '';
  if (def?.type === 'temperature') unit = tempUnitLabel(report.temp_unit);
  else if (def?.type === 'pressure') unit = pressureUnitLabel(report.pressure_unit);
  else if (def?.unit) unit = def.unit;
  return unit ? `${item.value} ${unit}` : item.value;
}

function checklistRows(report: FullReport): string {
  const defs = getFieldDefinitions(report.type);
  let lastSection = '';
  return visibleChecklistItems(report.type, report.checklist_items)
    .map((item) => {
      const def = defs.find((d) => d.key === item.field_key);
      let band = '';
      const section = def?.section ?? '';
      if (section && section !== lastSection) {
        lastSection = section;
        const comp = section.match(/^compressor_(\d+)$/);
        const circ = section.match(/^circuit_(\d+)$/);
        const label = comp ? `Compressor ${comp[1]} — ضاغط ${comp[1]}` : circ ? `Circuit ${circ[1]} — دائرة ${circ[1]}` : '';
        if (label) band = `<tr class="sec"><td colspan="3">${label}</td></tr>`;
      }
      return `${band}<tr>
        <td class="en">${escapeHtml(item.label_en)}</td>
        <td class="val">${shown(checklistValue(item, def, report))}</td>
        <td class="arl ar">${escapeHtml(item.label_ar)}</td>
      </tr>`;
    })
    .join('');
}

function signature(en: string, ar: string, image: string | undefined, name: string, date: string): string {
  return `<div class="sign">
    <div class="cap"><span>${en}</span><span class="ar">${ar}</span></div>
    <div class="pad">${image ? `<img src="${image}"/>` : ''}</div>
    <div class="who">${shown(name)}<div class="when">${escapeHtml(date)}</div></div>
  </div>`;
}

export async function generateReportHtml(report: FullReport): Promise<string> {
  const machine = getMachineTypeInfo(report.type);
  const [company, brand, photos] = await Promise.all([
    bundledLogo(require('@/assets/images/main_screen_icon.png')),
    // Top left: the logo chosen for this report, or CIAT's when none was chosen.
    report.logo_uri ? imageData(report.logo_uri) : bundledLogo(require('@/assets/images/ciat-logo.png')),
    Promise.all(report.photos.map(async (p) => ({ src: await imageData(p.uri), caption: p.caption }))),
  ]);

  const attention = report.attention_notes.filter((n) => hasValue(n.note) || hasValue(n.unit_no));
  const materials = report.materials.filter((m) => hasValue(m.description) || hasValue(m.qty));
  const shownPhotos = photos.filter((p) => p.src);
  const tech = report.signatures.find((s) => s.type === 'technician');
  const client = report.signatures.find((s) => s.type === 'client');
  const none = '<div class="text"><span class="empty">None — لا يوجد</span></div>';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><style>${styles()}</style></head>
<body>
  <div class="footer">
    <div>${escapeHtml(COMPANY.footerEn)}</div>
    <div class="ar">${escapeHtml(COMPANY.footerAr)}</div>
  </div>
  <table class="frame">
    <thead><tr><td class="top-space"></td></tr></thead>
    <tfoot><tr><td class="bottom-space"></td></tr></tfoot>
    <tbody><tr><td class="content">

      <div class="head">
        ${brand ? `<img class="brand" src="${brand}"/>` : '<span></span>'}
        ${company ? `<img class="company" src="${company}"/>` : `<b>${escapeHtml(COMPANY.nameEn)}</b>`}
      </div>
      <div class="title">
        <span class="name">${escapeHtml(machine.reportTitle(report.maintenance_type))}</span>
        <span class="no">Report No. ${escapeHtml(reportNumber(report.id))}</span>
      </div>

      <table class="grid">
        <tr>${pair('Client', 'العميل', report.client)}${pair('Date', 'التاريخ', report.date)}</tr>
        <tr>${pair('Site', 'الموقع', report.site)}${pair('Maintenance', 'نوع الصيانة', report.maintenance_type)}</tr>
        <tr>${pair('Technician', 'الفني', report.technician)}${pair('Equipment', 'المعدة', machine.labelEn)}</tr>
        <tr>${pair('Model', 'الموديل', report.machine_model)}${pair('Serial No.', 'الرقم التسلسلي', report.serial_no)}</tr>
      </table>

      ${heading('Checklist &amp; Readings', 'قائمة الفحص والقراءات')}
      <table class="grid list">${checklistRows(report)}</table>

      ${block('Required Maintenance', 'الصيانة المطلوبة', `<div class="text">${shown(report.required_maintenance)}</div>`)}

      ${block(
        'Needs Attention',
        'بحاجة إلى انتباه',
        attention.length === 0
          ? none
          : `<table class="grid">
              <tr><th style="width:18%">Unit</th><th>Note</th></tr>
              ${attention.map((n, i) => `<tr><td>${escapeHtml(n.unit_no || String(i + 1))}</td><td>${shown(n.note)}</td></tr>`).join('')}
            </table>`,
      )}

      ${block(
        'Materials Used',
        'المواد المستخدمة',
        materials.length === 0
          ? none
          : `<table class="grid">
              <tr><th>Description</th><th style="width:14%">Qty</th><th style="width:14%">Unit</th></tr>
              ${materials.map((m) => `<tr><td>${shown(m.description)}</td><td>${shown(m.qty)}</td><td>${escapeHtml(m.unit || '')}</td></tr>`).join('')}
            </table>`,
      )}

      ${block('Notes', 'الملاحظات', `<div class="text">${shown(report.general_notes)}</div>`)}

      ${
        shownPhotos.length === 0
          ? ''
          : `${heading('Site Photos', 'صور الموقع')}
            <div class="photos">
              ${shownPhotos.map((p) => `<div class="photo"><img src="${p.src}"/><div>${escapeHtml(p.caption || '')}</div></div>`).join('')}
            </div>`
      }

      <div class="signs">
        ${signature('Technician Signature', 'توقيع الفني', tech?.image_base64, tech?.signer_name || report.technician, tech?.signed_at || '')}
        ${signature('Customer Signature', 'توقيع العميل', client?.image_base64, client?.signer_name || '', client?.signed_at || '')}
      </div>

    </td></tr></tbody>
  </table>
</body>
</html>`;
}

export async function exportReportPdf(report: FullReport): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: await generateReportHtml(report) });
  return uri;
}

/** Opens the phone's print screen, where the PDF can be saved, printed or shared. */
export async function sharePdf(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}
