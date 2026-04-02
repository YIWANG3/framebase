const catalogInfo = document.getElementById("catalogInfo");
const importStatus = document.getElementById("importStatus");
const importJobsSection = document.getElementById("importJobsSection");
const collectionNav = document.getElementById("collectionNav");
const browseSection = document.getElementById("browseSection");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const sortSelect = document.getElementById("sortSelect");
const displayButton = document.getElementById("displayButton");
const displayPanel = document.getElementById("displayPanel");
const densitySmallButton = document.getElementById("densitySmallButton");
const densityMediumButton = document.getElementById("densityMediumButton");
const densityLargeButton = document.getElementById("densityLargeButton");
const showNameToggle = document.getElementById("showNameToggle");
const infoModeSelect = document.getElementById("infoModeSelect");
const viewModeSelect = document.getElementById("viewModeSelect");
const refreshButton = document.getElementById("refreshButton");
const densityIndicator = document.getElementById("densityIndicator");
const canvasTitle = document.getElementById("canvasTitle");
const browserCount = document.getElementById("browserCount");
const gridScroller = document.getElementById("gridScroller");
const galleryGrid = document.getElementById("galleryGrid");
const loadState = document.getElementById("loadState");
const loadMoreSentinel = document.getElementById("loadMoreSentinel");
const detailTitle = document.getElementById("detailTitle");
const detailBody = document.getElementById("detailBody");
const leftDivider = document.getElementById("leftDivider");
const rightDivider = document.getElementById("rightDivider");
const searchIcon = document.getElementById("searchIcon");

const PAGE_SIZE = 180;
const THEME_STORAGE_KEY = "media-workspace-theme";
const DISPLAY_STORAGE_KEY = "framebase-display-settings";
const SIDEBAR_WIDTH_STORAGE_KEY = "framebase-sidebar-width";
const INSPECTOR_WIDTH_STORAGE_KEY = "framebase-inspector-width";

const state = {
  summary: null,
  info: null,
  enrichment: null,
  previewTask: null,
  importTask: null,
  rawDirs: [],
  exportDirs: [],
  status: "all",
  sort: "name-asc",
  query: "",
  items: [],
  filteredItems: [],
  selectedId: null,
  offset: 0,
  hasMore: true,
  isLoading: false,
  theme: "light",
  sidebarWidth: 220,
  inspectorWidth: 220,
  density: "medium",
  showName: true,
  infoMode: "dimensions-size",
  viewMode: "grid",
  pendingImport: {
    rawDirs: [],
    exportDirs: [],
  },
};

let infiniteScrollObserver = null;
let enrichmentPollTimer = null;
let previewPollTimer = null;
let importPollTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function prettyLabel(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status) {
  if (status === "auto_bound" || status === "manual_confirmed") {
    return "Matched";
  }
  if (status === "unmatched") {
    return "Unmatched";
  }
  return "Unknown";
}

function scoreLabel(score) {
  if (score == null) {
    return null;
  }
  return Number(score).toFixed(2);
}

function formatCompactPath(value) {
  if (!value) {
    return "Not linked";
  }
  const segments = String(value).split("/");
  if (segments.length <= 4) {
    return value;
  }
  return `.../${segments.slice(-3).join("/")}`;
}

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (!bytes || Number.isNaN(bytes) || bytes < 0) {
    return null;
  }
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function iconMarkup(symbol) {
  const featherMap = {
    archive: "archive",
    folder: "folder",
    star: "star",
    clock: "clock",
    tag: "tag",
    circle: "circle",
  };
  const featherName = featherMap[symbol] || featherMap.circle;
  const icon = globalThis.feather?.icons?.[featherName];
  const svg = icon
    ? icon.toSvg({
        width: 18,
        height: 18,
        "stroke-width": symbol === "tag" ? 1.9 : 1.75,
        class: `nav-item__icon-svg nav-item__icon-svg--${symbol}`,
      })
    : "";
  return `<span class="nav-item__icon nav-item__icon--${symbol}" aria-hidden="true">${svg}</span>`;
}

function browseIcon(key) {
  if (key === "all") return "archive";
  if (key === "matched") return "circle";
  if (key === "unmatched") return "tag";
  if (key === "preview") return "circle";
  if (key === "recent") return "clock";
  return "circle";
}

function fileName(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).replaceAll("\\", "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function applyToolbarIcons() {
  if (!globalThis.feather) {
    return;
  }
  if (searchIcon) {
    searchIcon.innerHTML = globalThis.feather.icons.search.toSvg({
      width: 16,
      height: 16,
      "stroke-width": 2,
      class: "search-field__icon-svg",
    });
  }
}

function baseName(value) {
  return fileName(value) || String(value || "");
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/\/+$/, "");
}

function collapseRootPaths(paths) {
  const unique = [...new Set((paths || []).map((value) => normalizePath(value)).filter(Boolean))].sort(
    (left, right) => left.length - right.length || left.localeCompare(right),
  );
  const collapsed = [];
  for (const path of unique) {
    const isNested = collapsed.some((root) => path === root || path.startsWith(`${root}/`));
    if (!isNested) {
      collapsed.push(path);
    }
  }
  return collapsed;
}

function formatTimestamp(value) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function saveDisplaySettings() {
  localStorage.setItem(
    DISPLAY_STORAGE_KEY,
    JSON.stringify({
      density: state.density,
      showName: state.showName,
      infoMode: state.infoMode,
      viewMode: state.viewMode,
    }),
  );
}

function applyDisplaySettings() {
  galleryGrid.dataset.density = state.density;
  galleryGrid.dataset.showName = state.showName ? "yes" : "no";
  galleryGrid.dataset.infoMode = state.infoMode;
  galleryGrid.dataset.view = state.viewMode;
  densityIndicator.textContent = state.density === "small" ? "S" : state.density === "large" ? "L" : "M";
  if (showNameToggle) {
    showNameToggle.checked = state.showName;
  }
  if (infoModeSelect) {
    infoModeSelect.value = state.infoMode;
  }
  if (viewModeSelect) {
    viewModeSelect.value = state.viewMode;
  }
  const buttons = [
    [densitySmallButton, "small"],
    [densityMediumButton, "medium"],
    [densityLargeButton, "large"],
  ];
  for (const [button, value] of buttons) {
    if (button) {
      button.classList.toggle("is-active", state.density === value);
    }
  }
}

function galleryInfoLabel(item) {
  if (state.density === "small" || state.infoMode === "none") {
    return "";
  }
  const exportMeta = item.export_metadata || {};
  const dimensions = exportMeta.width && exportMeta.height ? `${exportMeta.width} × ${exportMeta.height}` : null;
  const sizeLabel = formatBytes(exportMeta.file_size || exportMeta.size_bytes);
  if (state.infoMode === "dimensions") {
    return dimensions || "";
  }
  if (state.infoMode === "file-size") {
    return sizeLabel || "";
  }
  return [dimensions, sizeLabel].filter(Boolean).join(" · ");
}

function progressNote(task) {
  const currentPhase = task?.result?.current_phase;
  if (!currentPhase?.result) {
    return "";
  }
  const result = currentPhase.result;
  const processed = Number(result.processed ?? 0);
  const total = Number(result.total ?? 0);
  const discovered = Number(result.discovered ?? 0);
  if (total > 0) {
    return `${currentPhase.label}: ${processed} / ${total} (${formatPercent(processed / total)})`;
  }
  if (discovered > 0) {
    return `${currentPhase.label}: processed ${processed}, discovered ${discovered}`;
  }
  return `${currentPhase.label}: starting...`;
}

function hasIndexedSources() {
  return Number(state.summary?.raw_assets ?? 0) > 0;
}

function hasIndexedProcessedMedia() {
  return Number(state.summary?.export_assets ?? 0) > 0;
}

function determineImportMode({ rawDirs = [], exportDirs = [] }) {
  const hasRawInput = rawDirs.length > 0;
  const hasProcessedInput = exportDirs.length > 0;
  if (hasRawInput && hasProcessedInput) {
    if (hasIndexedSources() && !hasIndexedProcessedMedia()) {
      return "processed_with_sources";
    }
    if (!hasIndexedSources() && hasIndexedProcessedMedia()) {
      return "source_with_media";
    }
    return "combined";
  }
  if (hasRawInput) {
    return hasIndexedProcessedMedia() ? "source_with_media" : "source_only";
  }
  if (hasProcessedInput) {
    return hasIndexedSources() ? "processed_with_sources" : "processed_only";
  }
  return "combined";
}

function filterTitle(status) {
  if (status === "matched") {
    return "Matched";
  }
  if (status === "unmatched") {
    return "Unmatched";
  }
  return "All Assets";
}

function navItems(summary) {
  return [
    { key: "all", label: "All Assets", count: summary.export_assets ?? 0 },
    { key: "matched", label: "Matched", count: summary.confirmed_matches ?? 0 },
    { key: "unmatched", label: "Unmatched", count: summary.unmatched_exports ?? 0 },
  ];
}

function renderSidebar(summary) {
  browseSection.hidden = false;
  collectionNav.innerHTML = "";
  for (const item of navItems(summary)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    if (item.key === state.status) {
      button.classList.add("is-active");
    }
    button.innerHTML = `
      <span class="nav-item__label">${iconMarkup(browseIcon(item.key))}<span>${escapeHtml(item.label)}</span></span>
      <span class="nav-item__count">${item.count}</span>
    `;
    button.addEventListener("click", async () => {
      state.status = item.key;
      filterSelect.value = item.key;
      await reloadBrowser();
    });
    collectionNav.appendChild(button);
  }
}

function renderCatalogInfo(info) {
  const catalogName = baseName(info.catalogPath);
  const exportRoots = collapseRootPaths(state.exportDirs);
  const rawRoots = collapseRootPaths(state.rawDirs);
  const summaryParts = [];
  if (exportRoots.length) {
    summaryParts.push(`${exportRoots.length} processed media ${exportRoots.length === 1 ? "root" : "roots"}`);
  }
  if (rawRoots.length) {
    summaryParts.push(`${rawRoots.length} source ${rawRoots.length === 1 ? "root" : "roots"}`);
  }
  const summaryLine = summaryParts.length ? summaryParts.join(" · ") : "No source roots selected";
  catalogInfo.innerHTML = `
    <div class="catalog-summary__eyebrow">Current Catalog</div>
    <div class="catalog-summary__title">${escapeHtml(catalogName)}</div>
    <div class="catalog-summary__meta">${escapeHtml(summaryLine)}</div>
  `;
}

function renderImportStatus() {
  const summary = state.summary;
  const enrichment = state.enrichment;
  const previewTask = state.previewTask;
  const importTask = state.importTask;
  const queuedRawCount = state.pendingImport.rawDirs.length;
  const queuedExportCount = state.pendingImport.exportDirs.length;
  const hasJobState = Boolean(
    importTask?.running ||
      enrichment?.running ||
      enrichment?.error ||
      previewTask?.running ||
      previewTask?.error ||
      queuedRawCount ||
      queuedExportCount
  );

  importJobsSection.hidden = !hasJobState;

  if (!summary) {
    importStatus.innerHTML = `<p class="empty-state">No import state loaded.</p>`;
    return;
  }

  const fastOnly = Number(summary.raw_fast_only ?? 0);
  const rawAssets = Number(summary.raw_assets ?? 0);
  const running = Boolean(enrichment?.running);
  const importRunning = Boolean(importTask?.running);
  const statusLabelText = importRunning
    ? "Import in progress"
    : running
      ? "Enrichment running"
      : rawAssets === 0
        ? "Not indexed yet"
        : fastOnly > 0
          ? "Fast index ready"
          : "Fully enriched";
  const phaseLabel = importTask?.phaseLabel || prettyLabel(importTask.phase || "starting");
  const importLabelText = importRunning
    ? `Import running: ${phaseLabel} (${importTask.phaseIndex}/${importTask.phaseCount}, ${formatPercent(importTask.progress)})`
    : importTask?.finishedAt
      ? "Last import finished"
      : "No active import";
  const phaseList = (importTask?.phaseResults || [])
    .map((phase) => `<div class="import-timeline__item">${escapeHtml(phase.label)} complete</div>`)
    .join("");
  const importProgressNote = progressNote(importTask);
  const enrichmentProgressNote = progressNote(enrichment);
  const previewProgressNote = progressNote(previewTask);
  const queuedImportNote =
    queuedRawCount || queuedExportCount
      ? `Queued changes: ${queuedExportCount ? `${queuedExportCount} processed media` : "0 processed media"} · ${queuedRawCount ? `${queuedRawCount} sources` : "0 sources"}`
      : "";
  const importProgressValue = importTask?.running ? formatPercent(importTask.progress) : rawAssets > 0 ? "Done" : "Idle";

  importStatus.innerHTML = `
    <div class="import-card import-card--compact">
      <div class="import-card__header">
        <div>
          <div class="import-card__eyebrow">Status</div>
          <div class="import-card__title">${escapeHtml(importLabelText)}</div>
        </div>
        <div class="import-card__badge">${escapeHtml(importProgressValue)}</div>
      </div>
      <div class="import-card__phase">${escapeHtml(statusLabelText)}</div>
      ${importProgressNote ? `<div class="import-note import-note--live">${escapeHtml(importProgressNote)}</div>` : ""}
      ${queuedImportNote ? `<div class="import-note">${escapeHtml(queuedImportNote)}</div>` : ""}
      ${enrichmentProgressNote ? `<div class="import-note">${escapeHtml(enrichmentProgressNote)}</div>` : ""}
      ${previewProgressNote ? `<div class="import-note">${escapeHtml(previewProgressNote)}</div>` : ""}
      ${phaseList ? `<div class="import-timeline">${phaseList}</div>` : ""}
      ${importTask?.error ? `<div class="import-note import-note--error">${escapeHtml(importTask.error)}</div>` : ""}
      ${previewTask?.error ? `<div class="import-note import-note--error">${escapeHtml(previewTask.error)}</div>` : ""}
      ${enrichment?.error ? `<div class="import-note import-note--error">${escapeHtml(enrichment.error)}</div>` : ""}
    </div>
  `;
}

function applySearchAndSort() {
  const query = state.query.trim().toLowerCase();
  let items = [...state.items];

  if (query) {
    items = items.filter((item) => {
      const fields = [
        item.stem,
        item.export_path,
        item.raw_path,
        item.export_metadata?.camera_model,
        item.raw_metadata?.camera_model,
      ];
      return fields.some((field) => String(field ?? "").toLowerCase().includes(query));
    });
  }

  if (state.sort === "name-desc") {
    items.sort((left, right) => right.stem.localeCompare(left.stem));
  } else if (state.sort === "score-desc") {
    items.sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0));
  } else {
    items.sort((left, right) => left.stem.localeCompare(right.stem));
  }

  state.filteredItems = items;
}

function renderGallery() {
  applySearchAndSort();
  canvasTitle.textContent = filterTitle(state.status);
  browserCount.textContent = `${state.filteredItems.length} items${state.query ? ` · filtered by "${state.query}"` : ""}`;
  galleryGrid.innerHTML = "";

  if (!state.filteredItems.length) {
    galleryGrid.innerHTML = `<p class="empty-state">No exports match the current filter.</p>`;
    return;
  }

  for (const item of state.filteredItems) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gallery-card";
    if (item.asset_id === state.selectedId) {
      card.classList.add("is-selected");
    }
    const title = fileName(item.export_path) || item.stem;
    const metaLabel = galleryInfoLabel(item);
    const exportMeta = item.export_metadata || {};
    const width = Number(exportMeta.width || 0);
    const height = Number(exportMeta.height || 0);
    const aspectRatio = width > 0 && height > 0 ? width / height : 1;
    card.style.setProperty("--asset-aspect", String(aspectRatio));
    if (state.viewMode === "justified") {
      const justifiedWidth = Math.max(120, Math.min(320, Math.round(132 * aspectRatio)));
      card.style.width = `${justifiedWidth}px`;
    } else {
      card.style.width = "";
    }

    card.innerHTML = `
      <div class="gallery-thumb">
        ${item.preview_path
          ? `<img src="${encodeURI(item.preview_path)}" alt="${escapeHtml(item.stem)}" loading="lazy" />`
          : `<div class="gallery-fallback">No preview</div>`}
      </div>
      <div class="gallery-copy">
        <h3 class="gallery-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
        <div class="gallery-meta">${escapeHtml(metaLabel || "")}</div>
      </div>
    `;
    card.addEventListener("click", () => {
      void selectAsset(item.asset_id);
    });
    galleryGrid.appendChild(card);
  }
}

function renderLoadState() {
  if (state.isLoading && state.items.length) {
    loadState.textContent = "Loading more...";
    return;
  }
  if (!state.filteredItems.length) {
    loadState.textContent = "";
    return;
  }
  if (state.hasMore) {
    loadState.textContent = "Scroll to load more";
    return;
  }
  loadState.textContent = "All loaded";
}

function renderFeatureRows(features) {
  const entries = Object.entries(features || {}).filter(([, value]) => typeof value === "number" && value > 0);
  if (!entries.length) {
    return `<p class="empty-state">No score features recorded.</p>`;
  }
  return `
    <div class="feature-list">
      ${entries
        .map(
          ([key, value]) => `
            <div class="feature-row">
              <span>${escapeHtml(prettyLabel(key))}</span>
              <strong>${Number(value).toFixed(2)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDetail(detail) {
  if (!detail) {
    detailTitle.textContent = "Select an asset";
    detailBody.innerHTML = `<p class="empty-state">Choose a thumbnail to inspect its source, metadata, and current linkage.</p>`;
    return;
  }

  const previewPath = detail.export_preview_path || detail.raw_preview_path;
  const exportMeta = detail.export_metadata || {};
  const rawMeta = detail.raw_metadata || {};
  const exportDimensions = exportMeta.width && exportMeta.height ? `${exportMeta.width} × ${exportMeta.height}` : "Unknown";
  const formatValue = (detail.export_path || "").split(".").pop()?.toUpperCase() || "Unknown";
  const sizeValue = formatBytes(exportMeta.file_size || exportMeta.size_bytes) || "Unknown";
  const matchChipClass = detail.match_status === "unmatched" ? "chip is-error" : "chip is-success";
  const exportName = fileName(detail.export_path);
  const rawName = fileName(detail.raw_path || "");

  detailTitle.textContent = exportName || detail.stem;
  detailBody.innerHTML = `
    <div class="detail-preview">
      ${previewPath
        ? `<img src="${encodeURI(previewPath)}" alt="${escapeHtml(detail.stem)}" />`
        : `<div class="gallery-fallback">No preview available</div>`}
    </div>

    <section class="detail-block">
      <div class="detail-chip-row">
        <span class="${matchChipClass}">${escapeHtml(statusLabel(detail.match_status))}</span>
        ${formatValue ? `<span class="chip">${escapeHtml(formatValue)}</span>` : ""}
        ${detail.score != null ? `<span class="chip is-accent">${escapeHtml(scoreLabel(detail.score))}</span>` : ""}
      </div>
    </section>

    <section class="detail-block">
      <div class="detail-block__title">Link</div>
      <div class="detail-chip-row">
        <button class="quiet-button" id="revealExportButton" type="button">Reveal Asset</button>
        <button class="quiet-button" id="revealRawButton" type="button" ${detail.raw_path ? "" : "disabled"}>Reveal Source</button>
      </div>
      <div class="detail-kv"><strong>Filename</strong><span>${escapeHtml(exportName || "Unknown")}</span></div>
      <div class="detail-kv"><strong>Type</strong><span>${escapeHtml(formatValue)}</span></div>
      <div class="detail-kv"><strong>Matched</strong><span>${detail.raw_path ? "Yes" : "No"}</span></div>
      <div class="detail-kv"><strong>Source</strong><span class="detail-path">${escapeHtml(detail.raw_path || "Not linked")}</span></div>
    </section>

    <section class="detail-block">
      <div class="detail-block__title">Metadata</div>
      <div class="detail-kv"><strong>Dimensions</strong><span>${escapeHtml(exportDimensions)}</span></div>
      <div class="detail-kv"><strong>File Size</strong><span>${escapeHtml(sizeValue)}</span></div>
      <div class="detail-kv"><strong>Format</strong><span>${escapeHtml(formatValue)}</span></div>
      <div class="detail-kv"><strong>Camera</strong><span>${escapeHtml(rawMeta.camera_model || exportMeta.camera_model || "Unknown")}</span></div>
    </section>

    <section class="detail-block">
      <div class="detail-block__title">Dates</div>
      <div class="detail-kv"><strong>Imported</strong><span>${escapeHtml(formatTimestamp(detail.imported_at || exportMeta.imported_at || null))}</span></div>
      <div class="detail-kv"><strong>Created</strong><span>${escapeHtml(formatTimestamp(rawMeta.capture_time || exportMeta.capture_time))}</span></div>
      <div class="detail-kv"><strong>Modified</strong><span>${escapeHtml(formatTimestamp(exportMeta.modified_time || detail.updated_at || null))}</span></div>
    </section>

    <section class="detail-block">
      <div class="detail-block__title">Notes</div>
      <div class="detail-note-input">Add notes...</div>
    </section>
  `;

  document.getElementById("revealExportButton").addEventListener("click", () => {
    void window.mediaWorkspace.revealPath(detail.export_path);
  });

  const revealRawButton = document.getElementById("revealRawButton");
  if (detail.raw_path) {
    revealRawButton.addEventListener("click", () => {
      void window.mediaWorkspace.revealPath(detail.raw_path);
    });
  }
}

async function selectAsset(assetId, options = {}) {
  state.selectedId = assetId;
  if (!options.suppressGalleryRender) {
    renderGallery();
  }
  const detail = await window.mediaWorkspace.getAssetDetail(assetId);
  renderDetail(detail);
}

async function loadGallery({ reset = false } = {}) {
  if (state.isLoading) {
    return;
  }
  if (!reset && !state.hasMore) {
    return;
  }
  state.isLoading = true;
  renderLoadState();
  const offset = reset ? 0 : state.offset;
  try {
    const items = await window.mediaWorkspace.browseExports({
      status: state.status,
      limit: PAGE_SIZE,
      offset,
    });

    if (reset) {
      state.items = items;
      state.offset = items.length;
    } else {
      state.items = [...state.items, ...items];
      state.offset += items.length;
    }

    state.hasMore = items.length === PAGE_SIZE;

    const currentIds = new Set(state.items.map((item) => item.asset_id));
    if (!state.selectedId || !currentIds.has(state.selectedId)) {
      state.selectedId = state.items[0]?.asset_id || null;
    }

    renderGallery();
    renderLoadState();

    if (state.selectedId) {
      await selectAsset(state.selectedId, { suppressGalleryRender: true });
    } else {
      renderDetail(null);
    }
  } finally {
    state.isLoading = false;
    renderLoadState();
    ensureGalleryFilled();
  }
}

async function reloadBrowser() {
  renderSidebar(state.summary);
  await loadGallery({ reset: true });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

async function actionCreateCatalog() {
  const created = await window.mediaWorkspace.createCatalog();
  if (created) {
    await window.mediaWorkspace.switchCatalog(created);
  }
}

async function actionOpenCatalog() {
  const selected = await window.mediaWorkspace.pickCatalog();
  if (selected) {
    await window.mediaWorkspace.switchCatalog(selected);
  }
}

async function actionUseScratchCatalog() {
  await window.mediaWorkspace.switchCatalog(null);
}

function mergeRoots(existing, added) {
  return collapseRootPaths([...(existing || []), ...(added || [])]);
}

function queueImportDelta({ rawDirs = [], exportDirs = [] }) {
  state.pendingImport.rawDirs = mergeRoots(state.pendingImport.rawDirs, rawDirs);
  state.pendingImport.exportDirs = mergeRoots(state.pendingImport.exportDirs, exportDirs);
}

async function startIncrementalImport({ rawDirs = [], exportDirs = [], fullCatalog = false }) {
  let resolvedRawDirs = collapseRootPaths(rawDirs);
  let resolvedExportDirs = collapseRootPaths(exportDirs);

  if (fullCatalog) {
    resolvedRawDirs = collapseRootPaths(state.rawDirs);
    resolvedExportDirs = collapseRootPaths(state.exportDirs);
  }

  if (!resolvedRawDirs.length && !resolvedExportDirs.length) {
    return;
  }

  let mode = determineImportMode({ rawDirs: resolvedRawDirs, exportDirs: resolvedExportDirs });
  if (mode === "source_with_media" && !resolvedExportDirs.length) {
    resolvedExportDirs = collapseRootPaths(state.exportDirs);
  }
  if (mode === "processed_with_sources" && resolvedRawDirs.length) {
    resolvedRawDirs = [];
  }

  mode = determineImportMode({ rawDirs: resolvedRawDirs, exportDirs: resolvedExportDirs });
  const modeNeedsSources = mode === "source_only" || mode === "source_with_media" || mode === "combined";
  const modeNeedsProcessed = mode === "processed_only" || mode === "processed_with_sources" || mode === "combined";
  if (modeNeedsSources && !resolvedRawDirs.length) {
    return;
  }
  if (modeNeedsProcessed && !resolvedExportDirs.length) {
    return;
  }
  const importTask = await window.mediaWorkspace.startImport({
    rawDirs: resolvedRawDirs,
    exportDirs: resolvedExportDirs,
    mode,
  });
  state.importTask = importTask;
  renderImportStatus();
  ensureImportPolling();
}

async function actionPickExportFolders() {
  const selected = await window.mediaWorkspace.pickDirectories("export");
  if (selected.length) {
    await window.mediaWorkspace.registerRoots("export", selected);
    state.exportDirs = mergeRoots(state.exportDirs, selected);
    if (state.importTask?.running) {
      queueImportDelta({ exportDirs: selected });
    } else {
      await startIncrementalImport({ exportDirs: selected });
    }
    renderImportStatus();
  }
}

async function actionPickSourceFolders() {
  const selected = await window.mediaWorkspace.pickDirectories("raw");
  if (selected.length) {
    await window.mediaWorkspace.registerRoots("raw", selected);
    state.rawDirs = mergeRoots(state.rawDirs, selected);
    if (state.importTask?.running) {
      queueImportDelta({ rawDirs: selected });
    } else {
      await startIncrementalImport({ rawDirs: selected, exportDirs: state.exportDirs });
    }
    renderImportStatus();
  }
}

async function actionStartImport() {
  if (state.importTask?.running) {
    return;
  }
  await startIncrementalImport({
    fullCatalog: true,
  });
}

async function actionStartEnrichment() {
  if (state.enrichment?.running || state.importTask?.running || !Number(state.summary?.raw_fast_only ?? 0)) {
    return;
  }
  const enrichment = await window.mediaWorkspace.startEnrichment();
  state.enrichment = enrichment;
  renderImportStatus();
  ensureEnrichmentPolling();
}

async function actionStartPreviews() {
  if (state.previewTask?.running || state.importTask?.running) {
    return;
  }
  const previewTask = await window.mediaWorkspace.startPreviewGeneration();
  state.previewTask = previewTask;
  renderImportStatus();
  ensurePreviewPolling();
}

function actionToggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

function registerMenuActions() {
  if (!window.mediaWorkspace.onMenuAction) {
    return;
  }
  window.mediaWorkspace.onMenuAction(async (action) => {
    try {
      if (action === "catalog:new") {
        await actionCreateCatalog();
      } else if (action === "catalog:open") {
        await actionOpenCatalog();
      } else if (action === "catalog:scratch") {
        await actionUseScratchCatalog();
      } else if (action === "import:pick-export") {
        await actionPickExportFolders();
      } else if (action === "import:pick-source") {
        await actionPickSourceFolders();
      } else if (action === "import:start") {
        await actionStartImport();
      } else if (action === "import:enrich") {
        await actionStartEnrichment();
      } else if (action === "import:previews") {
        await actionStartPreviews();
      } else if (action === "view:toggle-theme") {
        actionToggleTheme();
      } else if (action === "view:refresh") {
        await refresh();
      }
    } catch (error) {
      detailBody.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  });
}

function setDensity(value) {
  state.density = value;
  applyDisplaySettings();
  saveDisplaySettings();
  renderGallery();
}

function setShowName(value) {
  state.showName = value;
  applyDisplaySettings();
  saveDisplaySettings();
  renderGallery();
}

function setInfoMode(value) {
  state.infoMode = value;
  applyDisplaySettings();
  saveDisplaySettings();
  renderGallery();
}

function setViewMode(value) {
  state.viewMode = value;
  applyDisplaySettings();
  saveDisplaySettings();
  renderGallery();
}

function closeDisplayPanel() {
  if (!displayPanel) {
    return;
  }
  displayPanel.classList.add("is-hidden");
  displayPanel.setAttribute("aria-hidden", "true");
}

function toggleDisplayPanel() {
  if (!displayPanel) {
    return;
  }
  const open = displayPanel.classList.toggle("is-hidden");
  displayPanel.setAttribute("aria-hidden", open ? "true" : "false");
}

async function refresh() {
  refreshButton.disabled = true;
  try {
    const [info, summary, enrichment, previewTask, roots, importTask] = await Promise.all([
      window.mediaWorkspace.getInfo(),
      window.mediaWorkspace.getSummary(),
      window.mediaWorkspace.getEnrichmentStatus(),
      window.mediaWorkspace.getPreviewStatus(),
      window.mediaWorkspace.getCatalogRoots(),
      window.mediaWorkspace.getImportStatus(),
    ]);
    state.info = info;
    state.summary = summary;
    state.enrichment = enrichment;
    state.previewTask = previewTask;
    state.importTask = importTask;
    state.rawDirs = roots.filter((item) => item.root_type === "raw").map((item) => item.path);
    state.exportDirs = roots.filter((item) => item.root_type === "export").map((item) => item.path);
    renderCatalogInfo(info);
    renderImportStatus();
    if (enrichment.running) {
      ensureEnrichmentPolling();
    } else {
      stopEnrichmentPolling();
    }
    if (previewTask.running) {
      ensurePreviewPolling();
    } else {
      stopPreviewPolling();
    }
    if (importTask.running) {
      ensureImportPolling();
    } else {
      stopImportPolling();
    }
    renderSidebar(summary);
    await loadGallery({ reset: true });
  } catch (error) {
    detailBody.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    catalogInfo.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    importStatus.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  } finally {
    refreshButton.disabled = false;
  }
}

async function pollEnrichmentStatus() {
  const enrichment = await window.mediaWorkspace.getEnrichmentStatus();
  state.enrichment = enrichment;
  renderImportStatus();
  if (!enrichment.running) {
    stopEnrichmentPolling();
    await refresh();
  }
}

async function pollPreviewStatus() {
  const previewTask = await window.mediaWorkspace.getPreviewStatus();
  state.previewTask = previewTask;
  renderImportStatus();
  if (!previewTask.running) {
    stopPreviewPolling();
    await refresh();
  }
}

function stopEnrichmentPolling() {
  if (enrichmentPollTimer) {
    window.clearInterval(enrichmentPollTimer);
    enrichmentPollTimer = null;
  }
}

function ensureEnrichmentPolling() {
  if (!state.enrichment?.running || enrichmentPollTimer) {
    return;
  }
  enrichmentPollTimer = window.setInterval(() => {
    void pollEnrichmentStatus();
  }, 3000);
}

function stopPreviewPolling() {
  if (previewPollTimer) {
    window.clearInterval(previewPollTimer);
    previewPollTimer = null;
  }
}

function ensurePreviewPolling() {
  if (!state.previewTask?.running || previewPollTimer) {
    return;
  }
  previewPollTimer = window.setInterval(() => {
    void pollPreviewStatus();
  }, 3000);
}

async function pollImportStatus() {
  const importTask = await window.mediaWorkspace.getImportStatus();
  state.importTask = importTask;
  renderImportStatus();
  if (!importTask.running) {
    stopImportPolling();
    await refresh();
    const queuedRawDirs = [...state.pendingImport.rawDirs];
    const queuedExportDirs = [...state.pendingImport.exportDirs];
    state.pendingImport.rawDirs = [];
    state.pendingImport.exportDirs = [];
    if (queuedRawDirs.length || queuedExportDirs.length) {
      await startIncrementalImport({
        rawDirs: queuedRawDirs.length ? queuedRawDirs : state.rawDirs,
        exportDirs: queuedExportDirs.length ? queuedExportDirs : state.exportDirs,
      });
    }
  }
}

function stopImportPolling() {
  if (importPollTimer) {
    window.clearInterval(importPollTimer);
    importPollTimer = null;
  }
}

function ensureImportPolling() {
  if (!state.importTask?.running || importPollTimer) {
    return;
  }
  importPollTimer = window.setInterval(() => {
    void pollImportStatus();
  }, 3000);
}

function ensureGalleryFilled() {
  if (state.isLoading || !state.hasMore) {
    return;
  }
  if (gridScroller.scrollHeight <= gridScroller.clientHeight + 120) {
    void loadGallery({ reset: false });
  }
}

function applyPaneWidths() {
  document.documentElement.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
  document.documentElement.style.setProperty("--inspector-width", `${state.inspectorWidth}px`);
}

function setupPaneResizers() {
  const shell = document.querySelector(".app-shell");
  if (!shell || !leftDivider || !rightDivider) {
    return;
  }

  function beginDrag(which, startEvent) {
    startEvent.preventDefault();
    const shellRect = shell.getBoundingClientRect();
    const startX = startEvent.clientX;
    const startSidebarWidth = state.sidebarWidth;
    const startInspectorWidth = state.inspectorWidth;

    function onMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      if (which === "left") {
        const maxSidebar = Math.max(180, shellRect.width - state.inspectorWidth - 320);
        state.sidebarWidth = Math.min(maxSidebar, Math.max(180, startSidebarWidth + delta));
      } else {
        const maxInspector = Math.max(180, shellRect.width - state.sidebarWidth - 320);
        state.inspectorWidth = Math.min(maxInspector, Math.max(180, startInspectorWidth - delta));
      }
      applyPaneWidths();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(state.sidebarWidth));
      localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(state.inspectorWidth));
      document.body.classList.remove("is-resizing-panes");
    }

    document.body.classList.add("is-resizing-panes");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  leftDivider.addEventListener("pointerdown", (event) => beginDrag("left", event));
  rightDivider.addEventListener("pointerdown", (event) => beginDrag("right", event));
}

function setupInfiniteScroll() {
  infiniteScrollObserver?.disconnect();
  infiniteScrollObserver = new IntersectionObserver(
    (entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) {
        return;
      }
      if (state.isLoading || !state.hasMore) {
        return;
      }
      void loadGallery({ reset: false });
    },
    {
      root: gridScroller,
      rootMargin: "0px 0px 320px 0px",
      threshold: 0,
    },
  );
  infiniteScrollObserver.observe(loadMoreSentinel);
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderGallery();
  renderLoadState();
});

filterSelect.addEventListener("change", async () => {
  state.status = filterSelect.value;
  await reloadBrowser();
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  renderGallery();
  renderLoadState();
});

if (displayButton) {
  displayButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDisplayPanel();
  });
}

if (densitySmallButton) {
  densitySmallButton.addEventListener("click", () => setDensity("small"));
}

if (densityMediumButton) {
  densityMediumButton.addEventListener("click", () => setDensity("medium"));
}

if (densityLargeButton) {
  densityLargeButton.addEventListener("click", () => setDensity("large"));
}

if (showNameToggle) {
  showNameToggle.addEventListener("change", () => setShowName(showNameToggle.checked));
}

if (infoModeSelect) {
  infoModeSelect.addEventListener("change", () => setInfoMode(infoModeSelect.value));
}

if (viewModeSelect) {
  viewModeSelect.addEventListener("change", () => setViewMode(viewModeSelect.value));
}

document.addEventListener("click", (event) => {
  if (!displayPanel || displayPanel.classList.contains("is-hidden")) {
    return;
  }
  if (displayPanel.contains(event.target) || displayButton?.contains(event.target)) {
    return;
  }
  closeDisplayPanel();
});

refreshButton.addEventListener("click", () => {
  void refresh();
});

function init() {
  applyToolbarIcons();
  registerMenuActions();
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === "dark" ? "dark" : "light");
  try {
    const savedDisplay = JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) || "{}");
    state.density = ["small", "medium", "large"].includes(savedDisplay.density) ? savedDisplay.density : "medium";
    state.showName = savedDisplay.showName !== false;
    state.infoMode = ["dimensions-size", "dimensions", "file-size", "none"].includes(savedDisplay.infoMode)
      ? savedDisplay.infoMode
      : "dimensions-size";
    state.viewMode = ["waterfall", "justified", "grid"].includes(savedDisplay.viewMode)
      ? savedDisplay.viewMode
      : "grid";
  } catch {
    state.density = "medium";
    state.showName = true;
    state.infoMode = "dimensions-size";
    state.viewMode = "grid";
  }
  state.sidebarWidth = Math.max(180, Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || 220));
  state.inspectorWidth = Math.max(180, Number(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY) || 220));
  applyPaneWidths();
  applyDisplaySettings();
  setupPaneResizers();
  setupInfiniteScroll();
  void refresh();
}

init();
