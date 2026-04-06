import { Images, CircleCheck, CircleX } from "lucide-react";
import { baseName, formatTimestamp, navItems } from "../utils/format";

const ICON_MAP = { Archive: Images, Circle: CircleCheck, Tag: CircleX };

export default function Sidebar({ info, summary, status, setStatus }) {
  const browse = navItems(summary);
  const rootSummary = [];
  if (Number(summary?.export_assets ?? 0)) rootSummary.push(`${summary.export_assets} assets`);
  if (summary?.updated_at) rootSummary.push(`updated ${formatTimestamp(summary.updated_at)}`);
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-border/40 bg-chrome px-3 py-3">
      <div className="mb-5 px-1">
        <div className="text-[13px] font-semibold tracking-[0.01em] text-text">{baseName(info?.catalogPath || "Untitled Catalog")}</div>
        <div className="mt-1 text-[11px] text-muted2">
          {rootSummary.length ? rootSummary.join(" · ") : "No indexed assets yet"}
        </div>
      </div>

      <nav className="flex-1">
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
                  "flex w-full items-center justify-between rounded-md px-2.5 py-[6px] text-left transition-colors",
                  active
                    ? "bg-selected text-text"
                    : "text-muted hover:bg-hover/70 hover:text-text",
                ].join(" ")}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 stroke-[1.6] ${active ? "text-accent" : ""}`} />
                  <span className="text-[13px]">{item.label}</span>
                </span>
                <span className={`text-[11px] tabular-nums ${active ? "text-accent" : "text-muted2"}`}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
