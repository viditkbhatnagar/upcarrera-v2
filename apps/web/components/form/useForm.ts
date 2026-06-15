"use client";

import { useCallback, useState } from "react";

/**
 * Tiny controlled-form helper. Keeps a `values` record of strings (form fields
 * are always strings — selects store `""` when unset) plus a per-field error
 * map, and exposes a `field(name)` binder that wires `value`/`onChange`/`error`
 * straight onto a TextInput/SelectInput/TextareaInput.
 *
 * Submission, payload coercion, and API calls stay in the page — this only owns
 * the controlled UI state. Keep it deliberately small (YAGNI): no schema, no
 * async, no touched tracking.
 */
export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export interface FieldBinding {
  id: string;
  name: string;
  value: string;
  error?: string;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
}

export interface UseFormReturn {
  values: FormValues;
  errors: FormErrors;
  /** Bind a field by name onto an input component. */
  field: (name: string) => FieldBinding;
  /** Set one value imperatively (e.g. when hydrating from a fetched record). */
  setValue: (name: string, value: string) => void;
  /** Replace all values at once (e.g. prefill an edit form). */
  setValues: (values: FormValues) => void;
  /** Set the full error map (e.g. from a validation pass). */
  setErrors: (errors: FormErrors) => void;
  /** Clear every error. */
  clearErrors: () => void;
}

export function useForm(initial: FormValues = {}): UseFormReturn {
  const [values, setValuesState] = useState<FormValues>(initial);
  const [errors, setErrorsState] = useState<FormErrors>({});

  const setValue = useCallback((name: string, value: string) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setValues = useCallback((next: FormValues) => {
    setValuesState(next);
  }, []);

  const setErrors = useCallback((next: FormErrors) => {
    setErrorsState(next);
  }, []);

  const clearErrors = useCallback(() => setErrorsState({}), []);

  const field = useCallback(
    (name: string): FieldBinding => ({
      id: name,
      name,
      value: values[name] ?? "",
      error: errors[name],
      onChange: (e) => {
        const value = e.target.value;
        setValuesState((prev) => ({ ...prev, [name]: value }));
        // Clear this field's error as soon as the user edits it.
        setErrorsState((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      },
    }),
    [values, errors],
  );

  return {
    values,
    errors,
    field,
    setValue,
    setValues,
    setErrors,
    clearErrors,
  };
}

/**
 * Coerce a string form value into a number, or `undefined` when blank.
 * Use when building the API payload for int FK fields.
 */
export function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

/** Trim a string value, returning `undefined` when blank. */
export function toText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
