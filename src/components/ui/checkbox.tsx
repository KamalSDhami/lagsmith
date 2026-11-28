export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange?.(e.currentTarget.checked)}
      className="size-[1.125rem] shrink-0 cursor-pointer rounded accent-accent-bar disabled:cursor-default disabled:opacity-50"
    />
  );
}
