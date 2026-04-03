export default function ImportOverlay({ overlay }) {
  if (!overlay.visible) return null;
  return (
    <div className="fixed bottom-5 left-5 z-30 w-[320px] rounded-[18px] border border-border bg-panel2/95 p-4 shadow-overlay backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Import Jobs</div>
          <div className="mt-2 text-[19px] font-semibold leading-tight text-text">{overlay.title}</div>
        </div>
        {overlay.percent ? (
          <div className="rounded-full bg-accentSoft px-3 py-1 text-[13px] font-semibold text-accent">{overlay.percent}</div>
        ) : null}
      </div>
      <div className="mt-3 text-sm text-muted">{overlay.status}</div>
      <div className="mt-4 space-y-2">
        {overlay.notes.map((note) => (
          <div key={note} className="text-[13px] leading-5 text-text">
            {note}
          </div>
        ))}
        {overlay.phases.length ? (
          <div className="pt-1">
            {overlay.phases.map((phase) => (
              <div key={phase} className="flex items-center gap-2 py-1 text-[13px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-warn"></span>
                <span>{phase} complete</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
