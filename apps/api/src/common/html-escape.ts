/**
 * HTML-escape a value before it is substituted into an email template
 * (CRITIQUE #14, SECURITY MEDIUM 2). Student-typed names/fields flow into
 * counsellor-facing emails, and staff-typed reopen/reject reasons flow into
 * student-facing emails; both paths MUST escape so a `<script>`/`<img onerror>`
 * in a value can never render in a recipient's mail client.
 *
 * EmailTemplatesService.render() now calls this for EVERY placeholder by default
 * (with a small allowlist of system-generated URL keys that stay raw), so callers
 * pass values RAW and never double-escape. NEVER escape a system-generated URL
 * (e.g. the magic link): escaping an href would corrupt it. The raw token is
 * base64url (no HTML-special chars), so the link needs no escaping.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape every value of a flat record (convenience for email var maps). */
export function escapeAll(
  vars: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = escapeHtml(v);
  return out;
}
