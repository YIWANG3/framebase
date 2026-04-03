import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";

export default function Toolbar({
  title,
  query,
  setQuery,
  sort,
  setSort,
  refreshAll,
  onAddProcessed,
  onAddSources,
  onRunImport,
  onRunEnrichment,
  onRunPreviews,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  displayMode,
  setDisplayMode,
  thumbSize,
  setThumbSize,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-panel2 px-3 py-2.5">
      <div className="relative">
        <button
          className="flex h-7.5 w-7.5 items-center justify-center rounded-[10px] border border-border bg-panel text-text transition hover:bg-app"
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Plus className="h-3.5 w-3.5 stroke-[1.9]" />
        </button>
        {menuOpen ? (
          <div className="absolute left-0 top-10 z-20 min-w-[220px] rounded-2xl border border-border bg-panel2 p-1.5 shadow-overlay">
            {[
              ["Add Processed Media…", onAddProcessed],
              ["Add Sources…", onAddSources],
              ["Run Import Pipeline", onRunImport],
              ["Run Enrichment", onRunEnrichment],
              ["Generate Previews", onRunPreviews],
            ].map(([label, handler]) => (
              <button
                key={label}
                type="button"
                className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-text transition hover:bg-app"
                onClick={async () => {
                  setMenuOpen(false);
                  await handler();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        className="flex h-7.5 w-7.5 items-center justify-center rounded-[10px] border border-border bg-panel text-text transition hover:bg-app disabled:opacity-35"
        type="button"
        disabled={!canGoBack}
        onClick={onBack}
      >
        <ChevronLeft className="h-3.5 w-3.5 stroke-[1.9]" />
      </button>
      <button
        className="flex h-7.5 w-7.5 items-center justify-center rounded-[10px] border border-border bg-panel text-text transition hover:bg-app disabled:opacity-35"
        type="button"
        disabled={!canGoForward}
        onClick={onForward}
      >
        <ChevronRight className="h-3.5 w-3.5 stroke-[1.9]" />
      </button>
      <div className="ml-1 min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-text">{title}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span>−</span>
        <input
          type="range"
          min="140"
          max="280"
          step="4"
          value={thumbSize}
          onChange={(event) => setThumbSize(Number(event.target.value))}
          className="w-20"
          aria-label="Thumbnail size"
        />
        <span>+</span>
      </div>
      <label className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets..."
          className="w-full rounded-[10px] border border-border bg-panel px-8 py-1.5 text-[12px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </label>
      <select
        value={sort}
        onChange={(event) => setSort(event.target.value)}
        className="rounded-[10px] border border-border bg-panel px-3 py-1.5 text-[11px] text-text outline-none"
      >
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
        <option value="score-desc">Match score</option>
      </select>
      <div className="flex items-center rounded-[10px] border border-border bg-panel p-0.5">
        {[
          ["grid", "Grid"],
          ["justified", "Justified"],
          ["waterfall", "Waterfall"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDisplayMode(value)}
            className={[
              "rounded-[8px] px-2 py-1 text-[11px] font-medium transition",
              displayMode === value ? "bg-app text-text" : "text-muted hover:text-text",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className="flex h-7.5 w-7.5 items-center justify-center rounded-[10px] border border-border bg-panel text-text transition hover:bg-app"
        type="button"
        onClick={() => void refreshAll()}
      >
        <RefreshCw className="h-3.5 w-3.5 stroke-[1.9]" />
      </button>
    </div>
  );
}
