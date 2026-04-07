import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Images } from "lucide-react";
import { fileName, galleryInfoLabel, buildJustifiedLayout, localFileUrl } from "../utils/format";
import PreviewImage from "./PreviewImage";

const GAP = 12;
const CAPTION_HEIGHT = 42;
const GRID_ASPECT_RATIO = 4 / 3;
const OVERSCAN_PX = 800;

function CardContent({ item, selected, onSelect, width, height, fit, containerRef }) {
  const title = fileName(item.export_path) || item.stem;
  const isJustified = fit === "contain";
  const compactCaption = isJustified;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.export_path)}
      data-gallery-item="true"
      data-export-path={item.export_path}
      className="group absolute text-left focus:outline-none"
      style={{
        width: `${width}px`,
        height: `${height + CAPTION_HEIGHT}px`,
        minWidth: 0,
      }}
    >
      <div
        className={[
          "relative overflow-hidden rounded-md transition-all duration-200",
          selected
            ? "ring-2 ring-accent shadow-glow"
            : "ring-1 ring-border/40 group-hover:ring-accent/40 group-hover:shadow-card-hover",
        ].join(" ")}
        style={{ height: `${height}px` }}
      >
        {item.preview_path ? (
          <PreviewImage
            src={localFileUrl(item.preview_path)}
            alt={item.stem}
            scrollRootRef={containerRef}
            fit={fit}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-muted">No preview</div>
        )}
      </div>
      <div className="px-0.5 pt-1.5">
        <div
          className={[
            compactCaption ? "truncate" : "line-clamp-2-custom break-words",
            "min-w-0 text-[11px] leading-[1.3]",
            selected ? "text-text" : "text-text/92",
          ].join(" ")}
        >
          {title}
        </div>
        <div className={`mt-0.5 truncate text-[10px] leading-[1.3] ${selected ? "text-muted" : "text-muted2"}`}>
          {galleryInfoLabel(item)}
        </div>
      </div>
    </button>
  );
}

export default function Gallery({
  items,
  selectedExportPath,
  onSelect,
  onLayoutItemsChange,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  displayMode,
  thumbSize,
}) {
  const containerRef = useRef(null);
  const scrollRafRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const element = containerRef.current;
    const update = () => {
      setContainerWidth(element.clientWidth);
      setViewportHeight(element.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayMode, loading, items.length]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !hasMore || loading || loadingMore) return;
    const preloadThreshold = Math.max(element.clientHeight * 5, 4000);
    const remaining = element.scrollHeight - (element.scrollTop + element.clientHeight);
    if (remaining <= preloadThreshold) {
      void onLoadMore?.();
    }
  }, [items.length, hasMore, loading, loadingMore, onLoadMore, scrollTop]);

  useEffect(
    () => () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  function handleScroll(event) {
    const element = event.currentTarget;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(element.scrollTop);
      setViewportHeight(element.clientHeight);
    });
    if (!hasMore || loading || loadingMore) return;
    const preloadThreshold = Math.max(element.clientHeight * 5, 4000);
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - preloadThreshold) {
      void onLoadMore?.();
    }
  }

  const gridLayout = useMemo(() => {
    if (!containerWidth) return null;
    const availableWidth = Math.max(containerWidth - 24, thumbSize);
    const columnCount = Math.max(1, Math.floor((availableWidth + GAP) / (thumbSize + GAP)));
    const cellWidth = (availableWidth - GAP * (columnCount - 1)) / columnCount;
    const imgHeight = cellWidth / GRID_ASPECT_RATIO;
    const cardHeight = imgHeight + CAPTION_HEIGHT;
    const rowStride = cardHeight + GAP;
    const totalRows = Math.ceil(items.length / columnCount);
    const positions = [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const row = Math.floor(idx / columnCount);
      const col = idx % columnCount;
      positions.push({
        item: items[idx],
        left: col * (cellWidth + GAP),
        top: row * rowStride,
        width: cellWidth,
        imgHeight,
      });
    }
    return {
      totalHeight: Math.max(0, totalRows * rowStride - GAP),
      positions,
    };
  }, [containerWidth, items, thumbSize]);

  const justifiedLayoutData = useMemo(() => {
    if (!containerWidth) return null;
    const rowHeight = Math.round(thumbSize * 0.66);
    const layout = buildJustifiedLayout(items, Math.max(containerWidth - 24, 0), rowHeight, GAP, CAPTION_HEIGHT);
    if (!layout.rows.length) return null;
    const positions = layout.rows.flat();
    const rowTops = layout.rows.map((row) => row[0]?.top ?? 0);
    const rowBottoms = layout.rows.map((row) => {
      const maxH = Math.max(...row.map((b) => b.height));
      return (row[0]?.top ?? 0) + maxH + CAPTION_HEIGHT;
    });
    return {
      containerHeight: layout.containerHeight,
      positions,
      rowTops,
      rowBottoms,
    };
  }, [containerWidth, items, thumbSize]);

  const waterfallLayout = useMemo(() => {
    if (!containerWidth) return null;
    const availableWidth = Math.max(containerWidth - 24, thumbSize);
    const columnCount = Math.max(1, Math.floor((availableWidth + GAP) / (thumbSize + GAP)));
    const colWidth = (availableWidth - GAP * (columnCount - 1)) / columnCount;
    const colHeights = new Array(columnCount).fill(0);
    const positions = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const exportMeta = item.export_metadata || {};
      const w = Number(exportMeta.width || 0);
      const h = Number(exportMeta.height || 0);
      const aspect = w > 0 && h > 0 ? w / h : 1;
      const imgHeight = colWidth / aspect;
      // Pick shortest column
      let minCol = 0;
      for (let c = 1; c < columnCount; c++) {
        if (colHeights[c] < colHeights[minCol]) minCol = c;
      }
      const top = colHeights[minCol];
      const left = minCol * (colWidth + GAP);
      positions.push({ item, left, top, width: colWidth, imgHeight });
      colHeights[minCol] = top + imgHeight + CAPTION_HEIGHT + GAP;
    }
    const totalHeight = Math.max(0, Math.max(...colHeights) - GAP);
    return { totalHeight, positions };
  }, [containerWidth, items, thumbSize]);

  const layoutItems = useMemo(() => {
    const source = displayMode === "justified"
      ? justifiedLayoutData?.positions
      : displayMode === "waterfall"
        ? waterfallLayout?.positions
        : gridLayout?.positions;
    return (source || []).map((entry, index) => ({
      exportPath: entry.item.export_path,
      index,
      left: entry.left,
      top: entry.top,
      width: entry.width,
      height: (entry.height ?? entry.imgHeight) + CAPTION_HEIGHT,
    }));
  }, [displayMode, gridLayout, justifiedLayoutData, waterfallLayout]);

  useEffect(() => {
    onLayoutItemsChange?.(layoutItems);
  }, [layoutItems, onLayoutItemsChange]);

  useEffect(() => {
    if (!selectedExportPath || !containerRef.current) return;
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedExportPath) : selectedExportPath.replaceAll('"', '\\"');
    const element = containerRef.current.querySelector(`[data-export-path="${escaped}"]`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }

    const target = layoutItems.find((item) => item.exportPath === selectedExportPath);
    if (!target) return;

    const viewportTop = containerRef.current.scrollTop;
    const viewportBottom = viewportTop + containerRef.current.clientHeight;
    const targetTop = target.top;
    const targetBottom = target.top + target.height;
    if (targetTop >= viewportTop && targetBottom <= viewportBottom) return;

    const nextScrollTop = Math.max(0, targetTop - Math.max(24, (containerRef.current.clientHeight - target.height) / 2));
    containerRef.current.scrollTo({ top: nextScrollTop, behavior: "smooth" });
  }, [selectedExportPath, layoutItems]);

  const gridMetrics = useMemo(() => {
    if (displayMode !== "grid" || !gridLayout) return null;
    const visTop = scrollTop - OVERSCAN_PX;
    const visBottom = scrollTop + viewportHeight + OVERSCAN_PX;
    const visibleItems = gridLayout.positions.filter(
      (entry) => entry.top + entry.imgHeight + CAPTION_HEIGHT >= visTop && entry.top <= visBottom,
    );
    return { totalHeight: gridLayout.totalHeight, visibleItems };
  }, [displayMode, gridLayout, scrollTop, viewportHeight]);

  const justifiedMetrics = useMemo(() => {
    if (displayMode !== "justified" || !justifiedLayoutData) return null;
    const visTop = scrollTop - OVERSCAN_PX;
    const visBottom = scrollTop + viewportHeight + OVERSCAN_PX;
    const visibleBoxes = justifiedLayoutData.positions.filter(
      (box) => box.top + box.height + CAPTION_HEIGHT >= visTop && box.top <= visBottom,
    );
    return { containerHeight: justifiedLayoutData.containerHeight, visibleBoxes };
  }, [displayMode, justifiedLayoutData, scrollTop, viewportHeight]);

  const waterfallMetrics = useMemo(() => {
    if (displayMode !== "waterfall" || !waterfallLayout) return null;
    const visTop = scrollTop - OVERSCAN_PX;
    const visBottom = scrollTop + viewportHeight + OVERSCAN_PX;
    const visibleItems = waterfallLayout.positions.filter(
      (p) => p.top + p.imgHeight + CAPTION_HEIGHT >= visTop && p.top <= visBottom,
    );
    return { totalHeight: waterfallLayout.totalHeight, visibleItems };
  }, [displayMode, waterfallLayout, scrollTop, viewportHeight]);

  const metrics = displayMode === "justified" ? justifiedMetrics
    : displayMode === "waterfall" ? waterfallMetrics
      : gridMetrics;

  const totalHeight = metrics
    ? displayMode === "justified" ? Math.ceil(metrics.containerHeight) : metrics.totalHeight
    : 0;

  const visibleItems = metrics
    ? displayMode === "justified" ? metrics.visibleBoxes : metrics.visibleItems
      : [];

  const fit = displayMode === "justified" ? "contain" : "cover";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-[13px]">Loading…</span>
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-chrome/50">
          <Images className="h-6 w-6 text-muted2" />
        </div>
        <div className="text-[13px] text-muted">No assets in this view</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-auto bg-app px-3 py-3">
      <div className="relative" style={{ height: `${totalHeight}px` }}>
        {visibleItems.map((entry) => {
          const item = entry.item;
          const imgHeight = entry.height ?? entry.imgHeight;
          return (
            <div key={item.export_path} className="absolute" style={{ left: `${entry.left}px`, top: `${entry.top}px` }}>
              <CardContent
                item={item}
                selected={item.export_path === selectedExportPath}
                onSelect={onSelect}
                width={entry.width}
                height={imgHeight}
                fit={fit}
                containerRef={containerRef}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
