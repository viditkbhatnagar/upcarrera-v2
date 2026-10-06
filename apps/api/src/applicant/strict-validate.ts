import { BadRequestException } from '@nestjs/common';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

/**
 * Validate the nested `data` object of a public section save against a section
 * DTO, with the SAME strictness the route pipe applies to the envelope:
 * whitelist + forbidNonWhitelisted (an unknown field is a 400, not silently
 * dropped). Returns the transformed, whitelisted instance.
 *
 * Used because the section's `data` shape depends on the :section route param, so
 * it cannot be a single statically-typed field on the envelope DTO.
 */
export function validateStrict<T extends object>(
  cls: ClassConstructor<T>,
  plain: unknown,
): T {
  if (plain === null || typeof plain !== 'object' || Array.isArray(plain)) {
    throw new BadRequestException('Section data must be an object.');
  }
  const instance = plainToInstance(cls, plain, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length) {
    throw new BadRequestException(flattenErrors(errors));
  }
  return instance;
}

function flattenErrors(errors: ValidationError[]): string {
  const messages: string[] = [];
  const walk = (errs: ValidationError[]): void => {
    for (const e of errs) {
      if (e.constraints) messages.push(...Object.values(e.constraints));
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  return messages[0] ?? 'Invalid section data.';
}
