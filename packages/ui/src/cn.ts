import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution. Later conflicting
 * utilities win (e.g. `cn("px-2", "px-4")` → `"px-4"`).
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
