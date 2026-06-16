import { extname } from 'node:path';

/**
 * Dependency-free extension -> MIME map for the secure file-serve endpoint.
 *
 * The project ships no `mime-types` package (and the task forbids installs), so
 * this small table covers the file kinds the legacy upload flows actually
 * produce (documents, images, archives). Anything unrecognised falls back to
 * `application/octet-stream`, which is the safe default that triggers a download
 * rather than inline rendering — mirroring the legacy mime_content_type() intent
 * without ever guessing an executable/HTML type for unknown content.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.json': 'application/json',
};

/** Default for unknown extensions: forces a download, never inline execution. */
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** Resolve a stored file path to a safe Content-Type for the download response. */
export function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? DEFAULT_CONTENT_TYPE;
}
