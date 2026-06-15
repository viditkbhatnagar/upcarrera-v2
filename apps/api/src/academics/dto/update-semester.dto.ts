import { PartialType } from '@nestjs/mapped-types';
import { CreateSemesterDto } from './create-semester.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateSemesterDto extends PartialType(CreateSemesterDto) {}
