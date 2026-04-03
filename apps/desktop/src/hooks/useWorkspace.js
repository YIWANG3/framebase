import { useEffect, useMemo, useRef, useState } from "react";
import { collapseRootPaths, mergeRoots, determineImportMode, formatPercent, progressNote } from "../utils/format";

const PAGE_SIZE = 180;
const THEME_STORAGE_KEY = "framebase-theme";
const SIDEBAR_WIDTH_STORAGE_KEY = "framebase-sidebar-width";
const INSPECTOR_WIDTH_STORAGE_KEY = "framebase-inspector-width";

export default function useWorkspace() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || "light");
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || 240));
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    Number(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY) || 300),
  );
  const [info, setInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [roots, setRoots] = useState([]);
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [query, setQuery] = useState("");
  const [selectedExportPath, setSelectedExportPath] = useState(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserLoadingMore, setBrowserLoadingMore] = useState(false);
  const [browserHasMore, setBrowserHasMore] = useState(true);
  const [browserOffset, setBrowserOffset] = useState(0);
  const [importTask, setImportTask] = useState(null);
  const [previewTask, setPreviewTask] = useState(null);
  const [enrichmentTask, setEnrichmentTask] = useState(null);
  const [pendingImport, setPendingImport] = useState({ rawDirs: [], exportDirs: [] });
  const importPollRef = useRef(null);
  const enrichmentPollRef = useRef(null);
  const previewPollRef = useRef(null);

  const rawDirs = useMemo(
    () => roots.filter((item) => item.root_type === "raw").map((item) => item.path),
    [roots],
  );
  const exportDirs = useMemo(
    () => roots.filter((item) => item.root_type === "export").map((item) => item.path),
    [roots],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    document.documentElement.style.setProperty("--inspector-width", `${inspectorWidth}px`);
    localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  const filteredItems = useMemo(() => {
    let nextItems = [...items];
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      nextItems = nextItems.filter((item) =>
        [item.stem, item.export_path, item.raw_path, item.export_metadata?.camera_model, item.raw_metadata?.camera_model]
          .some((field) => String(field ?? "").toLowerCase().includes(normalizedQuery)),
      );
    }
    if (sort === "name-desc") nextItems.sort((a, b) => b.stem.localeCompare(a.stem));
    else if (sort === "score-desc") nextItems.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
    else nextItems.sort((a, b) => a.stem.localeCompare(b.stem));
    return nextItems;
  }, [items, query, sort]);

  const activeOverlay = useMemo(() => {
    const queuedRawCount = pendingImport.rawDirs.length;
    const queuedExportCount = pendingImport.exportDirs.length;
    if (importTask?.running || enrichmentTask?.running || previewTask?.running || importTask?.error || previewTask?.error || enrichmentTask?.error || queuedRawCount || queuedExportCount) {
      return {
        visible: true,
        title: importTask?.running
          ? `Import running: ${importTask.phaseLabel || importTask.phase || "Starting"} (${importTask.phaseIndex}/${importTask.phaseCount || 1}, ${formatPercent(importTask.progress)})`
          : enrichmentTask?.running
            ? "Enrichment running"
            : previewTask?.running
              ? "Generating previews"
              : "Import attention needed",
        status: importTask?.running
          ? "Import in progress"
          : enrichmentTask?.running
            ? "Enrichment in progress"
            : previewTask?.running
              ? "Preview generation in progress"
              : "Pending changes",
        percent: importTask?.running
          ? formatPercent(importTask.progress)
          : previewTask?.running
            ? formatPercent(previewTask.progress)
            : enrichmentTask?.running
              ? formatPercent(enrichmentTask.progress)
              : "",
        notes: [
          progressNote(importTask),
          progressNote(previewTask),
          progressNote(enrichmentTask),
          queuedRawCount || queuedExportCount
            ? `Queued changes: ${queuedExportCount} processed media · ${queuedRawCount} sources`
            : "",
          importTask?.error || previewTask?.error || enrichmentTask?.error || "",
        ].filter(Boolean),
        phases: Array.isArray(importTask?.phaseResults) ? importTask.phaseResults.map((phase) => phase.label) : [],
      };
    }
    return { visible: false, title: "", status: "", percent: "", notes: [], phases: [] };
  }, [importTask, enrichmentTask, previewTask, pendingImport]);

  async function loadDetail(exportPath) {
    if (!exportPath) {
      setDetail(null);
      return;
    }
    const payload = await window.mediaWorkspace.getAssetDetail(exportPath);
    setDetail(payload);
  }

  async function loadBrowser({ nextStatus = status, append = false } = {}) {
    if (append ? browserLoadingMore || browserLoading || !browserHasMore : browserLoading) {
      return;
    }
    if (append) {
      setBrowserLoadingMore(true);
    } else {
      setBrowserLoading(true);
    }
    try {
      const nextOffset = append ? browserOffset : 0;
      const payload = await window.mediaWorkspace.browseExports({
        status: nextStatus,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setBrowserOffset(nextOffset + payload.length);
      setBrowserHasMore(payload.length === PAGE_SIZE);
      if (append) {
        setItems((current) => [...current, ...payload]);
      } else {
        setItems(payload);
        const firstPath = payload[0]?.export_path || null;
        const nextSelectedPath =
          selectedExportPath && payload.some((item) => item.export_path === selectedExportPath)
            ? selectedExportPath
            : firstPath;
        setSelectedExportPath(nextSelectedPath);
        await loadDetail(nextSelectedPath || null);
      }
    } finally {
      if (append) {
        setBrowserLoadingMore(false);
      } else {
        setBrowserLoading(false);
      }
    }
  }

  async function loadMoreBrowser() {
    await loadBrowser({ nextStatus: status, append: true });
  }

  async function refreshAll({ nextStatus = status } = {}) {
    const [nextInfo, nextSummary, nextRoots, nextImportTask, nextPreviewTask, nextEnrichmentTask] = await Promise.all([
      window.mediaWorkspace.getInfo(),
      window.mediaWorkspace.getSummary(),
      window.mediaWorkspace.getCatalogRoots(),
      window.mediaWorkspace.getImportStatus(),
      window.mediaWorkspace.getPreviewStatus(),
      window.mediaWorkspace.getEnrichmentStatus(),
    ]);
    setInfo(nextInfo);
    setSummary(nextSummary);
    setRoots(nextRoots);
    setImportTask(nextImportTask);
    setPreviewTask(nextPreviewTask);
    setEnrichmentTask(nextEnrichmentTask);
    await loadBrowser({ nextStatus });
  }

  async function startIncrementalImport({ rawDirs: nextRawDirs = [], exportDirs: nextExportDirs = [], fullCatalog = false }) {
    let resolvedRawDirs = collapseRootPaths(nextRawDirs);
    let resolvedExportDirs = collapseRootPaths(nextExportDirs);

    if (fullCatalog) {
      resolvedRawDirs = collapseRootPaths(rawDirs);
      resolvedExportDirs = collapseRootPaths(exportDirs);
    }
    if (!resolvedRawDirs.length && !resolvedExportDirs.length) return;

    let mode = determineImportMode(summary, { rawDirs: resolvedRawDirs, exportDirs: resolvedExportDirs });
    if (mode === "source_with_media" && !resolvedExportDirs.length) {
      resolvedExportDirs = collapseRootPaths(exportDirs);
    }
    if (mode === "processed_with_sources" && resolvedRawDirs.length) {
      resolvedRawDirs = [];
    }
    mode = determineImportMode(summary, { rawDirs: resolvedRawDirs, exportDirs: resolvedExportDirs });

    const modeNeedsSources = mode === "source_only" || mode === "source_with_media" || mode === "combined";
    const modeNeedsProcessed = mode === "processed_only" || mode === "processed_with_sources" || mode === "combined";
    if (modeNeedsSources && !resolvedRawDirs.length) return;
    if (modeNeedsProcessed && !resolvedExportDirs.length) return;

    const task = await window.mediaWorkspace.startImport({
      rawDirs: resolvedRawDirs,
      exportDirs: resolvedExportDirs,
      mode,
    });
    setImportTask(task);
  }

  async function addProcessedMedia() {
    const selected = await window.mediaWorkspace.pickDirectories("export");
    if (!selected.length) return;
    await window.mediaWorkspace.registerRoots("export", selected);
    const nextRoots = mergeRoots(exportDirs, selected);
    setRoots((current) => [...current, ...selected.map((path) => ({ root_type: "export", path }))]);
    if (importTask?.running) {
      setPendingImport((current) => ({ ...current, exportDirs: mergeRoots(current.exportDirs, selected) }));
      return;
    }
    await startIncrementalImport({ exportDirs: nextRoots.length ? selected : [] });
    await refreshAll();
  }

  async function addSources() {
    const selected = await window.mediaWorkspace.pickDirectories("raw");
    if (!selected.length) return;
    await window.mediaWorkspace.registerRoots("raw", selected);
    setRoots((current) => [...current, ...selected.map((path) => ({ root_type: "raw", path }))]);
    if (importTask?.running) {
      setPendingImport((current) => ({ ...current, rawDirs: mergeRoots(current.rawDirs, selected) }));
      return;
    }
    await startIncrementalImport({ rawDirs: selected, exportDirs });
    await refreshAll();
  }

  async function runImportPipeline() {
    if (importTask?.running) return;
    await startIncrementalImport({ fullCatalog: true });
    await refreshAll();
  }

  async function runEnrichment() {
    if (importTask?.running || enrichmentTask?.running) return;
    const task = await window.mediaWorkspace.startEnrichment();
    setEnrichmentTask(task);
  }

  async function runPreviewGeneration() {
    if (importTask?.running || previewTask?.running) return;
    const task = await window.mediaWorkspace.startPreviewGeneration();
    setPreviewTask(task);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!selectedExportPath) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedExportPath);
  }, [selectedExportPath]);

  useEffect(() => {
    if (!window.mediaWorkspace.onMenuAction) return undefined;
    window.mediaWorkspace.onMenuAction(async (action) => {
      if (action === "catalog:new") {
        const created = await window.mediaWorkspace.createCatalog();
        if (created) await window.mediaWorkspace.switchCatalog(created);
      } else if (action === "catalog:open") {
        const selected = await window.mediaWorkspace.pickCatalog();
        if (selected) await window.mediaWorkspace.switchCatalog(selected);
      } else if (action === "catalog:scratch") {
        await window.mediaWorkspace.switchCatalog(null);
      } else if (action === "import:pick-export") {
        await addProcessedMedia();
      } else if (action === "import:pick-source") {
        await addSources();
      } else if (action === "import:start") {
        await runImportPipeline();
      } else if (action === "import:enrich") {
        await runEnrichment();
      } else if (action === "import:previews") {
        await runPreviewGeneration();
      } else if (action === "view:toggle-theme") {
        setTheme((current) => (current === "dark" ? "light" : "dark"));
      } else if (action === "view:refresh") {
        await refreshAll();
      }
    });
    return undefined;
  }, [importTask, exportDirs, rawDirs, summary, previewTask, enrichmentTask]);

  useEffect(() => {
    if (!importTask?.running) {
      if (importPollRef.current) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
      }
      return undefined;
    }
    importPollRef.current = window.setInterval(async () => {
      const task = await window.mediaWorkspace.getImportStatus();
      setImportTask(task);
      if (!task?.running) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
        const queuedRawDirs = pendingImport.rawDirs;
        const queuedExportDirs = pendingImport.exportDirs;
        setPendingImport({ rawDirs: [], exportDirs: [] });
        await refreshAll();
        if (queuedRawDirs.length || queuedExportDirs.length) {
          await startIncrementalImport({ rawDirs: queuedRawDirs, exportDirs: queuedExportDirs });
        }
      }
    }, 1200);
    return () => {
      if (importPollRef.current) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
      }
    };
  }, [importTask?.running, pendingImport.rawDirs, pendingImport.exportDirs]);

  useEffect(() => {
    if (!previewTask?.running) {
      if (previewPollRef.current) {
        clearInterval(previewPollRef.current);
        previewPollRef.current = null;
      }
      return undefined;
    }
    previewPollRef.current = window.setInterval(async () => {
      const task = await window.mediaWorkspace.getPreviewStatus();
      setPreviewTask(task);
      if (!task?.running) {
        clearInterval(previewPollRef.current);
        previewPollRef.current = null;
        await refreshAll();
      }
    }, 1500);
    return () => {
      if (previewPollRef.current) {
        clearInterval(previewPollRef.current);
        previewPollRef.current = null;
      }
    };
  }, [previewTask?.running]);

  useEffect(() => {
    if (!enrichmentTask?.running) {
      if (enrichmentPollRef.current) {
        clearInterval(enrichmentPollRef.current);
        enrichmentPollRef.current = null;
      }
      return undefined;
    }
    enrichmentPollRef.current = window.setInterval(async () => {
      const task = await window.mediaWorkspace.getEnrichmentStatus();
      setEnrichmentTask(task);
      if (!task?.running) {
        clearInterval(enrichmentPollRef.current);
        enrichmentPollRef.current = null;
        await refreshAll();
      }
    }, 1500);
    return () => {
      if (enrichmentPollRef.current) {
        clearInterval(enrichmentPollRef.current);
        enrichmentPollRef.current = null;
      }
    };
  }, [enrichmentTask?.running]);

  return {
    theme,
    setTheme,
    sidebarWidth,
    setSidebarWidth,
    inspectorWidth,
    setInspectorWidth,
    info,
    summary,
    filteredItems,
    detail,
    selectedExportPath,
    setSelectedExportPath,
    status,
    setStatus,
    sort,
    setSort,
    query,
    setQuery,
    browserLoading,
    browserLoadingMore,
    browserHasMore,
    browserOffset,
    loadMoreBrowser,
    refreshAll,
    activeOverlay,
    addProcessedMedia,
    addSources,
    runImportPipeline,
    runEnrichment,
    runPreviewGeneration,
  };
}
