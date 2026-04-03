import { Archive, Circle, Tag } from "lucide-react";
import { baseName, formatTimestamp, navItems } from "../utils/format";

const ICON_MAP = { Archive, Circle, Tag };

export default function Sidebar({ info, summary, status, setStatus }) {
  const browse = navItems(summary);
  const rootSummary = [];
  if (Number(summary?.export_assets ?? 0)) rootSummary.push(`${summary.export_assets} assets`);
  if (summary?.updated_at) rootSummary.push(`updated ${formatTimestamp(summary.updated_at)}`);
  return (
    <aside className="h-full overflow-y-auto border-r border-border bg-panel px-4 py-5">
      <div className="mb-6">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Current Catalog</div>
        <div className="text-[14px] font-semibold text-text">{baseName(info?.catalogPath || "Untitled Catalog")}</div>
        <div className="mt-1.5 text-[12px] leading-5 text-muted">
          {rootSummary.length ? rootSummary.join(" · ") : "No indexed assets yet"}
        </div>
      </div>

      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Browse</div>
        <div className="space-y-1">
          {browse.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const active = item.key === status;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatus(item.key)}
                className={[
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                  active
                    ? "border-accent bg-accentSoft text-accent"
                    : "border-transparent bg-transparent text-text hover:border-border hover:bg-panel2",
                ].join(" ")}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-[16px] w-[16px] stroke-[1.8]" />
                  <span className="text-[13px] font-medium">{item.label}</span>
                </span>
                <span className="text-[12px] tabular-nums text-muted">{item.count}</span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
