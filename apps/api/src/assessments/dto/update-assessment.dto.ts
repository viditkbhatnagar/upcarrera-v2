import { PartialType } from '@nestjs/mapped-types';
import { CreateAssessmentDto } from './create-assessment.dto';

/** PATCH body for an assessment — all CreateAssessmentDto fields, all optional. */
export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}
