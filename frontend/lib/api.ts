import type { Campaign, CampaignConfig } from "./types";

const BASE = "https://llm-red-teaming-engine-production.up.railway.app";

export async function getCategories(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

export async function listCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${BASE}/api/campaigns`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load campaigns");
  return res.json();
}

export async function getCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`${BASE}/api/campaigns/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load campaign");
  return res.json();
}

export async function startCampaign(config: CampaignConfig): Promise<string> {
  const res = await fetch(`${BASE}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to start campaign");
  const data = await res.json();
  return data.id;
}

export function openEventStream(id: string): EventSource {
  return new EventSource(`${BASE}/api/campaigns/${id}/events`);
}

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
  NONE: "#10b981",
};
