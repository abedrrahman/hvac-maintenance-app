/**
 * Manuals kept on the phone. A document is downloaded from the website once (with the app's sign-in)
 * and afterwards opens with no signal.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { WebDocument } from '@/types';
import { loadWebLink } from './webSync';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function extension(doc: WebDocument): string {
  const name = doc.file_name ?? '';
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'pdf';
}

function folder(): Directory {
  const dir = new Directory(Paths.document, 'manuals');
  if (!dir.exists) dir.create();
  return dir;
}

/** Where the document sits on the phone. The size is in the name, so a file replaced on the website is downloaded again. */
function localFile(doc: WebDocument): File {
  return new File(folder(), `${doc.id}-${doc.size ?? 0}.${extension(doc)}`);
}

/** True when this document can be opened with no connection. Documents synced by an older app version have no id yet. */
export function isSaved(doc: WebDocument): boolean {
  return doc.id != null && localFile(doc).exists;
}

/** Downloads the document unless the phone already has it. Throws when there is no connection or the website refuses. */
export async function saveDocument(doc: WebDocument): Promise<File> {
  if (doc.id == null) throw new Error('sync first');
  const file = localFile(doc);
  if (file.exists) return file;
  const link = await loadWebLink();
  if (!link) throw new Error('not signed in');
  // Download beside the final name first: a download cut off half-way must never look like a saved document.
  const part = new File(folder(), `${doc.id}.part`);
  if (part.exists) part.delete();
  await File.downloadFileAsync(`${link.baseUrl}/api/documents/${doc.id}/file/`, part, {
    headers: { Authorization: `Token ${link.token}` },
  });
  await part.move(file);
  return file;
}

/** Opens the document in the phone's own viewer, downloading it first if needed. */
export async function openDocument(doc: WebDocument): Promise<void> {
  const file = await saveDocument(doc);
  const type = MIME[extension(doc)] ?? '*/*';
  if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: lets the viewer read this one file
    });
  } else {
    await Sharing.shareAsync(file.uri, { mimeType: type });
  }
}
