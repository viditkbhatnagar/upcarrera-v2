import { CreateIntakeSessionDto } from './create-intake-session.dto';

/**
 * PATCH /intakes/sessions/:id — renaming is the only edit a `sessions` row
 * supports, so the title stays required (an empty body is not a valid rename).
 */
export class UpdateIntakeSessionDto extends CreateIntakeSessionDto {}
