import { fileName, escapePathLabel, formatBytes, formatTimestamp, statusLabel, scoreLabel, localFileUrl } from "../utils/format";

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-3 py-1 text-[11px] leading-[1.35]">
      <div className="text-muted">{label}</div>
      <div className="break-words text-text">{children}</div>
    </div>
  );
}

export default function Inspector({ detail }) {
  if (!detail) {
    return (
      <aside className="h-full overflow-y-auto border-l border-border bg-panel px-4 py-5">
        <div className="rounded-2xl border border-dashed border-border bg-panel2 px-4 py-10 text-center text-sm text-muted">
          Select an asset to inspect its source, metadata, and current linkage.
        </div>
      </aside>
    );
  }

  const previewPath = detail.export_preview_path || detail.raw_preview_path;
  const exportMeta = detail.export_metadata || {};
  const rawMeta = detail.raw_metadata || {};
  const exportName = fileName(detail.export_path);
  const rawName = fileName(detail.raw_path || "");
  const formatValue = (detail.export_path || "").split(".").pop()?.toUpperCase() || "Unknown";
  const dimensions = exportMeta.width && exportMeta.height ? `${exportMeta.width} × ${exportMeta.height}` : "Unknown";
  const fileSize = formatBytes(exportMeta.file_size || exportMeta.size_bytes) || "Unknown";
  const matched = statusLabel(detail.match_status);

  return (
    <aside className="h-full overflow-y-auto border-l border-border bg-panel px-4 py-5">
      <div className="mb-3 overflow-hidden rounded-[14px] border border-border bg-panel2">
        {previewPath ? (
          <img src={localFileUrl(previewPath)} alt={detail.stem} className="block h-auto w-full object-contain" />
        ) : (
          <div className="flex min-h-[180px] items-center justify-center text-sm text-muted">No preview</div>
        )}
      </div>

      <h2 className="text-[14px] font-semibold leading-tight text-text">{exportName || detail.stem}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] font-medium text-text">{matched}</span>
        <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-muted">{formatValue}</span>
        {detail.score != null ? <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-muted">{scoreLabel(detail.score)}</span> : null}
      </div>

      <section className="mt-4 border-t border-border pt-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Link</div>
        <DetailRow label="Asset">{escapePathLabel(detail.export_path)}</DetailRow>
        <DetailRow label="Source">{detail.raw_path ? escapePathLabel(detail.raw_path) : "Not linked"}</DetailRow>
        <DetailRow label="Source file">{rawName || "Unknown"}</DetailRow>
      </section>

      <section className="mt-4 border-t border-border pt-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Metadata</div>
        <DetailRow label="Dimensions">{dimensions}</DetailRow>
        <DetailRow label="File size">{fileSize}</DetailRow>
        <DetailRow label="Camera">{rawMeta.camera_model || exportMeta.camera_model || "Unknown"}</DetailRow>
        <DetailRow label="Lens">{rawMeta.lens_model || "Unknown"}</DetailRow>
      </section>

      <section className="mt-4 border-t border-border pt-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Dates</div>
        <DetailRow label="Imported">{formatTimestamp(detail.imported_at || exportMeta.imported_at)}</DetailRow>
        <DetailRow label="Captured">{formatTimestamp(rawMeta.capture_time || exportMeta.capture_time)}</DetailRow>
        <DetailRow label="Modified">{formatTimestamp(exportMeta.modified_time || detail.updated_at)}</DetailRow>
      </section>
    </aside>
  );
}
