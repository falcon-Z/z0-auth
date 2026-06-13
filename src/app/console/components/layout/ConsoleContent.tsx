import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type ConsoleContentWidth = "default" | "wide" | "form";

const WIDTH_CLASS: Record<ConsoleContentWidth, string> = {
  default: "max-w-5xl",
  wide: "max-w-6xl",
  form: "max-w-2xl",
};

type ConsoleContentProps = {
  children: ReactNode;
  width?: ConsoleContentWidth;
  className?: string;
};

export function ConsoleContent({ children, width = "default", className }: ConsoleContentProps) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 md:px-6 md:py-8", WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}
