import { PartialType } from '@nestjs/mapped-types';
import { CreateHomeworkDto } from './create-homework.dto';

/** PATCH body for a homework row — all CreateHomeworkDto fields, all optional. */
export class UpdateHomeworkDto extends PartialType(CreateHomeworkDto) {}
