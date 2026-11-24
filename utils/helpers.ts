export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** The number printed on a report: the second it was created (ids start with the time in milliseconds). */
export function reportNumber(id: string): string {
  return id.slice(2, 10);
}

export function formatDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 text (with or without a "data:image/png;base64," prefix) to bytes, to write a picture to a file. */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const char of clean) {
    value = (value << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at++] = (value >> bits) & 0xff;
    }
  }
  return bytes;
}

export function isReportLocked(status: string): boolean {
  return status === 'locked';
}

export function hasValue(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}
