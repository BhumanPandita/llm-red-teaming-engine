"use client";

import clsx from "clsx";
import { SeverityBadge } from "./severity-badge";
import type { Severity, StreamEvent } from "@/lib/types";

const PHASE_LABELS: Record<string, string> = {
  pending: "Queued",
  executing: "Phase 1 — Firing attacks at target",
  evaluating: "Phase 2 — Judging responses",
  completed: "Complete",
  failed: "Failed",
};

export interface LiveState {
  phase: string;
  dispatched: number;
  attackCompleted: number;
  attackTotal: number;
  evalCompleted: number;
  evalTotal: number;
  severityCounts: Record<Severity, number>;
  feed: StreamEvent[];
  error: string | null;
}

export const INITIAL_LIVE: LiveState = {
  phase: "pending",
  dispatched: 0,
  attackCompleted: 0,
  attackTotal: 0,
  evalCompleted: 0,
  evalTotal: 0,
  severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 },
  feed: [],
  error: null,
};

export function reduceEvent(state: LiveState, ev: StreamEvent): LiveState {
  const d = ev.data as any;
  switch (ev.type) {
    case "status":
      return { ...state, phase: d.status };
    case "attack_dispatched":
      return { ...state, dispatched: state.dispatched + 1 };
    case "attack_completed":
      return {
        ...state,
        attackCompleted: d.completed,
        attackTotal: Math.max(state.attackTotal, d.total),
        feed: [ev, ...state.feed].slice(0, 25),
      };
    case "execution_complete":
      return { ...state, attackTotal: d.total };
    case "evaluation_start":
      return { ...state, evalTotal: d.total };
    case "evaluation_completed": {
      const next: Record<Severity, number> = { ...state.severityCounts };
      next[d.severity as Severity] = (next[d.severity as Severity] ?? 0) + 1;
      return {
        ...state,
        evalCompleted: d.completed,
        severityCounts: next,
        feed: [ev, ...state.feed].slice(0, 25),
      };
    }
    case "campaign_complete":
      return { ...state, phase: "completed" };
    case "error":
      return { ...state, phase: "failed", error: d.message };
    default:
      return state;
  }
}

export function LiveProgress({ state }: { state: LiveState }) {
  const attackPct =
    state.attackTotal > 0
      ? Math.min(100, (state.attackCompleted / state.attackTotal) * 100)
      : state.dispatched > 0
        ? 5
        : 0;
  const evalPct =
    state.evalTotal > 0 ? (state.evalCompleted / state.evalTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PhaseDot phase={state.phase} />
        <div>
          <div className="text-sm font-medium">{PHASE_LABELS[state.phase] ?? state.phase}</div>
          <div className="text-xs text-muted">
            {state.attackCompleted}/{state.attackTotal || "?"} attacks
            {" · "}
            {state.evalCompleted}/{state.evalTotal || "?"} evaluated
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Attacks</span>
          <span className="font-mono">
            {state.attackCompleted}/{state.attackTotal || "?"}
          </span>
        </div>
        <Bar pct={attackPct} color="bg-accent" />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Evaluations</span>
          <span className="font-mono">
            {state.evalCompleted}/{state.evalTotal || "?"}
          </span>
        </div>
        <Bar pct={evalPct} color="bg-medium" />
      </div>

      {state.feed.length > 0 && (
        <div className="max-h-60 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-xs">
          {state.feed.map((ev, idx) => (
            <FeedRow key={idx} ev={ev} />
          ))}
        </div>
      )}

      {state.error && (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
          {state.error}
        </div>
      )}
    </div>
  );
}

function PhaseDot({ phase }: { phase: string }) {
  return (
    <span
      className={clsx(
        "inline-block h-2.5 w-2.5 rounded-full",
        phase === "executing" && "animate-pulse bg-accent",
        phase === "evaluating" && "animate-pulse bg-medium",
        phase === "completed" && "bg-none",
        phase === "failed" && "bg-critical",
        phase === "pending" && "bg-muted",
      )}
    />
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
      <div
        className={clsx("h-full transition-all duration-300", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FeedRow({ ev }: { ev: StreamEvent }) {
  const d = ev.data as any;
  if (ev.type === "attack_completed") {
    return (
      <div className="flex items-center justify-between border-b border-border/40 py-1 last:border-0">
        <div className="truncate text-muted">
          <span className="text-text">#{d.task_index}</span>{" "}
          <span className="text-[10px] uppercase">[{d.category}]</span>{" "}
          {d.status === "error" ? (
            <span className="text-critical">error</span>
          ) : (
            <span className="text-none">ok</span>
          )}
        </div>
        <span className="text-muted">{Number(d.latency_ms).toFixed(0)}ms</span>
      </div>
    );
  }
  if (ev.type === "evaluation_completed") {
    return (
      <div className="flex items-center gap-2 border-b border-border/40 py-1 last:border-0">
        <SeverityBadge severity={d.severity} />
        <span className="text-muted">{d.category}</span>
        <span className="ml-auto text-muted">score {Number(d.final_score).toFixed(2)}</span>
      </div>
    );
  }
  return null;
}
