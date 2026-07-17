import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
  secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300 focus-visible:ring-slate-400",
  ghost: "bg-transparent text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-300",
};

/**
 * Foundational button. The Phase-4 Design System (P4-D01) replaces the inline
 * variant map with design tokens; the public contract stays stable.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
});
