import { PartialType } from '@nestjs/mapped-types';
import { CreateVisaTypeDto } from './create-visa-type.dto';

/** Every field optional on edit. */
export class UpdateVisaTypeDto extends PartialType(CreateVisaTypeDto) {}
