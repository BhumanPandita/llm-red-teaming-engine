"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCategories, startCampaign } from "@/lib/api";

const HUMAN_LABELS: Record<string, string> = {
  direct_extraction: "Direct Extraction",
  roleplay_jailbreak: "Roleplay Jailbreak",
  authority_override: "Authority Override",
  indirect_inference: "Indirect Inference",
  prompt_injection: "Prompt Injection",
  fictional_framing: "Fictional Framing",
  encoding_obfuscation: "Encoding / Obfuscation",
  rag_context_poisoning: "RAG Context Poisoning",
  social_engineering: "Social Engineering",
  system_prompt_extraction: "Prompt Extraction",
  false_memory: "False Memory",
  chain_of_thought_hijack: "CoT Hijacking",
  token_smuggling: "Token Smuggling",
};

export function CampaignForm() {
  const router = useRouter();
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attacksPerCategory, setAttacksPerCategory] = useState(3);
  const [includeSeeds, setIncludeSeeds] = useState(true);
  const [concurrency, setConcurrency] = useState(3);
  const [evalConcurrency, setEvalConcurrency] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then((cats) => {
        setAllCategories(cats);
        setSelected(new Set(cats));
      })
      .catch((e) => setErr(String(e)));
  }, []);

  function toggle(cat: string) {
    const next = new Set(selected);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setSelected(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setErr("Pick at least one attack category.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      const id = await startCampaign({
        categories: Array.from(selected),
        attacks_per_category: attacksPerCategory,
        include_seeds: includeSeeds,
        concurrency,
        eval_concurrency: evalConcurrency,
      });
      router.push(`/campaigns/${id}`);
    } catch (e) {
      setErr(String(e));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">Attack categories</label>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(new Set(allCategories))}
              className="text-accent hover:underline"
            >
              all
            </button>
            <span className="text-muted">/</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-accent hover:underline"
            >
              none
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {allCategories.map((c) => {
            const on = selected.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={[
                  "rounded-md border px-3 py-2 text-left text-xs font-mono transition",
                  on
                    ? "border-accent/50 bg-accent/10 text-text"
                    : "border-border bg-panel2 text-muted hover:border-border hover:text-text",
                ].join(" ")}
              >
                {HUMAN_LABELS[c] ?? c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField
          label="LLM attacks per category"
          value={attacksPerCategory}
          min={0}
          max={20}
          onChange={setAttacksPerCategory}
          hint="0 = seeds only (no Groq calls)"
        />
        <NumberField
          label="Target concurrency"
          value={concurrency}
          min={1}
          max={20}
          onChange={setConcurrency}
          hint="≤3 recommended for 15 RPM free tier"
        />
        <NumberField
          label="Judge concurrency"
          value={evalConcurrency}
          min={1}
          max={20}
          onChange={setEvalConcurrency}
          hint="Groq free tier handles 3-4 OK"
        />
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSeeds}
            onChange={(e) => setIncludeSeeds(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span>
            Include seed attacks
            <span className="ml-2 text-xs text-muted">(9 hardcoded, no API)</span>
          </span>
        </label>
      </div>

      {err && (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? "Starting campaign…" : "Launch campaign"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border bg-panel2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
      />
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </label>
  );
}
