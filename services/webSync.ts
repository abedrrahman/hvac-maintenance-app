/**
 * Connection to the ASEE website (see APP_SYNC.md in the website project).
 * - signIn: username + password -> a token kept on the phone
 * - downloadSiteData: clients, units and document links -> the local machines table
 * - uploadPendingReports: every locked report that has not reached the website yet
 * The app keeps working with no connection; anything that fails is tried again on the next sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '@/db/database';
import { replaceAlarms } from '@/db/repositories/alarms';
import { getMachineById, getWebMachineKeys, removeWebMachinesNotIn, upsertWebMachine } from '@/db/repositories/machines';
import {
  getFullReport,
  getReportsToUpload,
  markReportUploadError,
  markReportUploaded,
} from '@/db/repositories/reports';
import { replaceVisits } from '@/db/repositories/visits';
import { MachineType, Signature, WebDocument } from '@/types';
import { base64ToBytes, formatDate } from '@/utils/helpers';
import { exportReportPdf } from './pdfGenerator';

const KEY = '@hvac_web_link';
const TOKEN_KEY = 'hvac_web_token';
const TIMEOUT_MS = 30000;
// A report carries its PDF and photos: on a weak signal that takes far longer than a normal request.
const UPLOAD_TIMEOUT_MS = 5 * 60000;

export interface WebLink {
  baseUrl: string;
  /** Kept in the phone's encrypted storage (expo-secure-store), never in AsyncStorage with the rest. */
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
    if (!raw) return null;
    const link = JSON.parse(raw) as WebLink;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return token ? { ...link, token } : null;
  } catch {
    return null;
  }
}

async function saveWebLink(link: WebLink): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, link.token);
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...link, token: '' }));
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function cleanBaseUrl(text: string): string {
  const url = text.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function request(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  if (/roof ?top|rtu/.test(c)) return 'rtu';
  if (c.includes('dehumid')) return 'dehumidifier';
  if (/close control|ccu|crac|precision/.test(c)) return 'ccu';
  if (/split|ducted/.test(c)) return 'split';
  return 'custom';
}

interface SyncPayload {
  /** country: not sent by the website yet. Until it is, the app has one group and opens on the clients. */
  clients: { id: number; name_en: string; name_ar: string; country?: string }[];
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
  documents: { id: number; name_en: string; type: string; url: string; file_name?: string; size?: number }[];
  visits: {
    id: number;
    number?: string | number;
    unit_id: number;
    client_id?: number;
    scheduled_date: string;
    type?: string;
    overdue?: boolean;
    status?: string;
    /** True when this user is the technician the office chose. */
    assigned_to_me?: boolean;
    contract?: { id: number; number?: string | number; title?: string } | null;
  }[];
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
  // Visits arrive oldest first: keep the first per unit. A visit scheduled for today wins, so today's contract visits show.
  const today = formatDate();
  const nextVisit = new Map<number, { id: number; date: string }>();
  data.visits.forEach((v) => {
    const date = (v.scheduled_date ?? '').slice(0, 10);
    if (!nextVisit.has(v.unit_id) || date === today) nextVisit.set(v.unit_id, { id: v.id, date });
  });

  // One transaction for the whole list: saving 800+ units one by one froze the app for seconds at every start.
  getDatabase().withTransactionSync(() => replaceVisits(
    data.visits.map((v) => {
      const client = v.client_id != null ? clients.get(v.client_id) : undefined;
      return {
        id: v.id,
        number: String(v.number ?? ''),
        unit_id: v.unit_id,
        client_id: v.client_id ?? null,
        client_name: client?.name_en ?? '',
        scheduled_date: v.scheduled_date ?? '',
        type: v.type ?? '',
        status: v.status ?? '',
        overdue: v.overdue ? 1 : 0,
        assigned_to_me: v.assigned_to_me ? 1 : 0,
        contract_id: v.contract?.id ?? null,
        contract_number: String(v.contract?.number ?? ''),
        contract_title: v.contract?.title ?? '',
      };
    }),
  ));
  getDatabase().withTransactionSync(() => data.units.forEach((u) => {
    const docs: WebDocument[] = u.document_ids
      .map((id) => documents.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({ name: d.name_en, type: d.type, url: d.url, id: d.id, file_name: d.file_name, size: d.size }));
    const client = clients.get(u.client_id);
    upsertWebMachine({
      web_id: u.id,
      type: machineTypeFor(u.category),
      name: u.name_en,
      brand: u.manufacturer,
      model: u.model,
      serial_number: u.serial_number,
      client_name: client?.name_en ?? '',
      country: typeof client?.country === 'string' ? client.country.trim() : '',
      site: client?.name_ar || client?.name_en || '',
      location: u.location,
      project: u.project,
      web_documents: JSON.stringify(docs),
      web_visit_id: nextVisit.get(u.id)?.id ?? null,
      web_visit_date: nextVisit.get(u.id)?.date ?? null,
    });
  }));

  removeWebMachinesNotIn(data.units.map((u) => u.id));

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

/**
 * Each signature as a picture file, named signature_technician.png / signature_client.png as the website expects.
 * One folder per report, so two reports never share a file. The folder is removed after the upload.
 */
function signatureFiles(folder: Directory, signatures: Signature[]): File[] {
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true });
  return signatures
    .filter((s) => s.image_base64.startsWith('data:image'))
    .slice(0, 4)
    .map((s) => {
      const extension = s.image_base64.startsWith('data:image/jpeg') ? 'jpg' : 'png';
      const file = new File(folder, `signature_${s.type}.${extension}`);
      file.create({ overwrite: true });
      file.write(base64ToBytes(s.image_base64));
      return file;
    });
}

async function uploadReport(link: WebLink, reportId: string): Promise<void> {
  const full = getFullReport(reportId);
  if (!full) return;
  const machine = full.machine_id ? getMachineById(full.machine_id) : null;
  // The signatures go as picture files below, not as text inside the JSON.
  const { signatures, photos, ...report } = full;

  const form = new FormData();
  form.append(
    'report',
    JSON.stringify({
      ...report,
      unit_id: machine?.web_id ?? '',
      // the visit the report was made for; reports started from the unit page fall back to the unit's next visit
      visit_id: report.visit_id ?? machine?.web_visit_id ?? '',
      contract_batch_id: report.contract_batch_id ?? '',
    }),
  );
  const pdfUri = await exportReportPdf(full);
  // Expo's fetch refuses React Native's { uri } parts ("Unsupported FormDataPart implementation"): attach expo-file-system Files.
  form.append('pdf', new File(pdfUri) as never);
  // A photo deleted from the phone is left out, so one missing picture does not block the report.
  photos.map((p) => new File(p.uri)).filter((f) => f.exists).forEach((f) => form.append('photo', f as never));
  const signatureFolder = new Directory(Paths.cache, 'upload-signatures', reportId);
  signatureFiles(signatureFolder, signatures).forEach((f) => form.append('signature', f as never));

  try {
    const response = await request(`${link.baseUrl}/api/reports/`, {
      method: 'POST',
      headers: { Authorization: `Token ${link.token}` },
      body: form,
    }, UPLOAD_TIMEOUT_MS);
    if ([400, 403, 404].includes(response.status)) throw new RefusedError(await errorText(response));
    if (!response.ok) throw new Error(await errorText(response));
  } finally {
    if (signatureFolder.exists) signatureFolder.delete();
  }
}

let running = false;
/** After an upload fails, automatic tries wait until this time: each try rebuilds the report's PDF. "Sync now" ignores it. */
let retryUploadsAt = 0;
const RETRY_UPLOADS_AFTER_MS = 10 * 60000;

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
    const mayUpload = options.manual || (link.autoUpload !== false && Date.now() >= retryUploadsAt);
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
        else retryUploadsAt = Date.now() + RETRY_UPLOADS_AFTER_MS;
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
