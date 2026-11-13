/**
 * Connection to the ASEE website (see APP_SYNC.md in the website project).
 * - signIn: username + password -> a token kept on the phone
 * - downloadSiteData: clients, units and document links -> the local machines table
 * - uploadPendingReports: every locked report that has not reached the website yet
 * The app keeps working with no connection; anything that fails is tried again on the next sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { replaceAlarms } from '@/db/repositories/alarms';
import { getMachineById, getWebMachineKeys, upsertWebMachine } from '@/db/repositories/machines';
import {
  getFullReport,
  getReportsToUpload,
  markReportUploadError,
  markReportUploaded,
} from '@/db/repositories/reports';
import { MachineType, WebDocument } from '@/types';
import { exportReportPdf } from './pdfGenerator';

const KEY = '@hvac_web_link';
const TIMEOUT_MS = 30000;

export interface WebLink {
  baseUrl: string;
  // shortcut: the token sits in AsyncStorage (not encrypted); move it to expo-secure-store if phones are shared or unlocked.
  token: string;
  userName: string;
  lastSync: string | null;
  machineCount: number;
  /** Off: locked reports wait until the user presses "Sync now". Missing means on. */
  autoUpload?: boolean;
  /** Sites and units that appeared on the website since the user last looked. */
  newSites?: string[];
  newUnits?: number;
  /** Which alarm list the phone holds, so the website sends it again only when it changed. */
  alarmVersion?: string;
}

/** Brings the website's alarm list onto the phone (about 1 MB, only when it changed). */
async function downloadAlarms(link: WebLink): Promise<void> {
  const have = encodeURIComponent(link.alarmVersion ?? '');
  const response = await request(`${link.baseUrl}/api/alarms/?have=${have}`, {
    headers: { Authorization: `Token ${link.token}` },
  });
  if (!response.ok) throw new Error(await errorText(response));
  const data = (await response.json()) as { version: string; fields?: string[]; alarms: unknown[][] | null };
  if (!data.alarms || !data.fields) return;
  replaceAlarms(data.fields, data.alarms);
  const current = (await loadWebLink()) ?? link;
  await saveWebLink({ ...current, alarmVersion: data.version });
}

export interface BotAlarm {
  code: string;
  name: string;
  controllers: string[];
  effect: string;
  causes: string;
  note: string;
  steps: { label: string; text: string }[];
  source: { name: string; page: number };
}

export interface BotAnswer {
  text: string;
  alarms?: BotAlarm[];
  passages?: { snippet: string; source: { name: string; page: number } }[];
}

const BOT_TIMEOUT_MS = 8000;

/** Asks the website's Alarm Lookup assistant. Needs a connection; gives up after 8 seconds so the screen never hangs. */
export async function askAlarmBot(question: string): Promise<BotAnswer> {
  const link = await loadWebLink();
  if (!link) throw new Error('not signed in');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${link.baseUrl}/api/alarms/ask/?lang=ar&q=${encodeURIComponent(question)}`,
      { headers: { Authorization: `Token ${link.token}` }, signal: controller.signal },
    );
    if (!response.ok) throw new Error(await errorText(response));
    return (await response.json()) as BotAnswer;
  } finally {
    clearTimeout(timer);
  }
}

export async function setAutoUpload(on: boolean): Promise<void> {
  const link = await loadWebLink();
  if (link) await saveWebLink({ ...link, autoUpload: on });
}

/** The user has seen the "new sites" notice. */
export async function clearNewSites(): Promise<void> {
  const link = await loadWebLink();
  if (link) await saveWebLink({ ...link, newSites: [], newUnits: 0 });
}

export interface SyncResult {
  ok: boolean;
  message: string;
  uploaded: number;
  waiting: number;
}

export async function loadWebLink(): Promise<WebLink | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WebLink) : null;
  } catch {
    return null;
  }
}

async function saveWebLink(link: WebLink): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(link));
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

function cleanBaseUrl(text: string): string {
  const url = text.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* not JSON */
  }
  return `Server answered ${response.status}`;
}

/** The website refused this report itself (unknown unit, bad data, no permission): sending it again unchanged cannot help. */
class RefusedError extends Error {}

export async function signIn(
  baseUrlText: string,
  username: string,
  password: string,
): Promise<WebLink> {
  const baseUrl = cleanBaseUrl(baseUrlText);
  const response = await request(`${baseUrl}/api/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { token: string; name: string };
  const link: WebLink = {
    baseUrl,
    token: body.token,
    userName: body.name,
    lastSync: null,
    machineCount: 0,
  };
  await saveWebLink(link);
  return link;
}

/** The website's equipment types, matched to the app's checklists. Unknown types use the custom checklist. */
export function machineTypeFor(category: string): MachineType {
  const c = category.toLowerCase();
  if (c.includes('air handling') || c.includes('ahu')) return 'ahu';
  if (c.includes('chiller')) return 'chiller';
  if (c.includes('fan coil') || c.includes('fcu')) return 'fcu';
  if (c.includes('vrf') || c.includes('vrv')) return 'vrf';
  if (c.includes('cooling tower')) return 'cooling_tower';
  if (c.includes('boiler')) return 'boiler';
  // Rooftop, close control and dehumidification units are packaged DX machines: the split checklist fits them best.
  if (/split|ducted|rooftop|rtu|close control|ccu|dehumid/.test(c)) return 'split';
  return 'custom';
}

interface SyncPayload {
  clients: { id: number; name_en: string; name_ar: string }[];
  units: {
    id: number;
    name_en: string;
    name_ar: string;
    client_id: number;
    category: string;
    manufacturer: string;
    model: string;
    serial_number: string;
    project: string;
    location: string;
    document_ids: number[];
  }[];
  documents: { id: number; name_en: string; type: string; url: string }[];
  visits: { id: number; unit_id: number; scheduled_date: string }[];
}

export async function downloadSiteData(link: WebLink): Promise<number> {
  const response = await request(`${link.baseUrl}/api/sync/`, {
    headers: { Authorization: `Token ${link.token}` },
  });
  if (!response.ok) throw new Error(await errorText(response));
  const data = (await response.json()) as SyncPayload;

  // What is new since the last download. The very first download is not "new": everything arrives at once.
  const known = getWebMachineKeys();
  const knownIds = new Set(known.map((k) => k.web_id));
  const knownSites = new Set(known.map((k) => k.client_name));
  const first = known.length === 0;

  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const documents = new Map(data.documents.map((d) => [d.id, d]));
  const nextVisit = new Map<number, number>(); // visits arrive oldest first: keep the first per unit
  data.visits.forEach((v) => {
    if (!nextVisit.has(v.unit_id)) nextVisit.set(v.unit_id, v.id);
  });

  data.units.forEach((u) => {
    const docs: WebDocument[] = u.document_ids
      .map((id) => documents.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({ name: d.name_en, type: d.type, url: d.url }));
    const client = clients.get(u.client_id);
    upsertWebMachine({
      web_id: u.id,
      type: machineTypeFor(u.category),
      name: u.name_en,
      brand: u.manufacturer,
      model: u.model,
      serial_number: u.serial_number,
      client_name: client?.name_en ?? '',
      site: client?.name_ar || client?.name_en || '',
      location: u.location,
      project: u.project,
      web_documents: JSON.stringify(docs),
      web_visit_id: nextVisit.get(u.id) ?? null,
    });
  });

  const addedUnits = first ? [] : data.units.filter((u) => !knownIds.has(u.id));
  const addedSites = new Set(
    addedUnits
      .map((u) => clients.get(u.client_id)?.name_en ?? '')
      .filter((name) => name && !knownSites.has(name)),
  );
  const current = (await loadWebLink()) ?? link; // keep a switch the user changed while this download ran
  await saveWebLink({
    ...current,
    lastSync: new Date().toISOString(),
    machineCount: data.units.length,
    newSites: [...new Set([...(current.newSites ?? []), ...addedSites])],
    newUnits: (current.newUnits ?? 0) + addedUnits.length,
  });
  return data.units.length;
}

function fileName(uri: string, fallback: string): string {
  const name = uri.split('/').pop() ?? '';
  return name.includes('.') ? name : fallback;
}

async function uploadReport(link: WebLink, reportId: string): Promise<void> {
  const full = getFullReport(reportId);
  if (!full) return;
  const machine = full.machine_id ? getMachineById(full.machine_id) : null;
  // Signatures are inside the PDF; sending their image data again would only make the upload heavier.
  const { signatures: _signatures, photos, ...report } = full;

  const form = new FormData();
  form.append(
    'report',
    JSON.stringify({
      ...report,
      unit_id: machine?.web_id ?? '',
      visit_id: machine?.web_visit_id ?? '',
    }),
  );
  const pdfUri = await exportReportPdf(full);
  form.append('pdf', { uri: pdfUri, name: `ASEE_Report_${reportId}.pdf`, type: 'application/pdf' } as never);
  photos.forEach((p, i) => {
    form.append('photo', { uri: p.uri, name: fileName(p.uri, `photo_${i + 1}.jpg`), type: 'image/jpeg' } as never);
  });

  const response = await request(`${link.baseUrl}/api/reports/`, {
    method: 'POST',
    headers: { Authorization: `Token ${link.token}` },
    body: form,
  });
  if ([400, 403, 404].includes(response.status)) throw new RefusedError(await errorText(response));
  if (!response.ok) throw new Error(await errorText(response));
}

let running = false;

/** Uploads waiting reports, then refreshes the site data. Safe to call often: it does nothing while a sync is already running. */
export async function syncNow(options: { download?: boolean; manual?: boolean } = {}): Promise<SyncResult> {
  const link = await loadWebLink();
  if (!link) return { ok: false, message: 'not signed in', uploaded: 0, waiting: getReportsToUpload().length };
  if (running) return { ok: true, message: 'already running', uploaded: 0, waiting: getReportsToUpload().length };
  running = true;
  let uploaded = 0;
  let message = '';
  try {
    // A quick knock first: with no connection we stop here instead of building a PDF for every waiting report.
    try {
      await request(`${link.baseUrl}/api/login/`, { method: 'GET' });
    } catch {
      return { ok: false, message: 'offline', uploaded: 0, waiting: getReportsToUpload().length };
    }
    // With automatic upload switched off, reports leave the phone only when the user presses "Sync now".
    const mayUpload = options.manual || link.autoUpload !== false;
    for (const report of mayUpload ? getReportsToUpload() : []) {
      // A refused report waits for the user ("Sync now" in Settings), so the phone does not rebuild its PDF every minute.
      if (report.upload_error && !options.manual) continue;
      try {
        await uploadReport(link, report.id);
        markReportUploaded(report.id);
        uploaded += 1;
      } catch (error) {
        // Kept for the next sync. The website ignores a report it already has, so trying again is safe.
        message = error instanceof Error ? error.message : String(error);
        if (error instanceof RefusedError) markReportUploadError(report.id, message);
      }
    }
    if (options.download) {
      try {
        await downloadSiteData(link);
        await downloadAlarms((await loadWebLink()) ?? link);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    running = false;
  }
  return { ok: !message, message, uploaded, waiting: getReportsToUpload().length };
}
