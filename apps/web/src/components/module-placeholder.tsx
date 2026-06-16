import type { LucideIcon } from "lucide-react";
import { Sparkles, ArrowRight, Compass, Layers, Wand2 } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  highlights?: string[];
}

export function ModulePlaceholder({ icon: Icon, title, description, highlights }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Module
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/20">
          <Sparkles className="h-3.5 w-3.5" />
          Coming Soon
        </span>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
              <Icon className="h-8 w-8" />
            </div>
            <h2 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {description}
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">
              This module is currently under design and will be available in the next phase.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover">
                Notify me when ready
                <ArrowRight className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
                View product roadmap
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="grid grid-cols-2 gap-3">
              {(highlights ?? ["Workflows", "Automations", "Reports", "Integrations"]).map((h, i) => {
                const icons = [Compass, Layers, Wand2, Sparkles];
                const Ico = icons[i % icons.length];
                return (
                  <div
                    key={h}
                    className="group rounded-2xl border border-border bg-background/60 p-4 transition hover:shadow-card-hover hover:-translate-y-0.5"
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Ico className="h-4 w-4" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-foreground">{h}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Premium workflows tailored for upCarrera teams.
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/40 p-4 text-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Design preview
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                Interactive prototype shipping in Phase 2
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
