import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, X, ChevronDown, Folder, Images } from "lucide-react";
import { localFileUrl } from "../utils/format";
import CollageCanvas from "./collage/CollageCanvas";
import CollagePanel from "./collage/CollagePanel";
import { getTemplatesForCount } from "./collage/collageTemplates";

const PANEL_WIDTH = 300;
const PAGE_SIZE = 20;
const BROWSE_BATCH = 500;

const BUILT_IN_SOURCES = [
  { id: "all", label: "All" },
  { id: "matched", label: "Matched" },
  { id: "unmatched", label: "Unmatched" },
];

function ImagePickerModal({ excludeIds, collections, onPick, onClose }) {
  const scrollRef = useRef(null);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("all");
  const [sourceItems, setSourceItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const manualCollections = useMemo(
    () => (collections || []).filter((c) => c.kind === "manual"),
    [collections],
  );

  const activeLabel = useMemo(() => {
    const built = BUILT_IN_SOURCES.find((s) => s.id === source);
    if (built) return built.label;
    const col = manualCollections.find((c) => c.collection_id === source);
    return col?.name || "All";
  }, [source, manualCollections]);

  // Load items when source changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPage(1);
      try {
        const all = [];
        let offset = 0;
        const isCollection = !BUILT_IN_SOURCES.some((s) => s.id === source);
        while (true) {
          let batch;
          if (isCollection) {
            batch = await window.mediaWorkspace?.browseCollection?.(source, {
              limit: BROWSE_BATCH,
              offset,
            });
          } else {
            batch = await window.mediaWorkspace?.browseExports?.({
              status: source,
              limit: BROWSE_BATCH,
              offset,
            });
          }
          if (cancelled) return;
          if (!batch?.length) break;
          all.push(...batch);
          offset += batch.length;
          if (batch.length < BROWSE_BATCH) break;
        }
        if (!cancelled) setSourceItems(all);
      } catch (err) {
        console.error("[Collage] failed to load source items:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [source]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const items = useMemo(() => {
    const used = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
    return sourceItems.filter((item) => !used.has(item.asset_id));
  }, [sourceItems, excludeIds]);

  const visible = items.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < items.length;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setPage((p) => p + 1);
    }
  }, [hasMore]);

  return (
    <div className="fixed inset-0 z-[10210] flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
      <div className="flex h-[70vh] w-full max-w-[500px] flex-col overflow-hidden rounded-xl bg-[rgb(20,20,20)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
              Add Images
              <span className="ml-2 text-white/25">{loading ? "…" : items.length}</span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-white/40 hover:bg-white/8 hover:text-white/70"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Source selector */}
        <div className="relative px-3 pb-2" ref={dropdownRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-white/6 px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10"
            onClick={() => setShowDropdown((v) => !v)}
          >
            <Images className="h-3 w-3 text-white/40" />
            {activeLabel}
            <ChevronDown className="ml-0.5 h-3 w-3 text-white/30" />
          </button>

          {showDropdown && (
            <div className="absolute left-3 top-full z-10 mt-1 min-w-[180px] overflow-hidden rounded-lg bg-[rgb(28,28,28)] py-1 shadow-2xl">
              {BUILT_IN_SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={[
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors",
                    source === s.id
                      ? "bg-white/8 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/80",
                  ].join(" ")}
                  onClick={() => { setSource(s.id); setShowDropdown(false); }}
                >
                  <Images className="h-3.5 w-3.5 shrink-0 text-white/30" />
                  {s.label}
                </button>
              ))}

              {manualCollections.length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-white/[0.04]" />
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">
                    Folders
                  </div>
                  {manualCollections.map((col) => (
                    <button
                      key={col.collection_id}
                      type="button"
                      className={[
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors",
                        source === col.collection_id
                          ? "bg-white/8 text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white/80",
                      ].join(" ")}
                      onClick={() => { setSource(col.collection_id); setShowDropdown(false); }}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 text-white/30" />
                      {col.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Image grid */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2" onScroll={handleScroll}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-white/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-white/30">No more images available</div>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {visible.map((item) => {
                const src = item.preview_path || item.export_preview_path || item.raw_preview_path;
                return (
                  <button
                    key={item.asset_id}
                    type="button"
                    className="group relative aspect-square overflow-hidden rounded-md bg-black hover:ring-2 hover:ring-[rgb(var(--accent-color)/0.6)]"
                    onClick={() => onPick(item)}
                  >
                    {src ? (
                      <img
                        src={localFileUrl(src)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/4 text-[10px] text-white/20">No preview</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {hasMore && (
            <div className="py-3 text-center text-[11px] text-white/30">
              Showing {visible.length} of {items.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CollageOverlay({ open, items, collections, onClose, onExportComplete }) {
  const canvasRef = useRef(null);
  const [images, setImages] = useState([]);
  const [template, setTemplate] = useState(null);
  const [canvasRatio, setCanvasRatio] = useState(1);
  const [gap, setGap] = useState(4);
  const [padding, setPadding] = useState(0);
  const [borderRadius, setBorderRadius] = useState(0);
  const [bgColor, setBgColor] = useState("#000000");
  const [exportWidth, setExportWidth] = useState(3000);
  const [exporting, setExporting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Initialize from items prop
  useEffect(() => {
    if (!open || !items?.length) return;
    setImages(items);
    const templates = getTemplatesForCount(items.length);
    setTemplate(templates[0] || null);
  }, [open, items]);

  // Auto-select template when image count changes
  useEffect(() => {
    if (!images.length) return;
    const templates = getTemplatesForCount(images.length);
    // Keep current template if still valid for count
    if (template && templates.some((t) => t.id === template.id)) return;
    setTemplate(templates[0] || null);
  }, [images.length]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        if (showPicker) {
          setShowPicker(false);
        } else {
          onClose?.();
        }
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, showPicker, onClose]);

  async function handleExport() {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const blob = await canvasRef.current.exportToBlob(exportWidth);
      if (!blob) return;

      // Derive filename from source images
      const sourceAssetIds = images.map((img) => img.asset_id).filter(Boolean);
      const firstStem = images[0]?.stem || images[0]?.export_path?.split("/").pop()?.replace(/\.[^.]+$/, "") || "collage";
      const allSameSet = images.length > 1 && images.every((img) => img.resource_set_id && img.resource_set_id === images[0].resource_set_id);
      const baseStem = allSameSet ? (images[0].primary_stem || firstStem) : firstStem;
      const defaultName = `${baseStem}_collage.jpg`;

      const savePath = await window.mediaWorkspace?.pickSavePath?.({
        defaultPath: defaultName,
        filters: [{ name: "JPEG", extensions: ["jpg", "jpeg"] }, { name: "PNG", extensions: ["png"] }],
      });
      if (!savePath) return;

      const buffer = await blob.arrayBuffer();
      const firstSrc = images[0]?.export_path || null;
      await window.mediaWorkspace?.saveImage?.(savePath, buffer, firstSrc);
      await window.mediaWorkspace?.quickRegister?.(savePath, firstSrc, sourceAssetIds);
      onExportComplete?.();
    } catch (err) {
      console.error("[Collage] export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  // Exclude IDs for picker
  const excludeIds = useMemo(() => new Set(images.map((img) => img.asset_id)), [images]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10200] flex flex-col bg-[rgb(8,8,8)]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between bg-[rgb(14,14,14)] px-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Collage</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/10 px-3 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/15"
            onClick={handleExport}
            disabled={exporting || images.length < 2}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? "Exporting…" : "Export"}
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/8 hover:text-white/70"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas area */}
        <div className="flex min-w-0 flex-1 items-center justify-center p-8">
          <div
            className="relative"
            style={{
              aspectRatio: canvasRatio,
              maxWidth: "100%",
              maxHeight: "100%",
              width: canvasRatio >= 1 ? "100%" : "auto",
              height: canvasRatio < 1 ? "100%" : "auto",
            }}
          >
            <CollageCanvas
              ref={canvasRef}
              images={images}
              template={template}
              canvasRatio={canvasRatio}
              gap={gap}
              padding={padding}
              borderRadius={borderRadius}
              bgColor={bgColor}
              exportWidth={exportWidth}
              className="h-full w-full rounded-md"
              onSwap={(a, b) => {
                setImages((prev) => {
                  const next = [...prev];
                  [next[a], next[b]] = [next[b], next[a]];
                  return next;
                });
              }}
            />
          </div>
        </div>

        {/* Right panel */}
        <div
          className="shrink-0 overflow-hidden bg-[rgb(14,14,14)]"
          style={{ width: `${PANEL_WIDTH}px` }}
        >
          <CollagePanel
            images={images}
            onImagesChange={setImages}
            template={template}
            onTemplateChange={setTemplate}
            canvasRatio={canvasRatio}
            onCanvasRatioChange={setCanvasRatio}
            gap={gap}
            onGapChange={setGap}
            padding={padding}
            onPaddingChange={setPadding}
            borderRadius={borderRadius}
            onBorderRadiusChange={setBorderRadius}
            bgColor={bgColor}
            onBgColorChange={setBgColor}
            exportWidth={exportWidth}
            onExportWidthChange={setExportWidth}
            onAddImages={() => setShowPicker(true)}
          />
        </div>
      </div>

      {showPicker && (
        <ImagePickerModal
          excludeIds={excludeIds}
          collections={collections}
          onPick={(item) => { setImages((prev) => [...prev, item]); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
