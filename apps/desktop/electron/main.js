const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { spawn, spawnSync } = require("node:child_process");

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { standard: false, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const configuredCatalogPath = process.env.MEDIA_WORKSPACE_CATALOG;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const rootCandidates = [
  path.resolve(__dirname, "..", "..", ".."),
  path.resolve(process.cwd(), "..", ".."),
  path.resolve(process.cwd(), ".."),
  process.cwd(),
];

function pickRootDir() {
  for (const candidate of rootCandidates) {
    if (fs.existsSync(path.join(candidate, "services", "sidecar", "src"))) {
      return candidate;
    }
  }
  return rootCandidates[0];
}

const rootDir = pickRootDir();
const sidecarSrc = path.join(rootDir, "services", "sidecar", "src");
const scratchCatalogPath = path.join(rootDir, "data", "ui-import-scratch.mwcatalog");
const reviewCatalogPath = path.join(rootDir, "data", "review-2026.mwcatalog");

function resolveCatalogPath() {
  if (configuredCatalogPath) {
    return path.isAbsolute(configuredCatalogPath)
      ? configuredCatalogPath
      : path.resolve(rootDir, configuredCatalogPath);
  }
  return scratchCatalogPath;
}

let currentCatalogPath = resolveCatalogPath();

function prepareCatalogPath() {
  fs.mkdirSync(currentCatalogPath, { recursive: true });
}

function workspaceInfo() {
  return {
    rootDir,
    catalogPath: currentCatalogPath,
    scratchCatalogPath,
    reviewCatalogPath,
    sidecarSrc,
  };
}

function restartDesktop(nextCatalogPath) {
  const env = { ...process.env };
  if (nextCatalogPath) {
    env.MEDIA_WORKSPACE_CATALOG = nextCatalogPath;
  } else {
    delete env.MEDIA_WORKSPACE_CATALOG;
  }
  const child = spawn(process.execPath, process.argv.slice(1), {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  app.quit();
}

function normalizeCatalogPath(targetPath) {
  if (!targetPath) {
    return null;
  }
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(rootDir, targetPath);
  return resolved.endsWith(".mwcatalog") ? resolved : `${resolved}.mwcatalog`;
}

function createCatalogAt(targetPath) {
  const normalizedPath = normalizeCatalogPath(targetPath);
  if (!normalizedPath) {
    return null;
  }
  fs.mkdirSync(normalizedPath, { recursive: true });
  return normalizedPath;
}

function callSidecar(command) {
  const result = spawnSync(
    "python3",
    buildSidecarArgs(command),
    {
      cwd: rootDir,
      env: {
        ...process.env,
        PYTHONPATH: sidecarSrc,
      },
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sidecar command failed");
  }

  return result.stdout.trim();
}

function callSidecarJson(command) {
  const payload = callSidecar(command);
  return payload ? JSON.parse(payload) : null;
}

function callSidecarAsync(command) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errChunks = [];
    const child = spawn("python3", buildSidecarArgs(command), {
      cwd: rootDir,
      env: { ...process.env, PYTHONPATH: sidecarSrc },
    });
    child.stdout.on("data", (data) => chunks.push(data));
    child.stderr.on("data", (data) => errChunks.push(data));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString() || "sidecar command failed"));
        return;
      }
      resolve(Buffer.concat(chunks).toString().trim());
    });
    child.on("error", reject);
  });
}

async function callSidecarJsonAsync(command) {
  const payload = await callSidecarAsync(command);
  return payload ? JSON.parse(payload) : null;
}

function buildSidecarArgs(command) {
  return ["-m", "media_workspace", "--catalog", currentCatalogPath, ...command];
}

function spawnDetachedSidecar(command) {
  return spawn("python3", buildSidecarArgs(command), {
    cwd: rootDir,
    env: {
      ...process.env,
      PYTHONPATH: sidecarSrc,
    },
    detached: true,
    stdio: "ignore",
  });
}

function launchSidecarJob(command) {
  const child = spawnDetachedSidecar(command);
  child.unref();
}

function formatJobStatus(job) {
  if (!job) {
    return {
      running: false,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      phase: null,
      phaseIndex: 0,
      phaseCount: 0,
      rawDirs: [],
      exportDirs: [],
      phaseResults: [],
      progress: 0,
      result: null,
      error: null,
      status: null,
      jobId: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  const payload = job.payload || {};
  const result = job.result || {};
  const status = String(job.status || "");
  return {
    running: status === "queued" || status === "running",
    startedAt: job.created_at || null,
    finishedAt: status === "succeeded" || status === "failed" ? job.updated_at || null : null,
    exitCode: status === "failed" ? 1 : status === "succeeded" ? 0 : null,
    phase: payload.phase || null,
    phaseLabel: payload.phase_label || null,
    phaseIndex: Number(payload.phase_index || 0),
    phaseCount: Number(payload.phase_count || 0),
    rawDirs: Array.isArray(payload.raw_dirs) ? payload.raw_dirs : [],
    exportDirs: Array.isArray(payload.export_dirs) ? payload.export_dirs : [],
    mode: payload.mode || null,
    phaseResults: Array.isArray(result.phase_results) ? result.phase_results : [],
    progress: Number(job.progress || 0),
    result,
    error: job.error || null,
    status,
    jobId: job.job_id,
    createdAt: job.created_at || null,
    updatedAt: job.updated_at || null,
  };
}

function latestJobStatus(jobType) {
  return formatJobStatus(callSidecarJson(["latest-job", "--job-type", jobType]));
}

function createJob(jobType, payload) {
  return callSidecarJson(["create-job", "--job-type", jobType, "--payload-json", JSON.stringify(payload || {})]);
}

function registerRoots(rootType, paths) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (!uniquePaths.length) {
    return [];
  }
  const command = ["register-roots", "--root-type", rootType];
  for (const targetPath of uniquePaths) {
    command.push("--path", targetPath);
  }
  return callSidecarJson(command) || [];
}

function startEnrichmentTask() {
  const current = latestJobStatus("enrichment");
  if (current.running) {
    return current;
  }
  const job = createJob("enrichment", {});
  launchSidecarJob(["run-enrichment-job", "--job-id", job.job_id]);
  return formatJobStatus(job);
}

function startImportTask(options) {
  const mode = String(options?.mode || "combined");
  const rawDirs = [...new Set((options?.rawDirs || []).filter(Boolean))];
  const exportDirs = [...new Set((options?.exportDirs || []).filter(Boolean))];
  const needsSources = mode === "source_only" || mode === "source_with_media" || mode === "combined";
  const needsProcessed = mode === "processed_only" || mode === "processed_with_sources" || mode === "combined";
  if (needsSources && !rawDirs.length) {
    throw new Error("choose at least one Source file or folder");
  }
  if (needsProcessed && !exportDirs.length) {
    throw new Error("choose at least one Processed Media file or folder");
  }
  const current = latestJobStatus("import");
  if (current.running) {
    return current;
  }
  const job = createJob("import", { raw_dirs: rawDirs, export_dirs: exportDirs, mode });
  const command = ["run-import-job", "--job-id", job.job_id, "--mode", mode];
  for (const rawDir of rawDirs) {
    command.push("--raw-dir", rawDir);
  }
  for (const exportDir of exportDirs) {
    command.push("--export-dir", exportDir);
  }
  launchSidecarJob(command);
  return formatJobStatus(job);
}

function startPreviewTask() {
  const current = latestJobStatus("preview");
  if (current.running) {
    return current;
  }
  const job = createJob("preview", { kind: "preview", asset_type: "export" });
  launchSidecarJob(["run-preview-job", "--job-id", job.job_id, "--kind", "preview", "--asset-type", "export"]);
  return formatJobStatus(job);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#101010",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });
  window.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    console.error(`[renderer:did-fail-load] ${code} ${description} ${validatedURL}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer:gone]", details);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[renderer:preload-error] ${preloadPath}`, error);
  });
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    return;
  }
  window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

function sendMenuAction(action) {
  const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!window) {
    return;
  }
  window.webContents.send("workspace:menu-action", action);
}

function buildAppMenu() {
  const template = [
    {
      label: "Framebase",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Use Scratch Catalog", click: () => sendMenuAction("catalog:scratch") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "New Catalog", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("catalog:new") },
        { label: "Open Catalog...", accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("catalog:open") },
        { type: "separator" },
        { label: "Add Processed Media...", click: () => sendMenuAction("import:pick-export") },
        { label: "Add Sources...", click: () => sendMenuAction("import:pick-source") },
        { type: "separator" },
        { label: "Run Import Pipeline", accelerator: "CmdOrCtrl+I", click: () => sendMenuAction("import:start") },
        { label: "Run Enrichment", click: () => sendMenuAction("import:enrich") },
        { label: "Generate Previews", click: () => sendMenuAction("import:previews") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Refresh", accelerator: "CmdOrCtrl+R", click: () => sendMenuAction("view:refresh") },
        { label: "Toggle Theme", click: () => sendMenuAction("view:toggle-theme") },
        { type: "separator" },
        { role: "toggleDevTools", accelerator: "Alt+CommandOrControl+I" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
  ];
  return Menu.buildFromTemplate(template);
}

ipcMain.handle("workspace:summary", () => {
  return JSON.parse(callSidecar(["summary", "--json"]));
});

ipcMain.handle("workspace:roots", () => {
  const payload = callSidecar(["catalog-roots"]);
  return payload ? JSON.parse(payload) : [];
});

ipcMain.handle("workspace:pick-directories", async (_event, kind) => {
  const result = await dialog.showOpenDialog({
    title: kind === "export" ? "Add Processed Media files or folders" : "Add Source files or folders",
    properties: ["openFile", "openDirectory", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("workspace:register-roots", (_event, rootType, paths) => {
  return registerRoots(rootType, paths);
});

ipcMain.handle("workspace:pick-catalog", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose catalog",
    properties: ["openDirectory"],
    defaultPath: path.join(rootDir, "data"),
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("workspace:create-catalog", async () => {
  const result = await dialog.showSaveDialog({
    title: "Create catalog",
    defaultPath: path.join(rootDir, "data", "untitled.mwcatalog"),
    buttonLabel: "Create Catalog",
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return createCatalogAt(result.filePath);
});

ipcMain.handle("workspace:switch-catalog", (_event, nextCatalogPath) => {
  currentCatalogPath = normalizeCatalogPath(nextCatalogPath || scratchCatalogPath) || scratchCatalogPath;
  prepareCatalogPath();
  return true;
});

ipcMain.handle("workspace:import-status", () => latestJobStatus("import"));

ipcMain.handle("workspace:import-start", (_event, options) => startImportTask(options));

ipcMain.handle("workspace:enrichment-status", () => latestJobStatus("enrichment"));

ipcMain.handle("workspace:enrich-start", () => startEnrichmentTask());

ipcMain.handle("workspace:preview-status", () => latestJobStatus("preview"));

ipcMain.handle("workspace:preview-start", () => startPreviewTask());

ipcMain.handle("workspace:pending", () => {
  const payload = callSidecar(["list-pending"]);
  return payload ? JSON.parse(payload) : [];
});

ipcMain.handle("workspace:browse", async (_event, options) => {
  return await callSidecarJsonAsync([
    "browse-exports",
    "--status",
    options.status,
    "--limit",
    String(options.limit),
    "--offset",
    String(options.offset),
  ]) || [];
});

ipcMain.handle("workspace:detail", async (_event, exportPath) => {
  return await callSidecarJsonAsync(["asset-detail", "--export-path", exportPath]);
});

ipcMain.handle("workspace:reveal", (_event, targetPath) => {
  if (!targetPath) {
    return false;
  }
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle("workspace:info", () => workspaceInfo());

// --- Collections ---

ipcMain.handle("workspace:list-collections", () => {
  return callSidecarJson(["list-collections"]) || [];
});

ipcMain.handle("workspace:create-collection", (_event, name, kind) => {
  return callSidecarJson(["create-collection", "--name", name, "--kind", kind || "manual"]);
});

ipcMain.handle("workspace:update-collection", (_event, collectionId, updates) => {
  const command = ["update-collection", "--collection-id", collectionId];
  if (updates.name != null) {
    command.push("--name", updates.name);
  }
  if (updates.rulesJson != null) {
    command.push("--rules-json", updates.rulesJson);
  }
  if (updates.sortOrder != null) {
    command.push("--sort-order", String(updates.sortOrder));
  }
  return callSidecarJson(command);
});

ipcMain.handle("workspace:delete-collection", (_event, collectionId) => {
  return callSidecarJson(["delete-collection", "--collection-id", collectionId]);
});

ipcMain.handle("workspace:collection-add-items", (_event, collectionId, assetIds) => {
  const command = ["collection-add-items", "--collection-id", collectionId];
  for (const id of assetIds) {
    command.push("--asset-id", id);
  }
  return callSidecarJson(command);
});

ipcMain.handle("workspace:collection-remove-items", (_event, collectionId, assetIds) => {
  const command = ["collection-remove-items", "--collection-id", collectionId];
  for (const id of assetIds) {
    command.push("--asset-id", id);
  }
  return callSidecarJson(command);
});

ipcMain.handle("workspace:set-asset-rating", (_event, assetIds, rating) => {
  const command = ["set-asset-rating", "--rating", String(rating)];
  for (const id of assetIds || []) {
    command.push("--asset-id", id);
  }
  return callSidecarJson(command);
});

ipcMain.handle("workspace:browse-collection", async (_event, collectionId, options) => {
  return await callSidecarJsonAsync([
    "browse-collection",
    "--collection-id",
    collectionId,
    "--limit",
    String(options?.limit || 120),
    "--offset",
    String(options?.offset || 0),
  ]) || [];
});

app.whenReady().then(() => {
  protocol.handle("media", (request) => {
    const raw = request.url.slice("media://".length);
    const filePath = raw.split("/").map((seg) => decodeURIComponent(seg)).join(path.sep);
    const resolved = path.resolve(filePath);
    const inCatalog = resolved === currentCatalogPath || resolved.startsWith(currentCatalogPath + path.sep);
    const existsOnDisk = fs.existsSync(resolved);
    if (!inCatalog && !existsOnDisk) {
      return new Response("forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });

  prepareCatalogPath();
  Menu.setApplicationMenu(buildAppMenu());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
