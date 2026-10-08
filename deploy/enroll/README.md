# Self-serve online application form (`/enroll`)

The public online-application **backend is live** (`admin.upcarrera.com` /
`admissions.upcarrera.com`):

- `GET  /api/public/intake/catalogue` → `{ data: { universities[], document_rules{} } }`
- `POST /api/public/intake/applications` → `{ data: { application_no } }` (multipart)

This hosts **Naji's student application form** as a static page at
`https://admissions.upcarrera.com/enroll`, wired to those two endpoints. The form
file is kept **verbatim** (his photo cropper, signature pad, dropdowns and
validation are untouched) except for the small adaptations below.

## 1. Add the file
Save Naji's HTML to **`deploy/enroll/index.html`** (exact original — do not
reformat). nginx serves it via the `location = /enroll` block in
`deploy/nginx/upcarrera.conf`.

## 2. Apply these adaptations (only these)
In `deploy/enroll/index.html`:

1. **Point CONFIG at the live endpoints** (in the `CONFIG` object near the top of
   the script):
   ```js
   catalogueUrl: '/api/public/intake/catalogue',
   submitUrl:    '/api/public/intake/applications',
   ```

2. **Unwrap the `{ data }` envelope** in `loadCatalogue()` — the API wraps every
   response. Change `catalogue = await r.json();` to:
   ```js
   const json = await r.json();
   catalogue = json.data ?? json;
   ```

3. **Drive documents from the catalogue** (the backend validates docs against
   `document_requirement`). Make `DOCS` and `DOC_GROUPS` reassignable
   (`const` → `let`) and, right after `catalogue` is set in `loadCatalogue()`,
   rebuild them from `catalogue.document_rules` (keyed by the course's
   `document_group` = canonical level `certification|diploma|ug|pg|doctorate`):
   ```js
   const rules = catalogue.document_rules || {};
   DOCS = {}; DOC_GROUPS = {};
   for (const [level, list] of Object.entries(rules)) {
     DOC_GROUPS[level] = list.map((r) => r.slot);           // slot = "doc_<typeId>"
     for (const r of list) DOCS[r.slot] = { label: r.label, hint: r.help_text || '', multi: r.max_files > 1 };
   }
   ```
   The photo (step 2) and signature (step 6) stay separate, exactly as he built them.

4. **Unwrap the submit response** in the submit handler:
   `ref = (await r.json()).application_no;` → `ref = (await r.json()).data.application_no;`

5. **Add the honeypot** — a hidden field the backend uses to silently drop bots.
   Inside `<form id="appForm" ...>` add:
   ```html
   <input type="text" name="company_website" tabindex="-1" autocomplete="off"
          style="position:absolute;left:-9999px" aria-hidden="true">
   ```

6. **Loan documents:** v1 does not accept loan *file* uploads (the backend only
   stores course documents from `document_requirement`). Either remove the loan
   **document** upload card, or leave the "applying for a loan?" question (its
   files are simply ignored by the server). The question value is not persisted
   in v1.

Everything else — field `name`s already match the API (`full_name`,
`date_of_birth`, `gender`, `father_name`, `phone`, `whatsapp`, `email`,
`employment_status`, `university_id`, `course_id`, `intake_id`, `agree_terms`, …).
Extra fields the form sends (university_name, declarations, etc.) are ignored by
the server. Aadhaar is reduced to its last 4 digits server-side; the full number
is never stored.

## 3. Deploy
The live `/etc/nginx/sites-available/upcarrera.conf` was rewritten by **certbot**
to add the TLS (443) server block, so do **NOT** `cp` the repo template over it —
that would drop HTTPS. Instead, add the two new `location` blocks (see
`deploy/nginx/upcarrera.conf`: `location = /api/public/intake/applications` and
`location = /enroll`) **into the live HTTPS (443) server block**, then:
```bash
# on the droplet, as root
cd /opt/upcarrera && git fetch origin main && git reset --hard origin/main   # brings deploy/enroll/index.html
sudo nginx -t && sudo systemctl reload nginx
curl -I https://admissions.upcarrera.com/enroll        # expect 200
```
The static file is read from the git checkout (`/opt/upcarrera/deploy/enroll/index.html`),
so no copy step is needed for it.

## 4. Note — needs master data
Until operations loads the **universities / courses / intakes / offerings** (the
`docs/go-live` templates), `GET /catalogue` returns empty and the form's
dropdowns will be empty. The form is only end-to-end testable once at least one
**open** offering exists. A submitted application becomes an **unassigned lead**
(`source = "Online Application"`, stage `lead_added`, `APP-YYYY-NNNNNN`) for
counsellors to pick up.
