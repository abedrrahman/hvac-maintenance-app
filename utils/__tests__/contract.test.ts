// The signature files sent with each report, and the contract PDF's layout.
import { describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('@/assets/images/main_screen_icon.png', () => 'main_screen_icon.png');
jest.mock('@/assets/images/ciat-logo.png', () => 'ciat-logo.png');
jest.mock('expo-print', () => ({}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (name: string) => ({
      downloadAsync: async () => {},
      localUri: require('path').resolve(__dirname, '../../assets/images', name),
    }),
  },
}));
jest.mock('expo-file-system', () => ({
  File: function (mockUri: string) {
    return { base64: async () => require('fs').readFileSync(mockUri).toString('base64') };
  },
}));

import { buildChecklist } from '../../constants/checklists';
import { ContractPdfUnit, generateContractHtml } from '../../services/pdfGenerator';
import { FullReport } from '../../types';
import { base64ToBytes } from '../helpers';

describe('signature files', () => {
  it('turns the saved signature text back into the exact picture bytes', () => {
    const png = fs.readFileSync(path.resolve(__dirname, '../../assets/images/favicon.png'));
    const saved = `data:image/png;base64,${png.toString('base64')}`;
    expect(Buffer.from(base64ToBytes(saved)).equals(png)).toBe(true);
    // every length of padding
    ['YQ==', 'YWI=', 'YWJj'].forEach((b64) =>
      expect(Buffer.from(base64ToBytes(b64)).toString()).toBe(Buffer.from(b64, 'base64').toString()),
    );
  });
});

const sign = (d: string) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><path d="${d}" fill="none" stroke="#16181D" stroke-width="3"/></svg>`,
  ).toString('base64');

function sampleReport(n: number, signed: boolean): FullReport {
  const id = `179467199735${n}-sample`;
  return {
    id, type: 'split', machine_id: null, client: 'Sample Client (DUMMY)', site: 'Main Building',
    date: '2026-11-18', technician: 'Sample Technician', machine_model: `SPLIT-${n}`, serial_no: `SN-${n}`,
    maintenance_type: 'Preventive', status: signed ? 'locked' : 'open', logo_uri: null,
    required_maintenance: 'Cleaned the filters.', general_notes: '', temp_unit: 'C', pressure_unit: 'bar',
    created_at: '2026-11-18T08:00:00.000Z', updated_at: '2026-11-18T08:00:00.000Z',
    uploaded_at: null, upload_error: '', visit_group: null, visit_id: 100 + n, contract_id: 7,
    contract_number: 'C-0007', contract_title: 'Sample maintenance contract', contract_batch_id: signed ? 'batch-1' : null,
    checklist_items: buildChecklist('split').map((f, i) => ({
      id: `c${n}-${i}`, report_id: id, label_en: f.labelEn, label_ar: f.labelAr,
      value: f.key === 'unit_phase' ? 'Single Phase (1Ph)' : '1', field_key: f.key, is_custom: 0, sort_order: i,
    })),
    attention_notes: [], materials: [], photos: [],
    signatures: signed
      ? [
          { id: `t${n}`, report_id: id, type: 'technician', image_base64: sign('M20 70 C60 10 90 90 130 40 S200 80 270 30'), signer_name: 'Sample Technician', signed_at: '2026-11-18' },
          { id: `k${n}`, report_id: id, type: 'client', image_base64: sign('M30 50 C70 90 110 10 150 60 S230 20 280 60'), signer_name: 'Sample Customer', signed_at: '2026-11-18' },
        ]
      : [],
  };
}

describe('contract PDF', () => {
  it('has a cover, each unit with a report on its own pages, and one signature page', async () => {
    const units: ContractPdfUnit[] = [
      { name: 'Split 1', serial: 'SN-1', equipment: 'Split Unit', status: 'signed', report: sampleReport(1, true) },
      { name: 'Split 2', serial: 'SN-2', equipment: 'Split Unit', status: 'signed', report: sampleReport(2, true) },
      { name: 'Split 3', serial: 'SN-3', equipment: 'Split Unit', status: 'not_started', report: null },
    ];
    const html = await generateContractHtml(
      { number: 'C-0007', title: 'Sample maintenance contract', client: 'Sample Client (DUMMY)', date: '2026-11-18', technician: 'Sample Technician' },
      units,
    );
    // cover + 2 reports + signature page, each after the first on a new page
    expect(html.match(/<table class="frame/g)).toHaveLength(4);
    expect(html.match(/<table class="frame next"/g)).toHaveLength(3);
    // the signature boxes come once, at the end
    expect(html.match(/class="signs"/g)).toHaveLength(1);
    expect(html.lastIndexOf('class="signs"')).toBeGreaterThan(html.lastIndexOf('Report No.'));
    expect(html).toContain('Signed for 2 of 3 units');
    expect(html).toContain('Not started');
    if (process.env.CONTRACT_PDF_OUT) fs.writeFileSync(process.env.CONTRACT_PDF_OUT, html, 'utf8');
  });
});
