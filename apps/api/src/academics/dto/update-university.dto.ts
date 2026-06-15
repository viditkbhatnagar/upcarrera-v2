import { PartialType } from '@nestjs/mapped-types';
import { CreateUniversityDto } from './create-university.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateUniversityDto extends PartialType(CreateUniversityDto) {}
