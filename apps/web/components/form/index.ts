/**
 * Form primitives for the staff console. Import from "@/components/form".
 *
 * Controls: TextInput, SelectInput, TextareaInput — all labelled, controlled,
 * and sharing the same focus/error treatment via the internal Field wrapper.
 * Layout: FormGrid (responsive 2-col `<form>`), FormRow (full-width row),
 * FormActions (right-aligned submit/cancel footer).
 * State: useForm() controlled-state helper + toNumber/toText payload coercers.
 */
export { default as TextInput } from "./TextInput";
export type { TextInputProps } from "./TextInput";

export { default as SelectInput } from "./SelectInput";
export type { SelectInputProps, SelectOption } from "./SelectInput";

export { default as TextareaInput } from "./TextareaInput";
export type { TextareaInputProps } from "./TextareaInput";

export { default as Field, controlClasses } from "./Field";
export type { FieldProps } from "./Field";

export { FormGrid, FormRow, FormActions } from "./FormLayout";
export type { FormGridProps, FormActionsProps } from "./FormLayout";

export { useForm, toNumber, toText } from "./useForm";
export type {
  UseFormReturn,
  FieldBinding,
  FormValues,
  FormErrors,
} from "./useForm";
