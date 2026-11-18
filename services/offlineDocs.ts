/**
 * Unit documents (manuals, catalogues, wiring diagrams) kept on the phone for work with no signal.
 * Each document gets its own folder under the app's documents, named after its website path,
 * so the file keeps the name and type the website gave it.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Machine, WebDocument } from '@/types';
import { loadWebLink } from './webSync';

const ROOT = 'web-docs';

/** The website answered with its sign-in page instead of the file: it does not accept the app's token for documents. */
export class DocsRefusedError extends Error {}

/** The address without the host: the website's address can change, the document's path does not. */
function pathOf(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, '');
}

function folderFor(url: string): Directory {
  return new Directory(Paths.document, ROOT, pathOf(url).replace(/[^a-zA-Z0-9]+/g, '_') || '_');
}

export function documentsOf(machine: Machine): WebDocument[] {
  try {
    return JSON.parse(machine.web_documents) as WebDocument[];
  } catch {
    return [];
  }
}

/** The copy on the phone, or null when the document has not been downloaded. */
export function savedDocument(url: string): File | null {
  const folder = folderFor(url);
  if (!folder.exists) return null;
  const file = folder.list().find((item): item is File => item instanceof File);
  return file && file.size > 0 ? file : null;
}

async function isWebPage(file: File): Promise<boolean> {
  if (file.type.includes('html')) return true;
  if (file.size > 300000) return false;
  return /^\s*<(!doctype html|html)/i.test((await file.text()).slice(0, 200));
}

async function downloadOne(baseUrl: string, token: string, url: string): Promise<void> {
  if (savedDocument(url)) return;
  const folder = folderFor(url);
  if (folder.exists) folder.delete(); // a download that was cut off
  folder.create({ intermediates: true });
  try {
    const file = await File.downloadFileAsync(baseUrl + pathOf(url), folder, {
      headers: { Authorization: `Token ${token}` },
    });
    if (await isWebPage(file)) throw new DocsRefusedError('refused');
  } catch (error) {
    if (folder.exists) folder.delete();
    throw error;
  }
}

export interface DocsResult {
  saved: number;
  failed: number;
  /** The website refused the app's token: no document can be downloaded until the website allows it. */
  refused: boolean;
  signedOut: boolean;
}

/** Downloads every document of these units that is not on the phone yet. Safe to run again: saved files are skipped. */
export async function downloadDocuments(
  machines: Machine[],
  onProgress?: (done: number, total: number) => void,
): Promise<DocsResult> {
  const result: DocsResult = { saved: 0, failed: 0, refused: false, signedOut: false };
  const link = await loadWebLink();
  if (!link) return { ...result, signedOut: true };
  const urls = [...new Set(machines.flatMap((m) => documentsOf(m).map((d) => d.url)))];
  for (let i = 0; i < urls.length; i += 1) {
    onProgress?.(i, urls.length);
    try {
      await downloadOne(link.baseUrl, link.token, urls[i]);
      result.saved += 1;
    } catch (error) {
      if (error instanceof DocsRefusedError) return { ...result, refused: true };
      result.failed += 1;
    }
  }
  onProgress?.(urls.length, urls.length);
  return result;
}

export function countDocuments(machines: Machine[]): { total: number; saved: number } {
  const urls = [...new Set(machines.flatMap((m) => documentsOf(m).map((d) => d.url)))];
  return { total: urls.length, saved: urls.filter((u) => savedDocument(u)).length };
}

/** Opens the copy on the phone with whatever app the phone has for that kind of file. */
export async function openSavedDocument(file: File): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType: file.type || undefined, dialogTitle: file.name });
}

/** The words for the result, shared by the unit page and the client page. */
export function describeResult(result: DocsResult): { title: string; message: string } {
  if (result.signedOut) {
    return { title: 'تنبيه', message: 'اربط التطبيق بالموقع من الإعدادات أولاً.' };
  }
  if (result.refused) {
    return {
      title: 'الموقع رفض التنزيل',
      message:
        'الموقع يطلب تسجيل الدخول من المتصفح لفتح المستندات ولا يقبل رمز التطبيق. يجب تعديل الموقع ليسمح للتطبيق بتنزيل المستندات.',
    };
  }
  if (result.failed > 0) {
    return {
      title: 'لم يكتمل التنزيل',
      message: `تم حفظ ${result.saved} مستند وتعذر تنزيل ${result.failed}. تحقق من الاتصال ثم حاول مرة أخرى.`,
    };
  }
  return { title: 'تم التنزيل', message: `${result.saved} مستند محفوظ على الهاتف للعمل بدون إنترنت.` };
}
