export default function ImportOverlay({ overlay }) {
  if (!overlay.visible) return null;
  return (
    <div className="fixed bottom-4 left-4 z-30 w-[320px] rounded-lg border border-border bg-chrome/95 p-3.5 shadow-overlay backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted2">Import</div>
          <div className="mt-1 text-[13px] font-medium leading-snug text-text">{overlay.title}</div>
        </div>
        {overlay.percent ? (
          <div className="shrink-0 rounded bg-accentSoft px-2 py-0.5 text-[12px] font-medium tabular-nums text-accent">{overlay.percent}</div>
        ) : null}
      </div>
      <div className="mt-2 text-[12px] text-muted">{overlay.status}</div>
      {overlay.notes.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {overlay.notes.map((note) => (
            <div key={note} className="text-[12px] leading-[1.4] text-text">{note}</div>
          ))}
        </div>
      )}
      {overlay.phases.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {overlay.phases.map((phase) => (
            <div key={phase} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-1 w-1 rounded-full bg-success" />
              <span>{phase}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
