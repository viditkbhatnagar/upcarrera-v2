import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Query for GET /sessions/zoom-jwt?meeting_number=&role=
 *
 * Port of App\Controllers\Api\Student\Sessions::generate_jwt_token(), which read
 * `meeting_number` off the query string and proxied to an external JWT endpoint.
 * We generate the Meeting SDK signature natively via ZoomService instead.
 *
 * `role` defaults to 0 (attendee); 1 = host. Validated to the two valid roles.
 */
export class MeetingSdkJwtQueryDto {
  @IsNotEmpty()
  @IsString()
  meeting_number!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1], { message: 'role must be 0 (attendee) or 1 (host)' })
  role?: number;
}
