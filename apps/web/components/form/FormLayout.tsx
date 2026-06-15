import type { FormHTMLAttributes, ReactNode } from "react";

/**
 * Layout primitives for forms.
 *
 * - `FormGrid` — a responsive 2-column grid; fields can span both columns with
 *   the `col-span-full` Tailwind class on their `wrapperClassName`.
 * - `FormRow`  — a single full-width row (e.g. a textarea spanning everything).
 * - `FormActions` — the submit/cancel footer, right-aligned, with a divider.
 */

export interface FormGridProps extends FormHTMLAttributes<HTMLFormElement> {
  children: ReactNode;
}

/** A `<form>` whose direct children lay out in a responsive 2-col grid. */
export function FormGrid({ children, className = "", ...props }: FormGridProps) {
  return (
    <form
      className={`grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 ${className}`}
      {...props}
    >
      {children}
    </form>
  );
}

/** A full-width row inside a FormGrid (spans both columns). */
export function FormRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`col-span-full ${className}`}>{children}</div>;
}

export interface FormActionsProps {
  children: ReactNode;
  className?: string;
}

/** Right-aligned action footer (Cancel + Submit), separated by a top divider. */
export function FormActions({ children, className = "" }: FormActionsProps) {
  return (
    <div
      className={`col-span-full mt-2 flex items-center justify-end gap-3 border-t border-ink/[0.07] pt-5 ${className}`}
    >
      {children}
    </div>
  );
}
