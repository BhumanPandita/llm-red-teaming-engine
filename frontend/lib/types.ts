export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface CampaignConfig {
  categories: string[];
  attacks_per_category: number;
  include_seeds: boolean;
  concurrency: number;
  eval_concurrency: number;
}

export interface CategorySummary {
  total: number;
  leaked: number;
  avg_score: number;
  leak_rate: number;
  severity_counts: Record<Severity, number>;
}

export interface CampaignSummary {
  total_attacks: number;
  leaked_total: number;
  leak_rate: number;
  severity_counts: Record<Severity, number>;
  by_category: Record<string, CategorySummary>;
  avg_score: number;
}

export interface Evaluation {
  eval_id: number;
  attack_id: number;
  category: string;
  source: string;
  prompt: string;
  response_text: string | null;
  heuristic_score: number;
  semantic_score: number;
  final_score: number;
  severity: Severity;
  leaked: boolean;
  evidence: string | null;
  heuristic_signals: string | null;
  wall_latency_ms: number | null;
}

export type CampaignStatus =
  | "pending"
  | "executing"
  | "evaluating"
  | "completed"
  | "failed";

export interface Campaign {
  id: string;
  status: CampaignStatus;
  started_at: string;
  completed_at: string | null;
  config: CampaignConfig;
  summary: CampaignSummary | null;
  evaluations?: Evaluation[];
  error?: string | null;
}

export interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
  ts?: string;
}
