import type { InputHTMLAttributes } from "react";
import Field, { controlClasses } from "./Field";

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Field id + label `htmlFor` target. Also used as the `name` if none given. */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Wrapper class (e.g. column span in a FormGrid). */
  wrapperClassName?: string;
}

/**
 * Labelled text input. Use `type="number"`/`type="email"` etc. via the native
 * `type` prop. Value/onChange stay controlled by the parent (plain React state).
 */
export default function TextInput({
  id,
  label,
  required,
  hint,
  error,
  wrapperClassName,
  className = "",
  name,
  ...props
}: TextInputProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <input
        id={id}
        name={name ?? id}
        aria-invalid={error ? true : undefined}
        className={`${controlClasses(Boolean(error))} ${className}`}
        {...props}
      />
    </Field>
  );
}
