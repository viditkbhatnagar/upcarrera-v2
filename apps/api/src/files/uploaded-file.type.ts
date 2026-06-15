/**
 * Minimal shape of a multer-parsed upload.
 *
 * `@types/multer` is NOT installed in this workspace (multer itself ships no
 * type definitions), so the global `Express.Multer.File` namespace does not
 * exist and cannot be referenced without a compile error. We declare just the
 * fields this module reads. The runtime object provided by FileInterceptor with
 * the default memory storage carries all of these.
 */
export interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  /** Present with memoryStorage (FileInterceptor's default). */
  buffer: Buffer;
}
