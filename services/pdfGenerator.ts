import { getChecklistTemplate } from '@/constants/checklists';
import { COMPANY } from '@/constants/company';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { ChecklistItem, FullReport } from '@/types';
import { buildChillerChecklist, getVisibleCompressorFields } from '@/utils/chillerFields';
import { hasValue } from '@/utils/helpers';
import { pressureUnitLabel, tempUnitLabel } from '@/utils/units';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';


const ACCENT = '#E8730A';
const BORDER = '#333';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function highlightValue(value: string): string {
  if (!hasValue(value)) return '&nbsp;';
  return `<span style="color:${ACCENT};font-weight:bold;">${escapeHtml(value)}</span>`;
}

function bilingualCell(en: string, ar: string): string {
  return `<td style="border:1px solid ${BORDER};padding:6px 8px;width:35%;">
    <span style="font-weight:bold;">${escapeHtml(en)}</span>
    <span style="float:right;font-weight:bold;direction:rtl;">${escapeHtml(ar)}</span>
  </td>`;
}

function valueCell(value: string, highlight = false): string {
  const content = highlight ? highlightValue(value) : escapeHtml(value || '');
  return `<td style="border:1px solid ${BORDER};padding:6px 8px;">${content || '&nbsp;'}</td>`;
}

async function logoToBase64(uri: string | null): Promise<string> {
  if (!uri) return '';
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${base64}`;
  } catch {
    return '';
  }
}

async function photoToBase64(uri: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${base64}`;
  } catch {
    return '';
  }
}

function pageStyles(): string {
  return `
    @page { margin: 0; size: A4; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .page {
      page-break-after: always;
      padding: 12mm 15mm 22mm 15mm;
      position: relative;
      min-height: 297mm;
    }
    .page:last-child { page-break-after: auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      border-bottom: 2px solid ${BORDER};
      padding-bottom: 8px;
    }
    .header-logo { max-width: 120px; max-height: 60px; object-fit: contain; }
    .header-company { text-align: right; font-size: 11px; line-height: 1.4; }
    .header-company .en { font-weight: bold; }
    .header-company .ar { direction: rtl; font-weight: bold; }
    .report-title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin: 10px 0 14px;
      text-decoration: underline;
    }
    .footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 6px 15mm;
      border-top: 1px solid ${BORDER};
      font-size: 8px;
      line-height: 1.35;
      background: white;
    }
    .footer-ar { direction: rtl; text-align: right; max-width: 48%; }
    .footer-en { max-width: 48%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .section-title { font-weight: bold; font-size: 12px; margin: 10px 0 6px; }
    .checklist-row td { vertical-align: middle; }
    .highlight-row { background: #FFF3E0; }
    .text-box {
      border: 1px solid ${BORDER};
      min-height: 80px;
      padding: 8px;
      margin-bottom: 12px;
    }
    .signatures { display: flex; gap: 20px; margin-top: 16px; }
    .sig-block { flex: 1; text-align: center; border: 1px solid ${BORDER}; padding: 10px; }
    .sig-block img { max-width: 100%; max-height: 80px; }
    .sig-label { font-weight: bold; margin-bottom: 8px; font-size: 11px; }
    .photos-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .photo-item { width: 48%; text-align: center; margin-bottom: 12px; }
    .photo-item img { max-width: 100%; max-height: 200px; border: 1px solid ${BORDER}; }
    .photo-caption { font-size: 10px; margin-top: 4px; }
  `;
}

function headerHtml(logoSrc: string, title: string): string {
  const logoBlock = logoSrc
    ? `<img class="header-logo" src="${logoSrc}" alt="Logo"/>`
    : '<div style="width:120px;height:50px;"></div>';

  return `
    <div class="header">
      <div>${logoBlock}</div>
      <div class="header-company">
        <div class="en">${escapeHtml(COMPANY.nameEn)}</div>
        <div class="ar">${escapeHtml(COMPANY.nameAr)}</div>
      </div>
    </div>
    <div class="report-title">${escapeHtml(title)}</div>
  `;
}

function formatChecklistValue(item: ChecklistItem, report: FullReport): string {
  if (!hasValue(item.value)) return '';
  let suffix = '';
  if (item.field_key) {
    const defs =
      report.type === 'chiller'
        ? buildChillerChecklist(4, 4)
        : getChecklistTemplate(report.type);
    const def = defs.find((d) => d.key === item.field_key);
    if (def?.type === 'temperature') suffix = ` ${tempUnitLabel(report.temp_unit)}`;
    if (def?.type === 'pressure') suffix = ` ${pressureUnitLabel(report.pressure_unit)}`;
    if (def?.unit && def.type !== 'temperature' && def.type !== 'pressure') {
      suffix = ` ${def.unit}`;
    }
  }
  return `${item.value}${suffix}`;
}

function filterVisibleChecklistItems(report: FullReport): ChecklistItem[] {
  if (report.type !== 'chiller') return report.checklist_items;

  const valueMap: Record<string, string> = {};
  report.checklist_items.forEach((i) => {
    if (i.field_key) valueMap[i.field_key] = i.value;
  });
  const compressorCount = parseInt(valueMap.compressor_count || '1', 10) || 1;
  const circuitCount = parseInt(valueMap.circuit_count || '1', 10) || 1;

  return report.checklist_items.filter((item) => {
    if (!item.field_key) return true;
    const key = item.field_key;
    const compMatch = key.match(/^compressor_(\d+)_/);
    if (compMatch) {
      const idx = parseInt(compMatch[1], 10);
      if (idx > compressorCount) return false;
      const vt = valueMap[`compressor_${idx}_voltage_type`] ?? '';
      return getVisibleCompressorFields(idx - 1, vt).includes(key);
    }
    const circMatch = key.match(/^circuit_(\d+)_/);
    if (circMatch) return parseInt(circMatch[1], 10) <= circuitCount;
    return true;
  });
}

function checklistHtml(report: FullReport): string {
  const items = filterVisibleChecklistItems(report);
  let html = '';
  let lastSection = '';

  items.forEach((item) => {
    const def =
      report.type === 'chiller'
        ? buildChillerChecklist(4, 4).find((d) => d.key === item.field_key)
        : getChecklistTemplate(report.type).find((d) => d.key === item.field_key);
    const sec = def?.section ?? '';
    if (sec && sec !== lastSection) {
      lastSection = sec;
      const comp = sec.match(/^compressor_(\d+)$/);
      const circ = sec.match(/^circuit_(\d+)$/);
      const label = comp
        ? `── Compressor ${comp[1]} ──`
        : circ
          ? `── Circuit ${circ[1]} ──`
          : '';
      if (label) {
        html += `<tr><td colspan="2" style="border:1px solid ${BORDER};padding:8px;background:#FFF3E0;font-weight:bold;text-align:center;">${label}</td></tr>`;
      }
    }
    const display = formatChecklistValue(item, report);
    html += `
    <tr class="checklist-row">
      <td style="border:1px solid ${BORDER};padding:6px 8px;width:45%;">
        <span style="font-weight:bold;">${escapeHtml(item.label_en)}</span>
        <span style="float:right;font-weight:bold;direction:rtl;">${escapeHtml(item.label_ar)}</span>
      </td>
      <td style="border:1px solid ${BORDER};padding:6px 8px;">${highlightValue(display)}</td>
    </tr>`;
  });
  return html;
}

function footerHtml(): string {
  return `
    <div class="footer">
      <div class="footer-en">${escapeHtml(COMPANY.footerEn).replace(/<br\/>/g, '<br/>')}</div>
      <div class="footer-ar">${escapeHtml(COMPANY.footerAr).replace(/<br\/>/g, '<br/>')}</div>
    </div>
  `;
}

export async function generateReportHtml(report: FullReport): Promise<string> {
  const machineInfo = getMachineTypeInfo(report.type);
  const title = machineInfo.reportTitle(report.maintenance_type);
  const logoSrc = await logoToBase64(report.logo_uri);

  const infoRows = `
    <tr>
      ${bilingualCell('Date', 'التاريخ')}
      <td colspan="3" style="border:1px solid ${BORDER};padding:6px 8px;">${highlightValue(report.date)}</td>
    </tr>
    <tr>
      ${bilingualCell('Client', 'العميل')}
      ${valueCell(report.client, hasValue(report.client))}
      ${bilingualCell('Site', 'الموقع')}
      ${valueCell(report.site, hasValue(report.site))}
    </tr>
    <tr>
      ${bilingualCell('M.R.No.', 'الرقم')}
      ${valueCell('', false)}
      ${bilingualCell('Maintenance Type', 'نوع الصيانة')}
      ${valueCell(report.maintenance_type, true)}
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;">
        <span style="font-weight:bold;">ASEE Technician</span>
        <span style="float:right;font-weight:bold;direction:rtl;">الفني – المهندس</span>
      </td>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;">
        ${highlightValue(report.technician)}
      </td>
    </tr>
  `;

  const machineRows = `
    <tr>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;background:#FFF3E0;">
        <span style="font-weight:bold;">AHU Model</span>
        <span style="float:right;font-weight:bold;direction:rtl;">موديل المكينة</span>
      </td>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;background:#FFF3E0;">
        ${highlightValue(report.machine_model)}
      </td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;background:#FFF3E0;">
        <span style="font-weight:bold;">S/N No.</span>
      </td>
      <td colspan="2" style="border:1px solid ${BORDER};padding:6px 8px;background:#FFF3E0;">
        ${highlightValue(report.serial_no)}
      </td>
    </tr>
  `;

  const checklistRows = checklistHtml(report);

  const attentionRows = report.attention_notes
    .filter((n) => hasValue(n.note) || hasValue(n.unit_no))
    .map(
      (n, i) => `
    <tr class="highlight-row">
      <td style="border:1px solid ${BORDER};padding:6px 8px;width:15%;">${escapeHtml(n.unit_no || String(i + 1))}</td>
      <td style="border:1px solid ${BORDER};padding:6px 8px;">${highlightValue(n.note)}</td>
    </tr>`,
    )
    .join('');

  const emptyAttentionRows = report.attention_notes
    .filter((n) => !hasValue(n.note) && !hasValue(n.unit_no))
    .slice(0, Math.max(0, 8 - report.attention_notes.filter((n) => hasValue(n.note)).length))
    .map(
      (_, i) => `
    <tr>
      <td style="border:1px solid ${BORDER};padding:6px 8px;">${i + 1}</td>
      <td style="border:1px solid ${BORDER};padding:6px 8px;">&nbsp;</td>
    </tr>`,
    )
    .join('');

  const materialRows = report.materials
    .filter((m) => hasValue(m.description) || hasValue(m.qty))
    .map(
      (m) => `
    <tr class="highlight-row">
      <td style="border:1px solid ${BORDER};padding:6px 8px;">${highlightValue(m.description)}</td>
      <td style="border:1px solid ${BORDER};padding:6px 8px;width:12%;">${highlightValue(m.qty)}</td>
      <td style="border:1px solid ${BORDER};padding:6px 8px;width:12%;">${escapeHtml(m.unit || '')}</td>
    </tr>`,
    )
    .join('');

  const techSig = report.signatures.find((s) => s.type === 'technician');
  const clientSig = report.signatures.find((s) => s.type === 'client');

  const techSigImg = techSig?.image_base64
    ? `<img src="${techSig.image_base64}" alt="Technician Signature"/>`
    : '';
  const clientSigImg = clientSig?.image_base64
    ? `<img src="${clientSig.image_base64}" alt="Customer Signature"/>`
    : '';

  let photosHtml = '';
  if (report.photos.length > 0) {
    const photoItems = await Promise.all(
      report.photos.map(async (photo) => {
        const src = await photoToBase64(photo.uri);
        if (!src) return '';
        return `
          <div class="photo-item">
            <img src="${src}" alt="Site photo"/>
            <div class="photo-caption">${escapeHtml(photo.caption || '')}</div>
          </div>`;
      }),
    );
    photosHtml = `
      <div class="page">
        ${headerHtml(logoSrc, title)}
        <div class="section-title">Site Photos | صور الموقع</div>
        <div class="photos-grid">${photoItems.join('')}</div>
        ${footerHtml()}
      </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>${pageStyles()}</style>
</head>
<body>
  <div class="page">
    ${headerHtml(logoSrc, title)}
    <table>${infoRows}</table>
    <table>${machineRows}</table>
    <div class="section-title">Maintenance Checklist:</div>
    <table>${checklistRows}</table>
    ${footerHtml()}
  </div>

  <div class="page">
    ${headerHtml(logoSrc, title)}
    <div class="section-title">Required Maintenance | الصيانة المطلوبة</div>
    <div class="text-box">${highlightValue(report.required_maintenance)}</div>
    <div class="section-title">Need Attention | بحاجة الى انتباه</div>
    <table>
      <tr>
        <th style="border:1px solid ${BORDER};padding:6px;width:15%;">Unit</th>
        <th style="border:1px solid ${BORDER};padding:6px;">Note</th>
      </tr>
      ${attentionRows}${emptyAttentionRows}
    </table>
    <div class="section-title">Materials Used | المواد المستخدمة</div>
    <table>
      <tr>
        <th style="border:1px solid ${BORDER};padding:6px;">Description</th>
        <th style="border:1px solid ${BORDER};padding:6px;width:12%;">QTY</th>
        <th style="border:1px solid ${BORDER};padding:6px;width:12%;">Unit</th>
      </tr>
      ${materialRows}
    </table>
    ${footerHtml()}
  </div>

  <div class="page">
    ${headerHtml(logoSrc, title)}
    <div class="section-title">Notes | الملاحظات</div>
    <div class="text-box">${escapeHtml(report.general_notes || '')}</div>
    <div class="signatures">
      <div class="sig-block">
        <div class="sig-label">Signature Of Technician / توقيع الفني</div>
        ${techSigImg}
        <div style="margin-top:8px;font-weight:bold;">${escapeHtml(techSig?.signer_name || report.technician)}</div>
        <div>${escapeHtml(techSig?.signed_at || '')}</div>
      </div>
      <div class="sig-block">
        <div class="sig-label">Signature Of Customer / توقيع العميل</div>
        ${clientSigImg}
        <div style="margin-top:8px;font-weight:bold;">${escapeHtml(clientSig?.signer_name || '')}</div>
        <div>${escapeHtml(clientSig?.signed_at || '')}</div>
      </div>
    </div>
    ${footerHtml()}
  </div>
  ${photosHtml}
</body>
</html>`;
}

export async function exportReportPdf(report: FullReport): Promise<string> {
  try {
    console.log('📄 Starting PDF export...');
    const html = await generateReportHtml(report);
    console.log('📄 HTML generated, length:', html.length);

    // write HTML to a temp file in documentDirectory
    const htmlFileName = `report_${Date.now()}.html`;
    const htmlUri = `${FileSystem.documentDirectory}${htmlFileName}`;
    await FileSystem.writeAsStringAsync(htmlUri, html, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // print from the HTML file URI
    const pdfFileName = `ASEE_Report_${Date.now()}.pdf`;
    const pdfUri = `${FileSystem.documentDirectory}${pdfFileName}`;

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // delete temp html
    await FileSystem.deleteAsync(htmlUri, { idempotent: true });

    console.log('📄 PDF created at:', uri);
    return uri;
  } catch (error) {
    console.error('📄 PDF export error:', error);
    throw error;
  }
}

export async function sharePdf(uri: string): Promise<void> {
  try {
    // fallback: open native print dialog
    await Print.printAsync({ uri });
  } catch (error) {
    console.error('📄 Print error:', error);
    throw error;
  }
}
