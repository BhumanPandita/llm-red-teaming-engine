"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEVERITY_COLORS } from "@/lib/api";
import type { CampaignSummary } from "@/lib/types";

export function SeverityChart({ summary }: { summary: CampaignSummary }) {
  const data = (["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"] as const).map((sev) => ({
    name: sev,
    count: summary.severity_counts[sev] ?? 0,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(124,92,255,0.08)" }}
            contentStyle={{
              background: "#13161d",
              border: "1px solid #242935",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={SEVERITY_COLORS[d.name]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
