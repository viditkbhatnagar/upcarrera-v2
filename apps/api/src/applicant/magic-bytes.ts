/**
 * Content-type sniffing by MAGIC BYTES for applicant uploads. The client-supplied
 * Content-Type / filename extension is NEVER trusted: an HTML or script payload
 * renamed `photo.pdf` is rejected (415) because its leading bytes do not match.
 *
 * Allowed kinds (the only ones the admissions form accepts): PDF, JPEG, PNG.
 */
export type SniffedMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

interface Signature {
  mime: SniffedMime;
  /** Byte sequence that must appear at offset 0. */
  bytes: readonly number[];
}

// %PDF-  |  JPEG SOI + marker  |  PNG 8-byte signature
const SIGNATURES: readonly Signature[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const;

/** The MIME a buffer's leading bytes actually declare, or null if unsupported. */
export function sniffMime(buffer: Buffer): SniffedMime | null {
  if (!buffer || buffer.length < 3) return null;
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return null;
}

/** The lower-cased file extension the sniffed MIME must agree with. */
export function extensionFor(mime: SniffedMime): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf';
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
  }
}

/** True when a client extension is consistent with the sniffed MIME. */
export function extensionMatchesMime(originalName: string, mime: SniffedMime): boolean {
  const lower = (originalName ?? '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot) : '';
  if (mime === 'image/jpeg') return ext === '.jpg' || ext === '.jpeg';
  return ext === extensionFor(mime);
}
