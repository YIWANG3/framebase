import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileName, localFileUrl } from "../utils/format";

const MAX_SCALE = 8;
const MIN_SCALE = 0.02;
const WHEEL_ZOOM_SENSITIVITY = 0.014;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function OverlayButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={[
        "flex h-10 w-10 items-center justify-center rounded-full bg-black/42 text-white/90 transition-colors hover:bg-black/58 hover:text-white",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

function formatPercent(scale) {
  return `${Math.round(scale * 100)}%`;
}

export default function Lightbox({
  open,
  items,
  currentIndex,
  onClose,
  onIndexChange,
}) {
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const activePointerIdRef = useRef(null);
  const viewRef = useRef(null);
  const fitScaleRef = useRef(1);
  const paintFrameRef = useRef(0);
  const loadStartRef = useRef(0);
  const [naturalSize, setNaturalSize] = useState(null);
  const [fitScale, setFitScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [loadState, setLoadState] = useState("loading");
  const [sourceIndex, setSourceIndex] = useState(0);

  const clampedIndex = Math.max(0, Math.min(currentIndex, Math.max((items?.length || 1) - 1, 0)));
  const currentItem = items?.[clampedIndex] || null;
  const sources = useMemo(
    () => currentItem
      ? [currentItem.export_path, currentItem.export_preview_path, currentItem.raw_preview_path].filter(Boolean)
      : [],
    [currentItem],
  );
  const imagePath = sources[sourceIndex] || null;
  const title = fileName(currentItem?.export_path) || currentItem?.stem || "Selected asset";
  const metaWidth = Number(currentItem?.export_metadata?.width || 0);
  const metaHeight = Number(currentItem?.export_metadata?.height || 0);
  const scale = displayScale;
  const isZoomed = scale > fitScale + 0.001;
  const canGoPrev = clampedIndex > 0;
  const canGoNext = clampedIndex < (items?.length || 0) - 1;

  function schedulePaint() {
    if (paintFrameRef.current) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = 0;
      const image = imageRef.current;
      const current = viewRef.current;
      if (!image || !current) return;
      image.style.transform = `translate3d(${current.tx}px, ${current.ty}px, 0) scale(${current.scale})`;
      setDisplayScale(current.scale);
    });
  }

  function applyView(nextView) {
    if (!nextView) return;
    viewRef.current = nextView;
    schedulePaint();
  }

  function computeFit(width, height) {
    const viewport = viewportRef.current;
    if (!viewport || !width || !height) {
      return { scale: 1, tx: 0, ty: 0 };
    }
    const rect = viewport.getBoundingClientRect();
    const nextScale = Math.min(rect.width / width, rect.height / height, 1);
    return {
      scale: nextScale,
      tx: (rect.width - width * nextScale) / 2,
      ty: (rect.height - height * nextScale) / 2,
    };
  }

  function resetToFit(width = naturalSize?.width, height = naturalSize?.height) {
    if (!width || !height) return;
    const fit = computeFit(width, height);
    fitScaleRef.current = fit.scale;
    setFitScale(fit.scale);
    setDisplayScale(fit.scale);
    applyView(fit);
  }

  function zoomFromCenter(nextScale) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const current = viewRef.current;
    if (!current) return;
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const clampedScale = clamp(nextScale, fitScaleRef.current, MAX_SCALE);
    const ratio = clampedScale / current.scale;
    applyView({
      scale: clampedScale,
      tx: cx - ratio * (cx - current.tx),
      ty: cy - ratio * (cy - current.ty),
    });
  }

  useEffect(() => {
    if (!open) return;
    setNaturalSize(null);
    setFitScale(1);
    setDisplayScale(1);
    fitScaleRef.current = 1;
    viewRef.current = null;
    setLoadState("loading");
    setSourceIndex(0);
    loadStartRef.current = performance.now();
  }, [open, currentItem?.asset_id, currentItem?.export_path, currentItem?.export_preview_path, currentItem?.raw_preview_path]);

  useEffect(() => () => {
    if (paintFrameRef.current) cancelAnimationFrame(paintFrameRef.current);
  }, []);

  useEffect(() => {
    if (!open || !naturalSize || typeof ResizeObserver === "undefined") return undefined;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextFit = computeFit(naturalSize.width, naturalSize.height);
        fitScaleRef.current = nextFit.scale;
        setFitScale(nextFit.scale);
        const current = viewRef.current;
        if (!current || current.scale <= fitScaleRef.current + 0.001 || current.scale < nextFit.scale) {
          setDisplayScale(nextFit.scale);
          applyView(nextFit);
        }
      });
    });

    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [fitScale, naturalSize, open]);

  useEffect(() => {
    if (!open) return undefined;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    function handleWheel(event) {
      event.preventDefault();
      const current = viewRef.current;
      if (!current || !naturalSize) return;
      const rect = viewport.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const nextScale = clamp(current.scale * factor, fitScaleRef.current, MAX_SCALE);
      if (Math.abs(nextScale - current.scale) < 0.0001) return;
      const ratio = nextScale / current.scale;
      applyView({
        scale: nextScale,
        tx: mx - ratio * (mx - current.tx),
        ty: my - ratio * (my - current.ty),
      });
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [naturalSize, open]);

  if (!open || !currentItem) return null;

  function handleImageLoad(event) {
    const width = event.currentTarget.naturalWidth;
    const height = event.currentTarget.naturalHeight;
    if (!width || !height) return;
    setNaturalSize({ width, height });
    setLoadState("ready");
    requestAnimationFrame(() => {
      resetToFit(width, height);
    });
  }

  function handleImageError() {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((current) => current + 1);
      return;
    }
    setLoadState("error");
  }

  function handlePointerDown(event) {
    const current = viewRef.current;
    if (event.button !== 0 || !isZoomed || !current) return;
    event.preventDefault();
    setDragging(true);
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      tx: current.tx,
      ty: current.ty,
    };
  }

  function handlePointerMove(event) {
    if (!dragging || activePointerIdRef.current !== event.pointerId) return;
    const current = viewRef.current;
    if (!current) return;
    applyView({
      ...current,
      tx: dragRef.current.tx + (event.clientX - dragRef.current.x),
      ty: dragRef.current.ty + (event.clientY - dragRef.current.y),
    });
  }

  function handlePointerUp(event) {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDoubleClick(event) {
    const current = viewRef.current;
    if (!current) return;
    if (isZoomed) {
      resetToFit();
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const nextScale = clamp(Math.max(1, fitScaleRef.current * 2), fitScaleRef.current, MAX_SCALE);
    const ratio = nextScale / current.scale;
    applyView({
      scale: nextScale,
      tx: mx - ratio * (mx - current.tx),
      ty: my - ratio * (my - current.ty),
    });
  }

  function handleSliderChange(event) {
    zoomFromCenter(Math.exp(Number(event.target.value)));
  }

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="pointer-events-none flex shrink-0 items-center justify-between px-6 py-5">
        <div className="pointer-events-auto min-w-0">
          <div className="truncate text-[15px] font-medium text-white">{title}</div>
          <div className="mt-1 text-[12px] text-white/60">
            {items.length > 0 ? `${clampedIndex + 1} / ${items.length}` : ""}
            {(metaWidth > 0 && metaHeight > 0) ? ` · ${metaWidth} × ${metaHeight}` : ""}
          </div>
        </div>
        <OverlayButton onClick={onClose} className="pointer-events-auto">
          <X className="h-4 w-4" />
        </OverlayButton>
      </div>

      {canGoPrev ? (
        <OverlayButton
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(clampedIndex - 1);
          }}
          className="pointer-events-auto absolute left-6 top-1/2 z-10 -translate-y-1/2"
        >
          <ChevronLeft className="h-5 w-5" />
        </OverlayButton>
      ) : null}

      {canGoNext ? (
        <OverlayButton
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(clampedIndex + 1);
          }}
          className="pointer-events-auto absolute right-6 top-1/2 z-10 -translate-y-1/2"
        >
          <ChevronRight className="h-5 w-5" />
        </OverlayButton>
      ) : null}

      <div
        ref={viewportRef}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={[
          "relative min-h-0 flex-1 overflow-hidden",
          isZoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
        ].join(" ")}
        style={{ touchAction: "none" }}
      >
        {loadState === "error" ? (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-white/70">
            Failed to load image
          </div>
        ) : null}

        {imagePath ? (
          <img
            key={localFileUrl(imagePath)}
            src={localFileUrl(imagePath)}
            alt={currentItem.stem || ""}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
            decoding="async"
            className="absolute left-0 top-0 max-w-none select-none"
            style={{
              transformOrigin: "0 0",
              transform: "translate3d(0, 0, 0) scale(1)",
              visibility: loadState === "ready" ? "visible" : "hidden",
              willChange: "transform",
            }}
            ref={imageRef}
          />
        ) : null}

        {loadState === "loading" ? (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-white/70">
            Loading large image...
          </div>
        ) : null}
      </div>

      <div
        className="pointer-events-none flex shrink-0 items-center justify-center gap-3 py-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => zoomFromCenter(scale / 1.35)}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="range"
          min={Math.log(Math.max(fitScale, MIN_SCALE))}
          max={Math.log(MAX_SCALE)}
          step={0.01}
          value={Math.log(Math.max(scale, fitScale, MIN_SCALE))}
          onChange={handleSliderChange}
          className="pointer-events-auto w-32"
          aria-label="Zoom level"
        />
        <button
          type="button"
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => zoomFromCenter(scale * 1.35)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="pointer-events-auto ml-1 rounded px-2 py-0.5 text-[11px] tabular-nums text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
          onClick={() => resetToFit()}
          title="Reset to fit"
        >
          {formatPercent(scale)}
        </button>
      </div>
    </div>
  );
}
