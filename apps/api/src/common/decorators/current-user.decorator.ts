import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the authenticated user (or one of its fields) from the JWT. */
export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return data ? request.user?.[data] : request.user;
});
