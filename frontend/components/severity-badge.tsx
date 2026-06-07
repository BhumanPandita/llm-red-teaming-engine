import clsx from "clsx";
import type { Severity } from "@/lib/types";

const CLASSES: Record<Severity, string> = {
  CRITICAL: "bg-critical/15 text-critical border-critical/40",
  HIGH: "bg-high/15 text-high border-high/40",
  MEDIUM: "bg-medium/15 text-medium border-medium/40",
  LOW: "bg-low/15 text-low border-low/40",
  NONE: "bg-none/15 text-none border-none/40",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold",
        CLASSES[severity],
      )}
    >
      {severity}
    </span>
  );
}
