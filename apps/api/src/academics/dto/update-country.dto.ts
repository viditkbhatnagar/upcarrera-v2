import { PartialType } from '@nestjs/mapped-types';
import { CreateCountryDto } from './create-country.dto';

/** Every field optional on edit. */
export class UpdateCountryDto extends PartialType(CreateCountryDto) {}
