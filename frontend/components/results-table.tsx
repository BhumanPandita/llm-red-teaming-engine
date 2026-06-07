"use client";

import { Fragment, useMemo, useState } from "react";
import clsx from "clsx";
import { SeverityBadge } from "./severity-badge";
import type { Evaluation, Severity } from "@/lib/types";

const SEV_RANK: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

export function ResultsTable({ evaluations }: { evaluations: Evaluation[] }) {
  const [filter, setFilter] = useState<"all" | "leaks">("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = useMemo(() => {
    const base = filter === "leaks" ? evaluations.filter((e) => e.leaked) : evaluations;
    return [...base].sort(
      (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.final_score - a.final_score,
    );
  }, [evaluations, filter]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? "result" : "results"}
          {filter === "leaks" && " (leaks only)"}
        </div>
        <div className="flex rounded-md border border-border bg-panel2 p-0.5 text-xs">
          {(["all", "leaks"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={clsx(
                "rounded px-3 py-1 font-mono transition",
                filter === v ? "bg-accent/20 text-text" : "text-muted hover:text-text",
              )}
            >
              {v === "all" ? "all" : "leaks only"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-[100px] px-4 py-2.5 text-left font-medium">Severity</th>
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="w-[80px] px-4 py-2.5 text-right font-medium">Score</th>
              <th className="w-[80px] px-4 py-2.5 text-right font-medium">Leaked</th>
              <th className="px-4 py-2.5 text-left font-medium">Prompt (hover to expand)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No results match this filter.
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const open = expanded === e.eval_id;
              return (
                <Fragment key={e.eval_id}>
                  <tr
                    onClick={() => setExpanded(open ? null : e.eval_id)}
                    className="cursor-pointer border-t border-border transition hover:bg-panel2/60"
                  >
                    <td className="px-4 py-3">
                      <SeverityBadge severity={e.severity} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {e.category.replace(/_/g, " ")}
                      <span className="ml-2 inline-block rounded bg-panel2 px-1.5 py-0.5 text-[10px] uppercase">
                        {e.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {e.final_score.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {e.leaked ? (
                        <span className="text-critical">●</span>
                      ) : (
                        <span className="text-none">○</span>
                      )}
                    </td>
                    <td className="max-w-0 truncate px-4 py-3 font-mono text-xs text-muted">
                      {e.prompt}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t border-border bg-panel2/30">
                      <td colSpan={5} className="px-4 py-4">
                        <DetailPanel ev={e} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailPanel({ ev }: { ev: Evaluation }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Attack prompt</div>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg p-3 font-mono text-xs text-text/90">
          {ev.prompt}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Target response</div>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg p-3 font-mono text-xs text-text/90">
          {ev.response_text ?? "(no response / error)"}
        </pre>
      </div>
      <div className="md:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Heuristic" value={ev.heuristic_score.toFixed(2)} />
        <Stat label="Semantic" value={ev.semantic_score.toFixed(2)} />
        <Stat label="Final" value={ev.final_score.toFixed(2)} />
        <Stat
          label="Latency"
          value={ev.wall_latency_ms != null ? `${ev.wall_latency_ms.toFixed(0)} ms` : "—"}
        />
      </div>
      {ev.evidence && ev.evidence !== "None" && (
        <div className="md:col-span-2">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Judge evidence</div>
          <div className="rounded-md border border-medium/30 bg-medium/5 p-3 text-xs text-text/90">
            {ev.evidence}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
