import { IsString } from 'class-validator';

/**
 * PATCH /invoices/:id/due-date — sets invoice.due_date and (re)builds the two
 * invoice_crone_job rows (a 'reminder' 3 days before, a 'due' on the date).
 * Ported from Invoice::update_due / addInvoiceCroneJob.
 */
export class UpdateDueDateDto {
  // ISO date string (YYYY-MM-DD) for the @db.Date column.
  @IsString()
  due_date!: string;
}
