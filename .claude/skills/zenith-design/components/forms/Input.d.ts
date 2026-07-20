import * as React from "react";

/**
 * Zenith form primitives — labeled Input, Textarea, Select, and Checkbox that
 * share the hairline-on-sunken field style with a gold focus ring. Each pairs a
 * `label` and optional `hint` with the control; pass native props through.
 */
export interface FieldBaseProps {
  /** Field label rendered above the control. */
  label?: string;
  /** Muted helper line below the control. */
  hint?: string;
  /** id wired to the label's htmlFor. */
  id?: string;
}

export interface InputProps extends FieldBaseProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {}
export function Input(props: InputProps): React.JSX.Element;

export interface TextareaProps extends FieldBaseProps, Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {}
export function Textarea(props: TextareaProps): React.JSX.Element;

export interface SelectProps extends FieldBaseProps, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  /** Convenience options; strings or {value,label}. Ignored if children given. */
  options?: Array<string | { value: string; label: string }>;
}
export function Select(props: SelectProps): React.JSX.Element;

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  /** Inline label to the right of the box. */
  label?: string;
  id?: string;
}
export function Checkbox(props: CheckboxProps): React.JSX.Element;

export interface SwitchProps extends Omit<React.HTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** Label + optional hint, laid out left of the toggle. */
  label?: string;
  hint?: string;
  /** Controlled on/off. */
  checked?: boolean;
  /** Uncontrolled initial state. */
  defaultChecked?: boolean;
  /** Fires with the next boolean state. */
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}
export function Switch(props: SwitchProps): React.JSX.Element;

export interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  label?: string;
  /** Shared input name. */
  name?: string;
  /** Controlled selected value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Fires with the newly selected value. */
  onChange?: (value: string) => void;
  /** Choices — strings or {value,label}. */
  options?: Array<string | { value: string; label: string }>;
  /** Inline layout instead of stacked. */
  row?: boolean;
}
export function RadioGroup(props: RadioGroupProps): React.JSX.Element;
