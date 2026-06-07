"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCampaign, openEventStream } from "@/lib/api";
import {
  INITIAL_LIVE,
  LiveProgress,
  type LiveState,
  reduceEvent,
} from "@/components/live-progress";
import { SeverityChart } from "@/components/severity-chart";
import { CategoryChart } from "@/components/category-chart";
import { ResultsTable } from "@/components/results-table";
import type { Campaign, StreamEvent } from "@/lib/types";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [live, setLive] = useState<LiveState>(INITIAL_LIVE);

  // Initial fetch + poll every 3s as a safety net for SSE reconnection gaps
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const c = await getCampaign(id);
        if (!cancelled) setCampaign(c);
      } catch {
        /* ignore */
      }
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  // Stream live events
  useEffect(() => {
    const es = openEventStream(id);
    es.onmessage = (msg) => {
      try {
        const ev: StreamEvent = JSON.parse(msg.data);
        if (ev.type === "stream_end") {
          es.close();
          return;
        }
        setLive((prev) => reduceEvent(prev, ev));
      } catch {
        /* ignore parse error */
      }
    };
    es.onerror = () => {
      // Browser will auto-reconnect; close if campaign is already done
      if (campaign?.status === "completed" || campaign?.status === "failed") {
        es.close();
      }
    };
    return () => es.close();
  }, [id, campaign?.status]);

  const isDone = campaign?.status === "completed" || campaign?.status === "failed";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-accent hover:underline">
            ← back to dashboard
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Campaign</h1>
          <div className="font-mono text-xs text-muted">{id}</div>
        </div>
        {campaign && (
          <div className="text-right text-xs text-muted">
            <div>Started {new Date(campaign.started_at).toLocaleString()}</div>
            {campaign.completed_at && (
              <div>Completed {new Date(campaign.completed_at).toLocaleString()}</div>
            )}
          </div>
        )}
      </div>

      {/* Live phase — always visible, hides progress bars once done */}
      <section className="rounded-xl border border-border bg-panel p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Progress
        </h2>
        <LiveProgress state={live} />
      </section>

      {campaign?.summary && (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total attacks"
              value={String(campaign.summary.total_attacks)}
            />
            <StatCard
              label="Leak rate"
              value={`${(campaign.summary.leak_rate * 100).toFixed(0)}%`}
              tone={campaign.summary.leak_rate > 0.3 ? "bad" : undefined}
            />
            <StatCard
              label="Avg score"
              value={campaign.summary.avg_score.toFixed(2)}
            />
            <StatCard
              label="Critical findings"
              value={String(campaign.summary.severity_counts.CRITICAL)}
              tone={campaign.summary.severity_counts.CRITICAL > 0 ? "bad" : undefined}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Severity distribution">
              <SeverityChart summary={campaign.summary} />
            </ChartCard>
            <ChartCard title="Severity by category">
              <CategoryChart summary={campaign.summary} />
            </ChartCard>
          </section>
        </>
      )}

      {isDone && campaign?.evaluations && campaign.evaluations.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Detailed results</h2>
          <ResultsTable evaluations={campaign.evaluations} />
        </section>
      )}

      {campaign?.status === "failed" && (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
          <div className="mb-1 font-semibold">Campaign failed</div>
          <div>{campaign.error ?? "Unknown error"}</div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={
          "mt-1 font-mono text-2xl " + (tone === "bad" ? "text-critical" : "text-text")
        }
      >
        {value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}
