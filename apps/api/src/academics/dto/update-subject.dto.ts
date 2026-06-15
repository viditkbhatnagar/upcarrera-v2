import { PartialType } from '@nestjs/mapped-types';
import { CreateSubjectDto } from './create-subject.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
