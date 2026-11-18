import { getFieldDefinitions } from '@/constants/checklists';
import { COMPANY } from '@/constants/company';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { ChecklistFieldDef, ChecklistItem, FullReport, Signature } from '@/types';
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
    /* the contract PDF: each unit's report, the cover and the signature page start on a new page */
    table.frame.next { break-before: page; page-break-before: always; }
    .statement { margin: 10px 0 4px; line-height: 1.6; }
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

interface Logos {
  company: string;
  ciat: string;
}

async function loadLogos(): Promise<Logos> {
  const [company, ciat] = await Promise.all([
    bundledLogo(require('@/assets/images/main_screen_icon.png')),
    bundledLogo(require('@/assets/images/ciat-logo.png')),
  ]);
  return { company, ciat };
}

/** Top of a page: CIAT (or the logo chosen for the report) on the left, the company logo on the right, then the red title bar. */
function pageHead(logos: Logos, brand: string, title: string, number: string): string {
  const left = brand || logos.ciat;
  return `<div class="head">
        ${left ? `<img class="brand" src="${left}"/>` : '<span></span>'}
        ${logos.company ? `<img class="company" src="${logos.company}"/>` : `<b>${escapeHtml(COMPANY.nameEn)}</b>`}
      </div>
      <div class="title">
        <span class="name">${escapeHtml(title)}</span>
        <span class="no">${escapeHtml(number)}</span>
      </div>`;
}

/** Both signature boxes. */
function signatureBoxes(signatures: Signature[], technicianName: string): string {
  const tech = signatures.find((s) => s.type === 'technician');
  const client = signatures.find((s) => s.type === 'client');
  return `<div class="signs">
        ${signature('Technician Signature', 'توقيع الفني', tech?.image_base64, tech?.signer_name || technicianName, tech?.signed_at || '')}
        ${signature('Customer Signature', 'توقيع العميل', client?.image_base64, client?.signer_name || '', client?.signed_at || '')}
      </div>`;
}

/** One report's pages. In the contract PDF the signatures are left out: they come once, on the last page. */
async function reportSection(report: FullReport, logos: Logos, withSignatures: boolean): Promise<string> {
  const machine = getMachineTypeInfo(report.type);
  const [brand, photos] = await Promise.all([
    imageData(report.logo_uri),
    Promise.all(report.photos.map(async (p) => ({ src: await imageData(p.uri), caption: p.caption }))),
  ]);

  const attention = report.attention_notes.filter((n) => hasValue(n.note) || hasValue(n.unit_no));
  const materials = report.materials.filter((m) => hasValue(m.description) || hasValue(m.qty));
  const shownPhotos = photos.filter((p) => p.src);
  const none = '<div class="text"><span class="empty">None — لا يوجد</span></div>';

  return `
      ${pageHead(logos, brand, machine.reportTitle(report.maintenance_type), `Report No. ${reportNumber(report.id)}`)}

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

      ${withSignatures ? signatureBoxes(report.signatures, report.technician) : ''}`;
}

/** The printed document. Every section is its own frame (header space, footer space), and each after the first starts a new page. */
function documentHtml(sections: string[]): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><style>${styles()}</style></head>
<body>
  <div class="footer">
    <div>${escapeHtml(COMPANY.footerEn)}</div>
    <div class="ar">${escapeHtml(COMPANY.footerAr)}</div>
  </div>
  ${sections
    .map(
      (section, i) => `<table class="frame${i > 0 ? ' next' : ''}">
    <thead><tr><td class="top-space"></td></tr></thead>
    <tfoot><tr><td class="bottom-space"></td></tr></tfoot>
    <tbody><tr><td class="content">${section}
    </td></tr></tbody>
  </table>`,
    )
    .join('\n')}
</body>
</html>`;
}

export async function generateReportHtml(report: FullReport): Promise<string> {
  return documentHtml([await reportSection(report, await loadLogos(), true)]);
}

/** One unit on the contract PDF's cover. The unit's report is left out of the PDF when it has none yet. */
export interface ContractPdfUnit {
  name: string;
  serial: string;
  equipment: string;
  status: 'not_started' | 'draft' | 'ready' | 'signed';
  report: FullReport | null;
}

export interface ContractPdfInfo {
  number: string;
  title: string;
  client: string;
  date: string;
  technician: string;
}

const STATUS_TEXT: Record<ContractPdfUnit['status'], string> = {
  not_started: 'Not started — لم يبدأ',
  draft: 'Draft — مسودة',
  ready: 'Ready — جاهز للتوقيع',
  signed: 'Signed — موقّع',
};

/**
 * The whole contract as one PDF: a cover with the list of units, each unit's report one after another,
 * then one page with the technician's and the client's signatures.
 */
export async function generateContractHtml(info: ContractPdfInfo, units: ContractPdfUnit[]): Promise<string> {
  const logos = await loadLogos();
  const withReport = units.filter((u) => u.report);
  const number = info.number ? `Contract No. ${info.number}` : '';

  const cover = `
      ${pageHead(logos, '', 'Contract Maintenance Report', number)}
      <table class="grid">
        <tr>${pair('Contract', 'العقد', info.number)}${pair('Date', 'التاريخ', info.date)}</tr>
        <tr>${pair('Title', 'العنوان', info.title)}${pair('Units', 'عدد المعدات', String(units.length))}</tr>
        <tr>${pair('Client', 'العميل', info.client)}${pair('Technician', 'الفني', info.technician)}</tr>
      </table>
      ${heading('Units', 'المعدات')}
      <table class="grid">
        <tr><th style="width:6%">#</th><th>Unit</th><th style="width:20%">Equipment</th><th style="width:20%">Serial No.</th><th style="width:22%">Status</th></tr>
        ${units
          .map(
            (u, i) => `<tr><td>${i + 1}</td><td>${shown(u.name)}</td><td>${escapeHtml(u.equipment)}</td>
              <td>${shown(u.serial)}</td><td>${STATUS_TEXT[u.status]}</td></tr>`,
          )
          .join('')}
      </table>`;

  const sections = await Promise.all(withReport.map((u) => reportSection(u.report!, logos, false)));

  // "Sign all" puts the same two signatures in every signed report, so the first one holding a client signature has them.
  const signed = withReport.find((u) => u.report!.signatures.some((s) => s.type === 'client' && s.image_base64));
  const signedNames = withReport.filter((u) => u.status === 'signed').map((u) => escapeHtml(u.name || u.serial));
  const signaturePage = `
      ${pageHead(logos, '', 'Signatures', number)}
      ${heading('Signatures', 'التوقيعات')}
      <div class="statement">
        ${signedNames.length
          ? `Signed for ${signedNames.length} of ${units.length} units: ${signedNames.join(', ')}.`
          : 'Not signed yet.'}
        <div class="ar">${signedNames.length ? `تم التوقيع على ${signedNames.length} من ${units.length} معدات.` : 'لم يتم التوقيع بعد.'}</div>
      </div>
      ${signatureBoxes(signed?.report?.signatures ?? [], info.technician)}`;

  return documentHtml([cover, ...sections, signaturePage]);
}

export async function exportContractPdf(info: ContractPdfInfo, units: ContractPdfUnit[]): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: await generateContractHtml(info, units) });
  return uri;
}

export async function exportReportPdf(report: FullReport): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: await generateReportHtml(report) });
  return uri;
}

/** Opens the phone's print screen, where the PDF can be saved, printed or shared. */
export async function sharePdf(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}
