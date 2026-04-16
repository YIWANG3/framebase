import { useEffect, useMemo, useState } from "react";
import { filterTitle } from "./utils/format";
import useWorkspace from "./hooks/useWorkspace";
import usePaneResize from "./hooks/usePaneResize";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import Gallery from "./components/Gallery";
import Inspector from "./components/Inspector";
import ImportOverlay from "./components/ImportOverlay";
import Lightbox from "./components/Lightbox";
import EditorOverlay from "./components/EditorOverlay";

export default function App() {
  const workspace = useWorkspace();
  const [showSidebar] = useState(true);
  const [showInspector] = useState(true);
  const [displayMode, setDisplayMode] = useState("grid");
  const [thumbSize, setThumbSize] = useState(180);
  const [history, setHistory] = useState(["all"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editorItem, setEditorItem] = useState(null);
  const [proofMode, setProofMode] = useState(false);
  const [layoutItems, setLayoutItems] = useState([]);
  const [selectedExportPaths, setSelectedExportPaths] = useState([]);
  const [selectionAnchorPath, setSelectionAnchorPath] = useState(null);
  const resizeSidebar = usePaneResize(workspace.setSidebarWidth, 200, 360);
  const resizeInspector = usePaneResize((value) => workspace.setInspectorWidth(-value), -420, -240);
  const currentItems = workspace.filteredItems;
  const orderedPaths = useMemo(() => currentItems.map((item) => item.export_path), [currentItems]);
  const itemByExportPath = useMemo(
    () => new Map(currentItems.map((item) => [item.export_path, item])),
    [currentItems],
  );
  const selectedPathSet = useMemo(() => new Set(selectedExportPaths), [selectedExportPaths]);
  const selectedAssetIds = useMemo(
    () =>
      selectedExportPaths
        .map((path) => itemByExportPath.get(path)?.asset_id)
        .filter((assetId) => assetId != null),
    [selectedExportPaths, itemByExportPath],
  );
  const selectedIndex = useMemo(
    () => currentItems.findIndex((item) => item.export_path === workspace.selectedExportPath),
    [currentItems, workspace.selectedExportPath],
  );

  const layoutStyle = {
    gridTemplateColumns: [
      showSidebar ? `${workspace.sidebarWidth}px` : "0px",
      "minmax(0, 1fr)",
      showInspector ? `${workspace.inspectorWidth}px` : "0px",
    ].join(" "),
    gridTemplateRows: "minmax(0, 1fr)",
  };

  function commitSelection(nextPaths, primaryPath, anchorPath = primaryPath) {
    const deduped = [];
    const seen = new Set();
    for (const path of nextPaths) {
      if (!path || seen.has(path) || !itemByExportPath.has(path)) continue;
      seen.add(path);
      deduped.push(path);
    }
    const nextPrimary = primaryPath && itemByExportPath.has(primaryPath) ? primaryPath : deduped[0] || null;
    setSelectedExportPaths(deduped);
    setSelectionAnchorPath(anchorPath && itemByExportPath.has(anchorPath) ? anchorPath : nextPrimary);
    workspace.setSelectedExportPath(nextPrimary);
  }

  function selectSingle(path) {
    commitSelection(path ? [path] : [], path, path);
  }

  function toggleSelection(path) {
    if (!path) return;
    if (selectedPathSet.has(path)) {
      const nextPaths = selectedExportPaths.filter((itemPath) => itemPath !== path);
      const nextPrimary =
        workspace.selectedExportPath === path ? nextPaths[nextPaths.length - 1] || null : workspace.selectedExportPath;
      commitSelection(nextPaths, nextPrimary, selectionAnchorPath === path ? nextPrimary : selectionAnchorPath);
      return;
    }
    commitSelection([...selectedExportPaths, path], path, selectionAnchorPath || path);
  }

  function selectRange(path, append = false) {
    if (!path) return;
    const anchor = selectionAnchorPath || workspace.selectedExportPath || path;
    const anchorIndex = orderedPaths.indexOf(anchor);
    const targetIndex = orderedPaths.indexOf(path);
    if (anchorIndex < 0 || targetIndex < 0) {
      selectSingle(path);
      return;
    }
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const rangePaths = orderedPaths.slice(start, end + 1);
    const nextPaths = append ? [...selectedExportPaths, ...rangePaths] : rangePaths;
    commitSelection(nextPaths, path, anchor);
  }

  function handleItemSelect(path, event) {
    if (!event) {
      selectSingle(path);
      return;
    }
    const isToggle = event.metaKey || event.ctrlKey;
    if (event.shiftKey) {
      selectRange(path, isToggle);
      return;
    }
    if (isToggle) {
      toggleSelection(path);
      return;
    }
    selectSingle(path);
  }

  function openLightboxForPath(path) {
    if (!path) return;
    selectSingle(path);
    setProofMode(false);
    setLightboxOpen(true);
  }

  function handleContextSelect(path) {
    if (selectedPathSet.has(path)) {
      workspace.setSelectedExportPath(path);
      return;
    }
    selectSingle(path);
  }

  function handleSelectionGroup(paths, primaryPath, anchorPath = primaryPath) {
    commitSelection(paths, primaryPath, anchorPath);
  }

  function clearSelection() {
    setSelectedExportPaths([]);
    setSelectionAnchorPath(null);
    workspace.setSelectedExportPath(null);
  }

  function applyRating(nextRating) {
    const targetIds = selectedAssetIds.length
      ? selectedAssetIds
      : [itemByExportPath.get(workspace.selectedExportPath)?.asset_id].filter((assetId) => assetId != null);
    if (!targetIds.length) return;
    void workspace.setAssetRating(targetIds, nextRating);
  }

  function prepareDragSelection(path) {
    if (selectedPathSet.has(path) && selectedAssetIds.length > 1) {
      workspace.setSelectedExportPath(path);
      return {
        assetIds: selectedAssetIds,
        exportPaths: selectedExportPaths,
      };
    }
    selectSingle(path);
    return {
      assetIds: [itemByExportPath.get(path)?.asset_id].filter((assetId) => assetId != null),
      exportPaths: [path],
    };
  }

  function selectByIndex(index) {
    const next = currentItems[index];
    if (!next) return;
    selectSingle(next.export_path);
  }

  function moveSelection(offset) {
    if (!currentItems.length) return;
    if (selectedIndex < 0) {
      selectByIndex(offset >= 0 ? 0 : currentItems.length - 1);
      return;
    }
    const nextIndex = selectedIndex + offset;
    if (nextIndex < 0 || nextIndex >= currentItems.length) return;
    selectByIndex(nextIndex);
  }

  function selectByDirection(direction) {
    if (!currentItems.length) return;
    if (!workspace.selectedExportPath) {
      selectByIndex(0);
      return;
    }

    const current = layoutItems.find((item) => item.exportPath === workspace.selectedExportPath);
    if (!current) {
      moveSelection(direction === "left" || direction === "up" ? -1 : 1);
      return;
    }

    const isForward = direction === "right" || direction === "down";
    const curCenterX = current.left + current.width / 2;
    const curCenterY = current.top + current.height / 2;

    // Helper: group layout items by a positional property with tolerance
    function groupByPosition(items, getPos, tolerance) {
      const groups = [];
      for (const item of items) {
        const pos = getPos(item);
        const existing = groups.find((g) => Math.abs(g.key - pos) < tolerance);
        if (existing) {
          existing.items.push(item);
        } else {
          groups.push({ key: pos, items: [item] });
        }
      }
      groups.sort((a, b) => a.key - b.key);
      return groups;
    }

    // --- Grid: left/right = ±1, up/down = ±columnCount ---
    if (displayMode === "grid" || displayMode === "tiles") {
      if (direction === "left" || direction === "right") {
        moveSelection(isForward ? 1 : -1);
      } else {
        const colCount = layoutItems.filter((c) => Math.abs(c.top - current.top) < 2).length || 1;
        moveSelection(isForward ? colCount : -colCount);
      }
      return;
    }

    // --- Justified: left/right = sequential, up/down = closest X in adjacent row ---
    if (displayMode === "justified") {
      if (direction === "left" || direction === "right") {
        moveSelection(isForward ? 1 : -1);
        return;
      }
      const rows = groupByPosition(layoutItems, (item) => item.top, 8);
      const curRowIdx = rows.findIndex((r) => r.items.some((item) => item.exportPath === current.exportPath));
      const targetRowIdx = isForward ? curRowIdx + 1 : curRowIdx - 1;
      if (targetRowIdx < 0 || targetRowIdx >= rows.length) return;
      const targetRow = rows[targetRowIdx].items;
      let best = targetRow[0];
      let bestDist = Infinity;
      for (const item of targetRow) {
        const dist = Math.abs(item.left + item.width / 2 - curCenterX);
        if (dist < bestDist) { bestDist = dist; best = item; }
      }
      workspace.setSelectedExportPath(best.exportPath);
      return;
    }

    // --- Waterfall: left/right = adjacent column closest Y, up/down = same column ---
    if (displayMode === "waterfall") {
      const columns = groupByPosition(layoutItems, (item) => item.left, 4);
      for (const col of columns) col.items.sort((a, b) => a.top - b.top);
      const curColIdx = columns.findIndex((c) => c.items.some((item) => item.exportPath === current.exportPath));
      const curCol = columns[curColIdx];
      const curItemInColIdx = curCol.items.findIndex((item) => item.exportPath === current.exportPath);

      if (direction === "left" || direction === "right") {
        const targetColIdx = isForward ? curColIdx + 1 : curColIdx - 1;
        if (targetColIdx < 0 || targetColIdx >= columns.length) return;
        const targetCol = columns[targetColIdx].items;
        let best = targetCol[0];
        let bestDist = Infinity;
        for (const item of targetCol) {
          const dist = Math.abs(item.top + item.height / 2 - curCenterY);
          if (dist < bestDist) { bestDist = dist; best = item; }
        }
        workspace.setSelectedExportPath(best.exportPath);
      } else {
        const targetIdx = isForward ? curItemInColIdx + 1 : curItemInColIdx - 1;
        if (targetIdx < 0 || targetIdx >= curCol.items.length) return;
        workspace.setSelectedExportPath(curCol.items[targetIdx].exportPath);
      }
      return;
    }
  }

  function openEditor(target) {
    const nextItem =
      typeof target === "string"
        ? itemByExportPath.get(target)
        : target?.export_path
          ? itemByExportPath.get(target.export_path) || target
          : itemByExportPath.get(workspace.selectedExportPath);
    if (!nextItem) return;
    setEditorItem(nextItem);
  }

  useEffect(() => {
    if (!workspace.selectedExportPath) {
      setLightboxOpen(false);
      setProofMode(false);
      setEditorItem(null);
    }
  }, [workspace.selectedExportPath]);

  useEffect(() => {
    const validPaths = new Set(orderedPaths);
    setSelectedExportPaths((current) => {
      const next = current.filter((path) => validPaths.has(path));
      const primaryPath =
        workspace.selectedExportPath && validPaths.has(workspace.selectedExportPath) ? workspace.selectedExportPath : null;
      if (primaryPath) {
        if (!next.length) return [primaryPath];
        if (!next.includes(primaryPath)) return [primaryPath];
        return next;
      }
      return next;
    });
    setSelectionAnchorPath((current) => {
      if (current && validPaths.has(current)) return current;
      if (workspace.selectedExportPath && validPaths.has(workspace.selectedExportPath)) {
        return workspace.selectedExportPath;
      }
      return orderedPaths[0] || null;
    });
  }, [orderedPaths, workspace.selectedExportPath]);

  useEffect(() => {
    function shouldIgnoreKey(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName;
      return target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
    }

    function handleKeyDown(event) {
      if (editorItem) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreKey(event)) return;

      if (event.code === "Space") {
        if (!workspace.selectedExportPath) return;
        event.preventDefault();
        setLightboxOpen((current) => !current);
        return;
      }

      if (/^[0-5]$/.test(event.key) && (selectedAssetIds.length || workspace.selectedExportPath)) {
        event.preventDefault();
        applyRating(Number(event.key));
        return;
      }

      if (lightboxOpen && event.key.toLowerCase() === "e") {
        event.preventDefault();
        openEditor();
        return;
      }

      if (lightboxOpen && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setProofMode((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        if (!lightboxOpen) return;
        event.preventDefault();
        if (proofMode) {
          setProofMode(false);
        } else {
          setLightboxOpen(false);
        }
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        selectByDirection(event.key === "ArrowLeft" ? "left" : "up");
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        selectByDirection(event.key === "ArrowRight" ? "right" : "down");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentItems, displayMode, editorItem, layoutItems, lightboxOpen, openEditor, proofMode, selectedIndex, workspace.selectedExportPath, selectedAssetIds]);

  return (
    <div className="noise-overlay h-full overflow-hidden bg-app text-text">
      <div className="relative grid h-full min-w-0 overflow-hidden" style={layoutStyle}>
        {showSidebar ? <Sidebar
          info={workspace.info}
          summary={workspace.summary}
          status={workspace.status}
          setStatus={(next) => {
            const baseHistory = history.slice(0, historyIndex + 1);
            const nextHistory = baseHistory[baseHistory.length - 1] === next ? baseHistory : [...baseHistory, next];
            const nextIndex = nextHistory.length - 1;
            setHistory(nextHistory);
            setHistoryIndex(nextIndex);
            workspace.setStatus(next);
            void workspace.refreshAll({ nextStatus: next, collectionId: null });
          }}
          collections={workspace.collections}
          activeCollectionId={workspace.activeCollectionId}
          onSelectCollection={workspace.selectCollection}
          onClearCollection={workspace.clearCollection}
          onCreateCollection={workspace.createCollection}
          onRenameCollection={workspace.renameCollection}
          onDeleteCollection={workspace.deleteCollection}
          onAddToCollection={workspace.addToCollection}
        /> : <div className="bg-chrome" />}

        <section className="flex min-w-0 min-h-0 flex-col overflow-hidden bg-app">
          <Toolbar
            title={workspace.activeCollectionId
              ? (workspace.collections.find((c) => c.collection_id === workspace.activeCollectionId)?.name || "Folder")
              : filterTitle(workspace.status)}
            query={workspace.query}
            setQuery={workspace.setQuery}
            sort={workspace.sort}
            setSort={workspace.setSort}
            refreshAll={workspace.refreshAll}
            onAddProcessed={workspace.addProcessedMedia}
            onAddSources={workspace.addSources}
            onRunImport={workspace.runImportPipeline}
            onRunEnrichment={workspace.runEnrichment}
            onRunPreviews={workspace.runPreviewGeneration}
            onBack={() => {
              if (historyIndex <= 0) return;
              const nextIndex = historyIndex - 1;
              const next = history[nextIndex];
              setHistoryIndex(nextIndex);
              workspace.setStatus(next);
              void workspace.refreshAll({ nextStatus: next, collectionId: null });
            }}
            onForward={() => {
              if (historyIndex >= history.length - 1) return;
              const nextIndex = historyIndex + 1;
              const next = history[nextIndex];
              setHistoryIndex(nextIndex);
              workspace.setStatus(next);
              void workspace.refreshAll({ nextStatus: next, collectionId: null });
            }}
            canGoBack={historyIndex > 0}
            canGoForward={historyIndex < history.length - 1}
            displayMode={displayMode}
            setDisplayMode={setDisplayMode}
            thumbSize={thumbSize}
            setThumbSize={setThumbSize}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
              <Gallery
                items={workspace.filteredItems}
                selectedExportPath={workspace.selectedExportPath}
                selectedExportPaths={selectedExportPaths}
                onSelect={handleItemSelect}
                onOpen={openLightboxForPath}
                onSelectMany={handleSelectionGroup}
                onContextSelect={handleContextSelect}
                onClearSelection={clearSelection}
                onPrepareDragSelection={prepareDragSelection}
                onLayoutItemsChange={setLayoutItems}
                loading={workspace.browserLoading}
                browserReady={workspace.browserReady}
                loadingMore={workspace.browserLoadingMore}
                hasMore={workspace.browserHasMore}
                onLoadMore={workspace.loadMoreBrowser}
                displayMode={displayMode}
                thumbSize={thumbSize}
                totalCount={Number(workspace.summary?.export_assets ?? 0)}
                collections={workspace.collections}
                activeCollectionId={workspace.activeCollectionId}
                selectedAssetIds={selectedAssetIds}
                onAddToCollection={workspace.addToCollection}
                onRemoveFromCollection={workspace.removeFromCollection}
                onEdit={openEditor}
              />
          </div>
        </section>

        {showInspector ? <Inspector detail={workspace.detail} onRatingChange={applyRating} /> : <div className="bg-chrome" />}

        {showSidebar ? (
          <div
            data-value={workspace.sidebarWidth}
            onMouseDown={resizeSidebar}
            className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize transition-colors before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent hover:before:bg-border"
            style={{ left: `${workspace.sidebarWidth}px` }}
          />
        ) : null}

        {showInspector ? (
          <div
            data-value={-workspace.inspectorWidth}
            onMouseDown={resizeInspector}
            className="absolute inset-y-0 z-20 w-3 translate-x-1/2 cursor-col-resize transition-colors before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent hover:before:bg-border"
            style={{ right: `${workspace.inspectorWidth}px` }}
          />
        ) : null}
      </div>

      <ImportOverlay overlay={workspace.activeOverlay} />
      <Lightbox
        open={lightboxOpen}
        items={currentItems}
        currentIndex={Math.max(selectedIndex, 0)}
        proofMode={proofMode}
        onToggleProof={() => setProofMode((current) => !current)}
        onEdit={openEditor}
        onClose={() => {
          setProofMode(false);
          setLightboxOpen(false);
        }}
        onIndexChange={selectByIndex}
      />
      <EditorOverlay
        open={!!editorItem}
        item={editorItem}
        onClose={() => setEditorItem(null)}
        onSaveComplete={async () => {
          await workspace.refreshAll?.();
        }}
      />
    </div>
  );
}
