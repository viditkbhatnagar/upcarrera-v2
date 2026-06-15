import { PartialType } from '@nestjs/mapped-types';
import { CreateCourseDto } from './create-course.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
