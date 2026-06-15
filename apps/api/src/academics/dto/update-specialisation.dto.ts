import { PartialType } from '@nestjs/mapped-types';
import { CreateSpecialisationDto } from './create-specialisation.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateSpecialisationDto extends PartialType(CreateSpecialisationDto) {}
