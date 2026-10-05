/** Trim an employee code before validation; non-strings pass through to fail IsString. */
export function trimEmployeeCode({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
