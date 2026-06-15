import type { TextareaHTMLAttributes } from "react";
import Field, { controlClasses } from "./Field";

export interface TextareaInputProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

/** Labelled multi-line text input. Defaults to 4 rows. */
export default function TextareaInput({
  id,
  label,
  required,
  hint,
  error,
  wrapperClassName,
  className = "",
  name,
  rows = 4,
  ...props
}: TextareaInputProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <textarea
        id={id}
        name={name ?? id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={`${controlClasses(Boolean(error))} resize-y ${className}`}
        {...props}
      />
    </Field>
  );
}
