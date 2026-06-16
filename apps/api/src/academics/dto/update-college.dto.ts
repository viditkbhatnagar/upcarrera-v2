import { PartialType } from '@nestjs/mapped-types';
import { CreateCollegeDto } from './create-college.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateCollegeDto extends PartialType(CreateCollegeDto) {}
