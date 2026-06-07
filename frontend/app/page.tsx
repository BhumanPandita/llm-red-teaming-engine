import { CampaignForm } from "@/components/campaign-form";
import { CampaignsList } from "@/components/campaigns-list";

export default function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <section className="rounded-xl border border-border bg-panel p-6 lg:col-span-2">
        <h2 className="mb-1 text-lg font-semibold">Launch a new campaign</h2>
        <p className="mb-6 text-sm text-muted">
          Dispatch adversarial prompts against the HRBot target and score each
          response for leakage.
        </p>
        <CampaignForm />
      </section>

      <section className="lg:col-span-3">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          <span className="text-xs text-muted">auto-refreshing</span>
        </div>
        <CampaignsList />
      </section>
    </div>
  );
}
