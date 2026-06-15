import type { ReactNode } from "react";

/**
 * Shared field chrome: label, required marker, optional hint, and a per-field
 * error message. All form inputs (TextInput, SelectInput, TextareaInput) wrap
 * their control in this so spacing, label styling, and error treatment stay
 * identical across the form.
 */
export interface FieldProps {
  /** Visible label text. */
  label: string;
  /** Form control id — wired to the `<label htmlFor>` for accessibility. */
  htmlFor: string;
  /** Show a coral required asterisk. */
  required?: boolean;
  /** Helper text shown under the control when there is no error. */
  hint?: string;
  /** Field-level error message; overrides `hint` and tints the control red. */
  error?: string;
  /** The control element. */
  children: ReactNode;
  className?: string;
}

export default function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-ink"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-accent" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-accent-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Shared Tailwind classes for the actual control elements. Inputs/selects/
 * textareas all share this so focus rings and borders match. Pass
 * `hasError` to switch to the red border treatment.
 */
export function controlClasses(hasError: boolean): string {
  return [
    "w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink",
    "placeholder:text-ink-400 transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
    "disabled:cursor-not-allowed disabled:opacity-60",
    hasError
      ? "border-accent/50 focus-visible:ring-accent/40"
      : "border-ink/10 hover:border-ink/20 focus-visible:ring-accent/40 focus-visible:border-accent/40",
  ].join(" ");
}
