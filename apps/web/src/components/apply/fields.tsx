import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared input styling for the applicant form (mobile-first, 16px to avoid iOS zoom). */
export const inputCls =
  "w-full rounded-xl border border-border bg-background px-3.5 py-3 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

interface FieldRowProps {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FieldRow({ label, htmlFor, error, required, hint, children, className }: FieldRowProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface NativeSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

/** A styled native <select> — robust across mobile browsers and fully keyboard-accessible. */
export function NativeSelect({ id, value, onChange, options, placeholder, disabled }: NativeSelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, "appearance-none bg-no-repeat pr-10")}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.75rem center",
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <header className="mb-5">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}
