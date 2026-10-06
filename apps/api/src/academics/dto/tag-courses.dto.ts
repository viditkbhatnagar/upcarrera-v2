import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One course to tag onto a university (POST /universities/:id/courses).
 * `university_course_name` / `_code` are the university's OWN label for the
 * programme; NULL/omitted means "use course.title".
 */
export class TagCourseItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  course_id!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  university_course_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  university_course_code?: string;
}

/** Body for POST /universities/:id/courses — tag one or more courses at once. */
export class TagCoursesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TagCourseItemDto)
  items!: TagCourseItemDto[];
}
