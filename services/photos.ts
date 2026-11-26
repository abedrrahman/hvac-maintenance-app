/**
 * Report pictures (site photos and the brand logo) live in the app's own folder.
 * The camera and gallery hand back a file in the cache, which Android may empty at any time.
 */
import { getDatabase } from '@/db/database';
import { generateId } from '@/utils/helpers';
import { Directory, File, Paths } from 'expo-file-system';

function folder(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a picture into the app's folder and returns its new address. */
export async function keepPicture(uri: string): Promise<string> {
  const source = new File(uri);
  const kept = new File(folder(), `${generateId()}${source.extension || '.jpg'}`);
  await source.copy(kept);
  return kept.uri;
}

/** Deletes a picture the app kept. Pictures anywhere else are not the app's to delete. */
export function deletePicture(uri: string | null | undefined): void {
  if (!uri || !uri.startsWith(folder().uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}

/** Pictures saved by earlier versions still sit in the cache: move each one that is still there. */
export async function keepCachedPictures(): Promise<void> {
  const db = getDatabase();
  const inCache = `${Paths.cache.uri}%`;
  const photos = db.getAllSync<{ id: string; uri: string }>('SELECT id, uri FROM photos WHERE uri LIKE ?', [inCache]);
  const logos = db.getAllSync<{ id: string; uri: string }>(
    'SELECT id, logo_uri AS uri FROM reports WHERE logo_uri LIKE ?',
    [inCache],
  );
  for (const [table, column, rows] of [['photos', 'uri', photos], ['reports', 'logo_uri', logos]] as const) {
    for (const row of rows) {
      try {
        if (!new File(row.uri).exists) continue;
        db.runSync(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [await keepPicture(row.uri), row.id]);
      } catch {
        // left where it is; tried again at the next start
      }
    }
  }
}
