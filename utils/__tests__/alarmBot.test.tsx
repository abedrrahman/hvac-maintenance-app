// The Alarm Lookup screen: the website's assistant (fake website here) and the alarm list kept on the phone.
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-sqlite', () => ({}));
// the page's address: set per test (opened from a report, or with an alarm to show)
const mockParams: { value: Record<string, string> } = { value: {} };
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-file-system', () => ({}));
jest.mock('@/services/pdfGenerator', () => ({}));
jest.mock('@/services/photos', () => ({ deletePicture: () => {} }));
// what the app saved about its link to the website; null: the starting link below
const mockSaved: { value: string | null } = { value: null };
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () =>
      mockSaved.value ?? JSON.stringify({ baseUrl: 'https://asee.example', token: '', userName: 'Test', lastSync: null, machineCount: 0 }),
    setItem: async (_key: string, value: string) => {
      mockSaved.value = value;
    },
    removeItem: async () => {},
  },
}));
// signed in unless a test says otherwise
const mockToken = { value: 'tok123' as string | null };
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => mockToken.value,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
jest.mock('@/db/database', () => {
  const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).run(...params),
    getAllSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).all(...params),
    getFirstSync: (sql: string, params: unknown[] = []) => raw.prepare(sql).get(...params) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params: unknown[]) => statement.run(...params), finalizeSync: () => {} };
    },
    withTransactionSync: (task: () => void) => {
      if (depth++ === 0) raw.exec('BEGIN');
      try {
        task();
        if (depth === 1) raw.exec('COMMIT');
      } catch (error) {
        if (depth === 1) raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
  };
  return { getDatabase: () => db };
});

import AlarmsScreen from '../../app/alarms';
import { getDatabase } from '../../db/database';
import { runMigrations } from '../../db/migrations';
import { replaceAlarms, searchAlarms } from '../../db/repositories/alarms';
import { getWebMachineKeys, removeWebMachinesNotIn, saveMachineTemplate, upsertWebMachine } from '../../db/repositories/machines';
import { loadWebLink, syncNow } from '../../services/webSync';
import { addAlarmToReport, createReport, getFullReport, lockReport, signContractReports } from '../../db/repositories/reports';

const ASK = 'اسأل المساعد (يحتاج إنترنت)';

const ANSWER = {
  text: 'هذا الإنذار يعني ضغطاً عالياً في الدائرة.',
  alarms: [
    {
      code: 'D4.1',
      name: 'ضغط عالٍ في الدائرة A',
      controllers: ['Connect Touch', 'Pro-Dialog+'],
      effect: 'تتوقف الدائرة A',
      causes: 'مكثف متسخ أو مروحة متوقفة',
      note: '',
      steps: [
        { label: 'افحص', text: 'نظافة المكثف' },
        { label: 'تأكد', text: 'أن مراوح المكثف تعمل' },
      ],
      source: { name: 'CIAT Aquaciat manual', page: 42 },
    },
  ],
  passages: [{ snippet: 'If [[high pressure]] trips twice, call service.', source: { name: 'Service guide', page: 7 } }],
};

function allText(tree: ReactTestRenderer): string {
  const flat = (c: unknown): string =>
    Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '';
  return tree.root.findAllByType(Text).map((t) => flat(t.props.children)).join('\n');
}

async function openAndAsk(question: string): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AlarmsScreen />);
  });
  await act(async () => tree.root.findByType(TextInput).props.onChangeText(question));
  await act(async () => {
    await tree.root.findByProps({ title: ASK }).props.onPress();
  });
  return tree;
}

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

beforeAll(() => {
  runMigrations(getDatabase() as never);
  // the phone's list, with the columns in a different order than the table, as the website may send them
  replaceAlarms(
    ['key', 'code', 'controller', 'name_en', 'name_ar', 'causes_en', 'causes_ar', 'effect_en'],
    [
      ['D41', 'D4.1', 'Connect Touch', 'High pressure circuit A', 'ضغط عالٍ في الدائرة A', 'Dirty condenser', 'مكثف متسخ', 'Circuit stops'],
      ['E1', 'E1', 'Pro-Dialog+', 'Water flow fault', 'خلل في تدفق الماء', 'Pump stopped', 'المضخة متوقفة', 'Unit stops'],
    ],
  );
});

afterEach(() => {
  mockToken.value = 'tok123';
  mockSaved.value = null;
  mockParams.value = {};
  mockBack.mockClear();
  jest.useRealTimers();
});

describe('the assistant', () => {
  it('asks the website with the sign-in token and shows its whole answer', async () => {
    const fetch = jest.fn((_url: string, _init?: RequestInit) => reply(200, ANSWER));
    global.fetch = fetch as never;
    const tree = await openAndAsk('ضغط عالي d4.1');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://asee.example/api/alarms/ask/?lang=ar&q=${encodeURIComponent('ضغط عالي d4.1')}`);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Token tok123');

    const text = allText(tree);
    expect(text).toContain('إجابة المساعد');
    expect(text).toContain(ANSWER.text);
    // each unit the alarm belongs to is its own highlighted tag
    const tagged = tree.root
      .findAllByType(Text)
      .filter((t) => t.props.style?.color === '#3E3A9E')
      .map((t) => t.props.children);
    expect(tagged).toEqual(expect.arrayContaining(['Connect Touch', 'Pro-Dialog+']));
    expect(text).toContain('1. افحص: نظافة المكثف');
    expect(text).toContain('2. تأكد: أن مراوح المكثف تعمل');
    expect(text).toContain('المصدر: CIAT Aquaciat manual — صفحة 42');
    expect(text).toContain('If high pressure trips twice, call service.'); // the [[ ]] marks are taken out
    expect(text).toContain('من القائمة المحفوظة (1)'); // the phone's list still shows below
  });

  it('shows a short answer with no alarms or passages', async () => {
    global.fetch = jest.fn(() => reply(200, { text: 'لم أجد هذا الرمز.' })) as never;
    const text = allText(await openAndAsk('zz99'));
    expect(text).toContain('لم أجد هذا الرمز.');
  });

  it('does not crash when the website leaves out parts of an alarm', async () => {
    global.fetch = jest.fn(() => reply(200, { text: 'جزئي', alarms: [{ code: 'X1', name: 'Partial' }] })) as never;
    const text = allText(await openAndAsk('x1'));
    expect(text).toContain('X1');
    expect(text).toContain('Partial');
  });

  it('says the phone must be linked when it is not signed in, without calling the website', async () => {
    mockToken.value = null;
    const fetch = jest.fn();
    global.fetch = fetch as never;
    const text = allText(await openAndAsk('d4.1'));
    expect(fetch).not.toHaveBeenCalled();
    expect(text).toContain('المساعد يحتاج إلى الربط مع الموقع من الإعدادات.');
    expect(text).toContain('من القائمة المحفوظة (1)');
  });

  it('falls back to the phone list when the website answers with an error', async () => {
    global.fetch = jest.fn(() => reply(500, { error: 'boom' })) as never;
    const text = allText(await openAndAsk('d4.1'));
    expect(text).toContain('تعذر الوصول إلى المساعد');
    expect(text).not.toContain('إجابة المساعد');
  });

  it('gives up after 8 seconds when the website is slow', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('Aborted'))),
        ),
    ) as never;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AlarmsScreen />);
    });
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('d4.1'));
    let asked!: Promise<void>;
    await act(async () => {
      asked = tree.root.findByProps({ title: ASK }).props.onPress();
    });
    expect(allText(tree)).not.toContain('تعذر الوصول');
    await act(async () => {
      jest.advanceTimersByTime(8000);
      await asked;
    });
    expect(allText(tree)).toContain('تعذر الوصول إلى المساعد');
  });

  it('does nothing for less than 2 letters', async () => {
    const fetch = jest.fn();
    global.fetch = fetch as never;
    await openAndAsk('d');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the alarm list on the phone (no signal)', () => {
  it('finds a code however it is typed', () => {
    for (const typed of ['D4.1', 'd4.1', 'd4 1', 'D41']) expect(searchAlarms(typed).map((a) => a.code)).toEqual(['D4.1']);
    expect(searchAlarms('E01').map((a) => a.code)).toEqual(['E1']);
  });

  it('finds alarms by words, in English or Arabic', () => {
    expect(searchAlarms('high pressure').map((a) => a.code)).toEqual(['D4.1']);
    expect(searchAlarms('المضخة').map((a) => a.code)).toEqual(['E1']);
    expect(searchAlarms('nothing like this')).toEqual([]);
  });
});

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AlarmsScreen />);
  });
  return tree;
}
const notes = (id: string) => getFullReport(id)!.attention_notes.map((n) => n.note).filter(Boolean);

describe('alarms and reports', () => {
  it('opened from a report: adds the chosen alarm to the report and goes back to it', async () => {
    const report = await createReport('chiller');
    mockParams.value = { report: report.id };
    const tree = await open();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('d4.1'));
    expect(allText(tree)).toContain('اختر إنذاراً لإضافته إلى التقرير');
    await act(async () => tree.root.findAllByProps({ title: 'إضافة إلى التقرير' })[0].props.onPress());
    expect(notes(report.id)).toEqual(['Alarm D4.1: High pressure circuit A']);
    expect(mockBack).toHaveBeenCalled();
  });

  it('adds an alarm that is not in the list, as typed', async () => {
    const report = await createReport('chiller');
    mockParams.value = { report: report.id };
    const tree = await open();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('P99 compressor trip'));
    await act(async () => tree.root.findByProps({ title: 'إضافة «P99 compressor trip» كإنذار جديد' }).props.onPress());
    expect(notes(report.id)).toEqual(['Alarm P99 compressor trip:']);
  });

  it('never changes a signed report', async () => {
    const report = await createReport('chiller');
    lockReport(report.id);
    addAlarmToReport(report.id, 'D4.1', 'High pressure circuit A');
    expect(notes(report.id)).toEqual([]);
  });

  it('opened from an alarm in a report: shows that alarm at once', async () => {
    mockParams.value = { q: 'D4.1', report: 'r1' };
    const text = allText(await open());
    expect(text).toContain('من القائمة المحفوظة (1)');
    expect(text).toContain('ضغط عالٍ في الدائرة A');
  });

  it('opened from the home page: no report buttons', async () => {
    const tree = await open();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('d4.1'));
    expect(tree.root.findAllByProps({ title: 'إضافة إلى التقرير' })).toHaveLength(0);
  });

  it('downloads the whole alarm list from the website with the button', async () => {
    const fetch = jest.fn((_url: string) =>
      reply(200, { version: 'v9', fields: ['key', 'code', 'name_en'], alarms: [['A1', 'A1', 'Low water'], ['A2', 'A2', 'Phase loss']] }),
    );
    global.fetch = fetch as never;
    const tree = await open();
    await act(async () => {
      await tree.root.findByProps({ title: 'تحديث قائمة الإنذارات من الموقع' }).props.onPress();
    });
    expect(fetch.mock.calls[0][0]).toBe('https://asee.example/api/alarms/?have=');
    expect(allText(tree)).toContain('الإنذارات المحفوظة على الهاتف: 2');
  });
});

describe('closing a report without the customer', () => {
  it('sign all locks with only the technician signature', async () => {
    const report = await createReport('split');
    signContractReports([report.id], { image: 'data:image/png;base64,AAAA', name: 'Tech' }, null, '2026-11-19');
    const full = getFullReport(report.id)!;
    expect(full.status).toBe('locked');
    expect(full.signatures.map((s) => s.type)).toEqual(['technician']);
  });
});

describe('signed out by the website', () => {
  it('stops trying and says so, when the same user signed in on another phone', async () => {
    // the website no longer knows this phone's token
    const fetch = jest.fn((url: string) => (url.endsWith('/api/login/') ? reply(405, {}) : reply(401, { detail: 'Invalid token.' })));
    global.fetch = fetch as never;
    expect((await syncNow({ download: true })).message).toBe('signed out');
    expect((await loadWebLink())?.signedOut).toBe(true);
    // the next automatic sync does not knock again
    fetch.mockClear();
    expect((await syncNow({ download: true })).message).toBe('signed out');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('units the website no longer sends', () => {
  it('are removed with their saved settings, unless a report on the phone uses them', async () => {
    const unit = (web_id: number) => ({
      web_id, type: 'chiller' as const, name: `U${web_id}`, brand: '', model: '', serial_number: `S${web_id}`,
      client_name: 'Client', country: '', site: '', location: '', project: '', web_documents: '[]',
      web_visit_id: null, web_visit_date: null,
    });
    [901, 902, 903].forEach((id) => upsertWebMachine(unit(id)));
    const idOf = (webId: number) => getDatabase().getFirstSync<{ id: string }>('SELECT id FROM machines WHERE web_id = ?', [webId])!.id;
    await createReport('chiller', { machineId: idOf(903) });
    saveMachineTemplate(idOf(902), { compressor_count: 2 });

    removeWebMachinesNotIn([901]); // 902 and 903 are gone from the website

    const left = getWebMachineKeys().map((k) => k.web_id).filter((id) => id >= 900).sort();
    expect(left).toEqual([901, 903]); // 903 stays: a report uses it
    expect(getDatabase().getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM machine_templates WHERE machine_id NOT IN (SELECT id FROM machines)',
    )!.n).toBe(0);
  });
});
