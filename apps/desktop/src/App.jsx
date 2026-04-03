import { useState } from "react";
import { filterTitle } from "./utils/format";
import useWorkspace from "./hooks/useWorkspace";
import usePaneResize from "./hooks/usePaneResize";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import Gallery from "./components/Gallery";
import Inspector from "./components/Inspector";
import ImportOverlay from "./components/ImportOverlay";

export default function App() {
  const workspace = useWorkspace();
  const [showSidebar] = useState(true);
  const [showInspector] = useState(true);
  const [displayMode, setDisplayMode] = useState("grid");
  const [thumbSize, setThumbSize] = useState(180);
  const [history, setHistory] = useState(["all"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const resizeSidebar = usePaneResize(workspace.setSidebarWidth, 200, 360);
  const resizeInspector = usePaneResize((value) => workspace.setInspectorWidth(-value), -420, -240);

  const layoutStyle = {
    gridTemplateColumns: [
      showSidebar ? `${workspace.sidebarWidth}px` : "0px",
      showSidebar ? "1px" : "0px",
      "minmax(0, 1fr)",
      showInspector ? "1px" : "0px",
      showInspector ? `${workspace.inspectorWidth}px` : "0px",
    ].join(" "),
    gridTemplateRows: "minmax(0, 1fr)",
  };

  return (
    <div className="h-full overflow-hidden bg-app text-text">
      <div className="grid h-full min-w-0 overflow-hidden" style={layoutStyle}>
        {showSidebar ? <Sidebar info={workspace.info} summary={workspace.summary} status={workspace.status} setStatus={(next) => {
          const baseHistory = history.slice(0, historyIndex + 1);
          const nextHistory = baseHistory[baseHistory.length - 1] === next ? baseHistory : [...baseHistory, next];
          const nextIndex = nextHistory.length - 1;
          setHistory(nextHistory);
          setHistoryIndex(nextIndex);
          workspace.setStatus(next);
          void workspace.refreshAll({ nextStatus: next });
        }} /> : <div className="border-r border-border bg-panel" />}

        <div
          data-value={workspace.sidebarWidth}
          onMouseDown={resizeSidebar}
          className={`w-[1px] cursor-col-resize bg-border ${showSidebar ? "block" : "hidden"}`}
        />

        <section className="flex min-w-0 min-h-0 flex-col overflow-hidden bg-app">
          <Toolbar
            title={filterTitle(workspace.status)}
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
              void workspace.refreshAll({ nextStatus: next });
            }}
            onForward={() => {
              if (historyIndex >= history.length - 1) return;
              const nextIndex = historyIndex + 1;
              const next = history[nextIndex];
              setHistoryIndex(nextIndex);
              workspace.setStatus(next);
              void workspace.refreshAll({ nextStatus: next });
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
                onSelect={workspace.setSelectedExportPath}
                loading={workspace.browserLoading}
                loadingMore={workspace.browserLoadingMore}
                hasMore={workspace.browserHasMore}
                onLoadMore={workspace.loadMoreBrowser}
                displayMode={displayMode}
                thumbSize={thumbSize}
              />
          </div>
        </section>

        <div
          data-value={-workspace.inspectorWidth}
          onMouseDown={resizeInspector}
          className={`w-[1px] cursor-col-resize bg-border ${showInspector ? "block" : "hidden"}`}
        />

        {showInspector ? <Inspector detail={workspace.detail} /> : <div className="border-l border-border bg-panel" />}
      </div>

      <ImportOverlay overlay={workspace.activeOverlay} />
    </div>
  );
}
