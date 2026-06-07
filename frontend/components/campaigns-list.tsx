"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCampaigns } from "@/lib/api";
import type { Campaign } from "@/lib/types";
import clsx from "clsx";

const STATUS_CLASSES: Record<string, string> = {
  pending: "text-muted bg-panel2",
  executing: "text-accent bg-accent/10",
  evaluating: "text-medium bg-medium/10",
  completed: "text-none bg-none/10",
  failed: "text-critical bg-critical/10",
};

export function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listCampaigns();
        if (!cancelled) setCampaigns(data);
      } catch {
        if (!cancelled) setCampaigns([]);
      }
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (campaigns === null) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
        No campaigns yet. Launch one above to see it here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-panel2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">ID</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Started</th>
            <th className="px-4 py-2.5 text-right font-medium">Attacks</th>
            <th className="px-4 py-2.5 text-right font-medium">Leak rate</th>
            <th className="px-4 py-2.5 text-right font-medium">Critical</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr
              key={c.id}
              className="border-t border-border transition hover:bg-panel2/60"
            >
              <td className="px-4 py-3 font-mono text-xs">
                <Link href={`/campaigns/${c.id}`} className="text-accent hover:underline">
                  {c.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "inline-flex items-center rounded px-2 py-0.5 font-mono text-xs",
                    STATUS_CLASSES[c.status],
                  )}
                >
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted">
                {new Date(c.started_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {c.summary?.total_attacks ?? "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {c.summary
                  ? `${(c.summary.leak_rate * 100).toFixed(0)}%`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {c.summary?.severity_counts.CRITICAL ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
