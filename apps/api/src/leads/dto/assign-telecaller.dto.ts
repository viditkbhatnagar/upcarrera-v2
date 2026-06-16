import { IsInt, IsNotEmpty } from 'class-validator';

/**
 * Body for PATCH /leads/:id/telecaller — port of Leads::update_telecaller.
 * Reassigns the lead's owning telecaller.
 */
export class AssignTelecallerDto {
  @IsInt()
  @IsNotEmpty()
  telecaller_id!: number;
}
