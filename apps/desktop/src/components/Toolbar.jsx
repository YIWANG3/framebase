import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCw,
  Search,
  LayoutGrid,
  LayoutDashboard,
  Columns2,
} from "lucide-react";

const DISPLAY_MODES = [
  { key: "grid", icon: LayoutGrid, tip: "Grid" },
  { key: "justified", icon: LayoutDashboard, tip: "Justified" },
  { key: "waterfall", icon: Columns2, tip: "Waterfall" },
];

function IconButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={[
        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-panel2 hover:text-text disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

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
    <div className="flex h-10 items-center gap-0.5 border-b border-border bg-panel px-2">
      <div className="relative">
        <IconButton onClick={() => setMenuOpen((c) => !c)}>
          <Plus className="h-4 w-4 stroke-[1.8]" />
        </IconButton>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full z-20 mt-[14px] min-w-[220px] rounded-lg border border-border bg-panel p-1 shadow-overlay">
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
                  className="block w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-[13px] text-text transition-colors hover:bg-panel2"
                  onClick={async () => {
                    setMenuOpen(false);
                    await handler();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <IconButton disabled={!canGoBack} onClick={onBack}>
        <ChevronLeft className="h-4 w-4 stroke-[1.8]" />
      </IconButton>
      <IconButton disabled={!canGoForward} onClick={onForward}>
        <ChevronRight className="h-4 w-4 stroke-[1.8]" />
      </IconButton>

      <div className="ml-2 mr-2 min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-text">{title}</div>
      </div>

      <div className="flex h-7 items-center gap-1.5 text-muted">
        <span className="relative -top-px flex h-7 w-4 items-center justify-center text-[13px] leading-none">−</span>
        <input
          type="range"
          min="120"
          max="300"
          step="4"
          value={thumbSize}
          onChange={(e) => setThumbSize(Number(e.target.value))}
          className="w-16"
          aria-label="Thumbnail size"
        />
        <span className="relative -top-px flex h-7 w-4 items-center justify-center text-[13px] leading-none">+</span>
      </div>

      <div className="mx-1 h-4 w-px bg-border" />

      <div className="flex items-center gap-px">
        {DISPLAY_MODES.map(({ key, icon: Icon, tip }) => (
          <IconButton
            key={key}
            onClick={() => setDisplayMode(key)}
            className={displayMode === key ? "text-text bg-panel2" : ""}
            title={tip}
          >
            <Icon className="h-3.5 w-3.5 stroke-[1.6]" />
          </IconButton>
        ))}
      </div>

      <div className="mx-1 h-4 w-px bg-border" />

      <label className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="w-40 rounded-md border border-transparent bg-panel2 py-1 pl-7 pr-2 text-[12px] text-text outline-none placeholder:text-muted focus:border-accent/50"
        />
      </label>

      <select
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="ml-1 cursor-pointer rounded-md border border-transparent bg-panel2 px-2 py-1 text-[12px] text-text outline-none hover:border-border"
      >
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
        <option value="score-desc">Score</option>
      </select>

      <IconButton onClick={() => void refreshAll()} title="Refresh">
        <RotateCw className="h-3.5 w-3.5 stroke-[1.8]" />
      </IconButton>
    </div>
  );
}
