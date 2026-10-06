import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/** The subset of the form view the summary PDF renders. */
export interface SummaryView {
  application_id: string;
  program: {
    university: string | null;
    course: string | null;
    specialisation: string | null;
    intake: string | null;
  };
  sections: {
    personal: Record<string, unknown>;
    contact: Record<string, unknown>;
    education: { highest_qualification: string | null; records: Array<Record<string, unknown>> };
    employment: Record<string, unknown> | null;
  };
  eligibility: { status: string | null; detail: string | null };
}

/**
 * Renders the submitted application into a one/two-page summary PDF (pdfkit, no
 * disk I/O) returned as a Buffer so it can be attached to the submitted email. It
 * contains only the student's own data — no internal ids, fees or pipeline fields.
 */
@Injectable()
export class ApplicationPdfService {
  async buildSummary(view: SummaryView): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.render(doc, view);
        doc.end();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  private render(doc: PDFKit.PDFDocument, view: SummaryView): void {
    doc.fontSize(20).fillColor('#0f172a').text('Application Summary', { continued: false });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#64748b').text(`Application ID: ${view.application_id}`);
    doc.moveDown(1);

    this.section(doc, 'Program', [
      ['University', this.s(view.program.university)],
      ['Course', this.s(view.program.course)],
      ['Specialisation', this.s(view.program.specialisation)],
      ['Intake', this.s(view.program.intake)],
    ]);

    const p = view.sections.personal;
    this.section(doc, 'Personal', [
      ['Name on certificate', this.s(p.name_on_certificate)],
      ["Father / Guardian", this.s(p.father_guardian_name)],
      ['Mother', this.s(p.mother_name)],
      ['Date of birth', this.s(p.dob)],
      ['Gender', this.s(p.gender)],
      ['Category', this.s(p.category)],
      ['Marital status', this.s(p.marital_status)],
    ]);

    const c = view.sections.contact;
    this.section(doc, 'Contact', [
      ['Email', this.s(c.email)],
      ['Mobile', this.s(c.phone)],
      ['Alternate phone', this.s(c.second_phone)],
      ['WhatsApp', this.s(c.whatsapp_no)],
      ['Address', this.s(c.address)],
      ['State', this.s(c.state)],
      ['District', this.s(c.district)],
      ['PIN code', this.s(c.pin_code)],
    ]);

    doc.moveDown(0.5).fontSize(13).fillColor('#0f172a').text('Education');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#334155').text(`Highest qualification: ${this.s(view.sections.education.highest_qualification)}`);
    for (const r of view.sections.education.records) {
      doc.moveDown(0.2);
      const score = r.score_value != null ? `${r.score_value} ${this.s(r.score_type)}` : '—';
      doc.text(
        `• ${this.s(r.level_code)} — ${this.s(r.institution)} (${this.s(r.passing_year)}), ${score}`,
      );
    }
    doc.moveDown(0.8);

    if (view.sections.employment) {
      const e = view.sections.employment;
      this.section(doc, 'Employment', [
        ['Status', this.s(e.employment_status)],
        ['Experience (months)', this.s(e.total_experience_months)],
        ['Employer', this.s(e.current_employer)],
        ['Designation', this.s(e.current_designation)],
      ]);
    }

    doc.moveDown(0.5).fontSize(13).fillColor('#0f172a').text('Eligibility');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#334155').text(`${this.s(view.eligibility.status)} — ${this.s(view.eligibility.detail)}`);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').text(
      `Generated ${new Date().toISOString()} — this is a copy of the information you submitted.`,
    );
  }

  private section(doc: PDFKit.PDFDocument, title: string, rows: Array<[string, string]>): void {
    doc.moveDown(0.5).fontSize(13).fillColor('#0f172a').text(title);
    doc.moveDown(0.3).fontSize(10).fillColor('#334155');
    for (const [label, value] of rows) {
      doc.text(`${label}: `, { continued: true }).fillColor('#0f172a').text(value).fillColor('#334155');
    }
    doc.moveDown(0.4);
  }

  private s(value: unknown): string {
    if (value == null || value === '') return '—';
    return String(value);
  }
}
