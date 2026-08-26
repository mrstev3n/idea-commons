import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
} from "react";

export function Field({
  invalid = false,
  disabled = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { invalid?: boolean; disabled?: boolean }) {
  return (
    <div
      className={["ui-field", className].filter(Boolean).join(" ")}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={["ui-field__label", className].filter(Boolean).join(" ")} {...props} />;
}

export function InputGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["ui-input-group", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const InputGroupInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function InputGroupInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={["ui-input-group__input", className].filter(Boolean).join(" ")}
        {...props}
      />
    );
  },
);
