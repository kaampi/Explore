import type { InputHTMLAttributes } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "placeholder">;

export function SheetNameField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  ...inputProps
}: Props) {
  return (
    <label className={className ? `studio-sheet__name ${className}` : "studio-sheet__name"}>
      <svg className="studio-sheet__name-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.2 2.3a1.3 1.3 0 0 1 1.9 1.9L5.4 11.9 2.8 12.7l.8-2.6 7.6-7.8Z"
        />
      </svg>
      <input
        className="studio-sheet__title"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...inputProps}
      />
    </label>
  );
}
