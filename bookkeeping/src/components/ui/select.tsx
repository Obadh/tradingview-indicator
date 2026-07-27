import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native select, styled consistently. Native controls are the most
 * accessible and keyboard-friendly option for plain enum choices.
 */
function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
