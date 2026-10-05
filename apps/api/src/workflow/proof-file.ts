import { BadRequestException } from '@nestjs/common';
import type { UploadedFileType } from '../files/uploaded-file.type';

/** Payment proofs: PDF / JPG / PNG only, 5 MB max (same ceiling as avatars). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Sniff the real type of an upload from its magic bytes — never trust the
 * client-supplied mimetype or extension. Returns the canonical content-type or
 * null when the bytes are not an accepted proof format.
 */
export function sniffProofMime(buffer: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf'; // %PDF
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/** Validate a proof upload, returning the sniffed mime. Throws 400 on any failure. */
export function validateProof(file: UploadedFileType | undefined): {
  mime: 'application/pdf' | 'image/png' | 'image/jpeg';
} {
  if (!file?.buffer?.length) {
    throw new BadRequestException('A payment proof file is required');
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new BadRequestException('Payment proof must be 5MB or smaller');
  }
  const mime = sniffProofMime(file.buffer);
  if (!mime) {
    throw new BadRequestException('Payment proof must be a PDF, JPG or PNG file');
  }
  return { mime };
}
