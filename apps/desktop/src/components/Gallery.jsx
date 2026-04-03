import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { fileName, galleryInfoLabel, buildJustifiedLayout, localFileUrl } from "../utils/format";
import PreviewImage from "./PreviewImage";

const GAP = 12;
const GRID_ASPECT_RATIO = 4 / 3;
const GRID_CAPTION_HEIGHT = 44;
const GRID_OVERSCAN_ROWS = 4;

export default function Gallery({
  items,
  selectedExportPath,
  onSelect,
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
    const preloadThreshold = Math.max(element.clientHeight * 3, 2400);
    const remaining = element.scrollHeight - (element.scrollTop + element.clientHeight);
    if (remaining <= preloadThreshold) {
      void onLoadMore?.();
    }
  }, [items.length, hasMore, loading, loadingMore, onLoadMore, scrollTop]);

  useEffect(
    () => () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    },
    [],
  );

  function handleScroll(event) {
    const element = event.currentTarget;
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(element.scrollTop);
      setViewportHeight(element.clientHeight);
    });
    if (!hasMore || loading || loadingMore) return;
    const preloadThreshold = Math.max(element.clientHeight * 3, 2400);
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - preloadThreshold) {
      void onLoadMore?.();
    }
  }

  function renderLoadMoreState() {
    if (!loadingMore && !hasMore) return null;
    return <div className="h-3" aria-hidden="true" />;
  }
  const rowHeight = Math.round(thumbSize * 0.66);
  const justified = buildJustifiedLayout(items, Math.max(containerWidth - 32, 0), rowHeight, 12, 38);
  const gridMetrics = useMemo(() => {
    const availableWidth = Math.max(containerWidth - 32, thumbSize);
    const columnCount = Math.max(1, Math.floor((availableWidth + GAP) / (thumbSize + GAP)));
    const cellWidth = (availableWidth - GAP * (columnCount - 1)) / columnCount;
    const cardHeight = cellWidth / GRID_ASPECT_RATIO + GRID_CAPTION_HEIGHT;
    const rowStride = cardHeight + GAP;
    const totalRows = Math.ceil(items.length / columnCount);
    const startRow = Math.max(0, Math.floor(scrollTop / rowStride) - GRID_OVERSCAN_ROWS);
    const endRow = Math.min(
      totalRows,
      Math.ceil((scrollTop + viewportHeight) / rowStride) + GRID_OVERSCAN_ROWS,
    );
    const visibleItems = [];
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const itemIndex = rowIndex * columnCount + columnIndex;
        const item = items[itemIndex];
        if (!item) break;
        visibleItems.push({
          item,
          left: columnIndex * (cellWidth + GAP),
          top: rowIndex * rowStride,
          width: cellWidth,
          cardHeight,
        });
      }
    }
    return {
      cellWidth,
      cardHeight,
      totalHeight: Math.max(0, totalRows * rowStride - GAP),
      visibleItems,
    };
  }, [containerWidth, items, scrollTop, thumbSize, viewportHeight]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        Loading assets…
      </div>
    );
  }
  if (!items.length) {
    return <div className="px-6 py-12 text-sm text-muted">No assets in this view.</div>;
  }

  if (displayMode === "justified" && justified.rows.length) {
    return (
      <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-auto px-4 py-4">
        <div key="justified-layout" className="relative" style={{ height: `${Math.ceil(justified.containerHeight)}px` }}>
          {justified.rows.map((row) =>
            row.map(({ item, width, height, left, top }) => {
              const title = fileName(item.export_path) || item.stem;
              const selected = item.export_path === selectedExportPath;
              return (
                <button
                  key={item.export_path}
                  type="button"
                  onClick={() => onSelect(item.export_path)}
                  className="justified-card group absolute text-center"
                  style={{
                    width: `${width}px`,
                    height: `${height + 52}px`,
                    left: `${left}px`,
                    top: `${top}px`,
                    minWidth: 0,
                  }}
                >
                  <div
                    className={[
                      "relative overflow-hidden rounded-[10px] border bg-panel2 transition",
                      selected ? "border-accent shadow-[0_0_0_2px_rgba(47,108,224,0.12)]" : "border-border group-hover:border-muted/60",
                    ].join(" ")}
                    style={{ height: `${height}px` }}
                  >
                    {item.preview_path ? (
                      <PreviewImage
                        src={localFileUrl(item.preview_path)}
                        alt={item.stem}
                        scrollRootRef={containerRef}
                        fit="contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted">No preview</div>
                    )}
                  </div>
                  <div className="min-h-[52px] pt-1">
                    <div className="line-clamp-2-custom break-all text-[11px] font-medium leading-[1.15] text-text">{title}</div>
                    <div className="mt-0.5 text-[10px] text-muted">{galleryInfoLabel(item)}</div>
                  </div>
                </button>
              );
            }),
          )}
        </div>
        {renderLoadMoreState()}
      </div>
    );
  }

  if (displayMode === "waterfall") {
    return (
      <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-auto px-4 py-4">
        <div style={{ columnWidth: `${thumbSize}px`, columnGap: "12px" }}>
          {items.map((item) => {
            const exportMeta = item.export_metadata || {};
            const width = Number(exportMeta.width || 0);
            const height = Number(exportMeta.height || 0);
            const aspect = width > 0 && height > 0 ? width / height : 1;
            const title = fileName(item.export_path) || item.stem;
            const selected = item.export_path === selectedExportPath;
            return (
              <button
                key={item.export_path}
                type="button"
                onClick={() => onSelect(item.export_path)}
                className="waterfall-card group mb-4 inline-block w-full break-inside-avoid text-center align-top"
              >
                <div
                  className={[
                    "relative overflow-hidden rounded-[10px] border bg-panel2 transition",
                    selected ? "border-accent shadow-[0_0_0_2px_rgba(47,108,224,0.12)]" : "border-border group-hover:border-muted/60",
                  ].join(" ")}
                  style={{ aspectRatio: `${aspect || 1}` }}
                >
                  {item.preview_path ? (
                    <PreviewImage
                      src={localFileUrl(item.preview_path)}
                      alt={item.stem}
                      scrollRootRef={containerRef}
                      fit="cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted">No preview</div>
                  )}
                </div>
                <div className="pt-1">
                  <div className="line-clamp-2-custom break-all text-[11px] font-medium leading-[1.15] text-text">{title}</div>
                  <div className="mt-0.5 text-[10px] text-muted">{galleryInfoLabel(item)}</div>
                </div>
              </button>
            );
          })}
        </div>
        {renderLoadMoreState()}
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-auto px-4 py-4">
      <div className="relative" style={{ height: `${gridMetrics.totalHeight}px` }}>
        {gridMetrics.visibleItems.map(({ item, left, top, width, cardHeight }) => {
          const title = fileName(item.export_path) || item.stem;
          const selected = item.export_path === selectedExportPath;
          return (
            <button
              key={item.export_path}
              type="button"
              onClick={() => onSelect(item.export_path)}
              className="grid-card group absolute text-center"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${cardHeight}px`,
              }}
            >
              <div
                className={[
                  "relative overflow-hidden rounded-[10px] border bg-panel2 transition",
                  selected ? "border-accent shadow-[0_0_0_2px_rgba(47,108,224,0.12)]" : "border-border group-hover:border-muted/60",
                ].join(" ")}
                style={{ height: `${width / GRID_ASPECT_RATIO}px` }}
              >
                {item.preview_path ? (
                  <PreviewImage
                    src={localFileUrl(item.preview_path)}
                    alt={item.stem}
                    scrollRootRef={containerRef}
                    fit="cover"
                  />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted">No preview</div>
                )}
              </div>
              <div className="pt-1">
                <div className="line-clamp-2-custom break-all text-[11px] font-medium leading-[1.15] text-text">{title}</div>
                <div className="mt-0.5 text-[10px] text-muted">{galleryInfoLabel(item)}</div>
              </div>
            </button>
          );
        })}
      </div>
      {renderLoadMoreState()}
    </div>
  );
}
