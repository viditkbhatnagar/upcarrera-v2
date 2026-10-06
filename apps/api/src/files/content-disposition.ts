/**
 * Build a header-safe `Content-Disposition` value for a file download
 * (SECURITY LOW 6).
 *
 * A student/counsellor-supplied `original_name` can contain CR/LF, quotes,
 * backslashes or non-ASCII bytes. Interpolated straight into the header
 * (`filename="<name>"`) these make `res.set()` throw — a PERMANENT 500 on every
 * download of that file — or risk header injection. We emit BOTH:
 *   - a sanitised ASCII `filename="…"` fallback (control chars, quotes and
 *     backslashes removed; any remaining non-ASCII byte replaced with `_`), and
 *   - an RFC 5987 `filename*=UTF-8''<pct-encoded>` carrying the exact UTF-8 name
 *     for clients that understand it.
 *
 * The result is always a valid header value, whatever the stored name.
 */
export function contentDisposition(
  filename: string | null | undefined,
  disposition: 'inline' | 'attachment' = 'inline',
): string {
  const raw = (filename ?? '').toString();

  // ASCII quoted-string fallback: strip the bytes that break the header or the
  // quoted-string grammar, then map any remaining non-ASCII byte to `_`.
  const ascii = raw
    .replace(/[\u0000-\u001f\u007f]/g, '') // control chars incl CR/LF/TAB
    .replace(/["\\]/g, '') // quote + backslash end/escape the quoted-string
    .replace(/[^\u0020-\u007e]/g, '_') // any remaining non-ASCII byte
    .trim();
  const safeAscii = ascii.length > 0 ? ascii : 'download';

  // RFC 5987 ext-value: percent-encode, then also encode the chars
  // encodeURIComponent leaves that are NOT attr-char (`*`, `'`, `(`, `)`).
  const encoded =
    encodeURIComponent(raw).replace(
      /[*'()]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    ) || 'download';

  return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}
