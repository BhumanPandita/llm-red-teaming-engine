"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SEVERITY_COLORS } from "@/lib/api";
import type { CampaignSummary, Severity } from "@/lib/types";

const SEVERITIES: Severity[] = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function CategoryChart({ summary }: { summary: CampaignSummary }) {
  const data = Object.entries(summary.by_category).map(([cat, s]) => ({
    category: cat.replace(/_/g, " "),
    ...s.severity_counts,
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 40, left: -8 }}>
          <CartesianGrid stroke="#242935" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="category"
            stroke="#6b7280"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            angle={-25}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "#13161d",
              border: "1px solid #242935",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          {SEVERITIES.map((sev) => (
            <Bar key={sev} dataKey={sev} stackId="a" fill={SEVERITY_COLORS[sev]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
