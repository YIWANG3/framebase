import { fileName, escapePathLabel, formatBytes, formatTimestamp, statusLabel, scoreLabel, localFileUrl } from "../utils/format";

function DetailRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-[12px] leading-[1.4]">
      <div className="shrink-0 text-muted">{label}</div>
      <div className="min-w-0 break-words text-right text-text">{children}</div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div className="mt-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted2">{children}</div>
    </div>
  );
}

export default function Inspector({ detail }) {
  if (!detail) {
    return (
      <aside className="flex h-full items-center justify-center overflow-y-auto bg-chrome px-4">
        <div className="text-center text-[12px] text-muted">
          Select an asset to view details
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
    <aside className="flex h-full flex-col overflow-hidden bg-chrome">
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-24">
        <div className="relative mb-4 overflow-hidden rounded-lg bg-app">
          {previewPath ? (
            <img src={localFileUrl(previewPath)} alt={detail.stem} className="block h-auto w-full object-contain" draggable={false} />
          ) : (
            <div className="flex min-h-[160px] items-center justify-center text-[12px] text-muted">No preview</div>
          )}
          <span className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatValue}
          </span>
        </div>

        <div className="px-0.5">
          <h2 className="text-[13px] font-medium leading-tight text-text">{exportName || detail.stem}</h2>

          <SectionHeader>Properties</SectionHeader>
          <DetailRow label="Status">{matched}</DetailRow>
          {detail.score != null ? <DetailRow label="Score">{scoreLabel(detail.score)}</DetailRow> : null}
          <DetailRow label="Dimensions">{dimensions}</DetailRow>
          <DetailRow label="Size">{fileSize}</DetailRow>
          <DetailRow label="Type">{formatValue}</DetailRow>

          <SectionHeader>Source</SectionHeader>
          <DetailRow label="Asset">{escapePathLabel(detail.export_path)}</DetailRow>
          <DetailRow label="Source">{detail.raw_path ? escapePathLabel(detail.raw_path) : "Not linked"}</DetailRow>
          <DetailRow label="Source file">{rawName || "—"}</DetailRow>

          <SectionHeader>Camera</SectionHeader>
          <DetailRow label="Camera">{rawMeta.camera_model || exportMeta.camera_model || "—"}</DetailRow>
          <DetailRow label="Lens">{rawMeta.lens_model || "—"}</DetailRow>

          <SectionHeader>Dates</SectionHeader>
          <DetailRow label="Imported">{formatTimestamp(detail.imported_at || exportMeta.imported_at)}</DetailRow>
          <DetailRow label="Captured">{formatTimestamp(rawMeta.capture_time || exportMeta.capture_time)}</DetailRow>
          <DetailRow label="Modified">{formatTimestamp(exportMeta.modified_time || detail.updated_at)}</DetailRow>
        </div>
      </div>

      <div className="bg-chrome/95 px-3 py-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-md bg-selected px-3 py-2 text-[12px] font-medium text-text transition-colors hover:bg-hover"
            onClick={() => void window.mediaWorkspace?.revealPath?.(detail.export_path)}
          >
            Reveal Media
          </button>
          <button
            type="button"
            className="rounded-md border border-border/70 bg-app px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-40"
            onClick={() => void window.mediaWorkspace?.revealPath?.(detail.raw_path)}
            disabled={!detail.raw_path}
          >
            Reveal Source
          </button>
        </div>
      </div>
    </aside>
  );
}
