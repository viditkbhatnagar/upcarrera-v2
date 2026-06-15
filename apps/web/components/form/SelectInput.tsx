import type { SelectHTMLAttributes } from "react";
import Field, { controlClasses } from "./Field";

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectInputProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  options: SelectOption[];
  /** Text for the leading empty option (shown when no value is selected). */
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

/**
 * Labelled native `<select>`. Pass `options` as `{ value, label }[]`. The
 * placeholder renders as a disabled-looking empty option so the field can be
 * "unset" — the parent stores `""` and converts to a number/undefined on submit.
 */
export default function SelectInput({
  id,
  label,
  options,
  placeholder = "Select…",
  required,
  hint,
  error,
  wrapperClassName,
  className = "",
  name,
  ...props
}: SelectInputProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <select
        id={id}
        name={name ?? id}
        aria-invalid={error ? true : undefined}
        className={`${controlClasses(Boolean(error))} appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9 ${className}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%237a7aad' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
