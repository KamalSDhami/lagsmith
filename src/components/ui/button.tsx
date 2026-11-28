import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "outline" | "ghost" | "link" | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

/** One filled primary per page state (spec 4.3). Destructive is an outline with danger text. */
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover disabled:bg-primary-off disabled:text-primary-ink",
  outline: "border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-50",
  ghost: "text-ink hover:bg-subtle disabled:opacity-50",
  link: "text-accent underline-offset-2 hover:underline px-0 h-auto",
  destructive: "border border-line bg-surface text-danger hover:bg-danger-soft disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-secondary gap-1.5 rounded-[8px]",
  md: "h-10 px-4 text-body gap-2 rounded-[10px]",
  lg: "h-12 px-6 text-card gap-2.5 rounded-[10px]",
  icon: "size-10 rounded-[10px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors",
        variants[variant],
        variant !== "link" && sizes[size],
        variant === "link" && "text-secondary",
        className,
      )}
      {...props}
    />
  );
}
