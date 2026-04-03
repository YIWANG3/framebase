const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mediaWorkspace", {
  getInfo: () => ipcRenderer.invoke("workspace:info"),
  getSummary: () => ipcRenderer.invoke("workspace:summary"),
  getCatalogRoots: () => ipcRenderer.invoke("workspace:roots"),
  pickDirectories: (kind) => ipcRenderer.invoke("workspace:pick-directories", kind),
  registerRoots: (rootType, paths) => ipcRenderer.invoke("workspace:register-roots", rootType, paths),
  createCatalog: () => ipcRenderer.invoke("workspace:create-catalog"),
  pickCatalog: () => ipcRenderer.invoke("workspace:pick-catalog"),
  switchCatalog: (catalogPath) => ipcRenderer.invoke("workspace:switch-catalog", catalogPath),
  getImportStatus: () => ipcRenderer.invoke("workspace:import-status"),
  startImport: (options) => ipcRenderer.invoke("workspace:import-start", options),
  getEnrichmentStatus: () => ipcRenderer.invoke("workspace:enrichment-status"),
  startEnrichment: () => ipcRenderer.invoke("workspace:enrich-start"),
  getPreviewStatus: () => ipcRenderer.invoke("workspace:preview-status"),
  startPreviewGeneration: () => ipcRenderer.invoke("workspace:preview-start"),
  getPending: () => ipcRenderer.invoke("workspace:pending"),
  browseExports: (options) => ipcRenderer.invoke("workspace:browse", options),
  getAssetDetail: (exportPath) => ipcRenderer.invoke("workspace:detail", exportPath),
  revealPath: (targetPath) => ipcRenderer.invoke("workspace:reveal", targetPath),
  onMenuAction: (callback) => {
    ipcRenderer.removeAllListeners("workspace:menu-action");
    ipcRenderer.on("workspace:menu-action", (_event, action) => callback(action));
  },
});
