/* Grabtify — preload bridge (sandboxed renderer).
 *
 * Resolve >= 19.0.2 runs plugin renderers with context isolation + sandbox,
 * so the old window.pywebview.api / nodeIntegration pattern is gone. We
 * expose a minimal window.grabtify API over ipcRenderer.invoke and forward
 * main-process events to a callback registered with onEvent (app.js).
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron/renderer");

const eventListeners = [];

ipcRenderer.on("grabtify:event", (_event, ev) => {
  for (const listener of eventListeners.slice()) {
    try {
      listener(ev);
    } catch (e) {
      // A misbehaving listener must not break the event loop.
    }
  }
});

contextBridge.exposeInMainWorld("grabtify", {
  boot: () => ipcRenderer.invoke("grabtify:boot"),
  saveSettings: (settings) => ipcRenderer.invoke("grabtify:save-settings", settings),
  fetchTitle: (url) => ipcRenderer.invoke("grabtify:fetch-title", url),
  startJob: (opts) => ipcRenderer.invoke("grabtify:start-job", opts),
  cancelJob: () => ipcRenderer.invoke("grabtify:cancel-job"),
  openFolder: (dir) => ipcRenderer.invoke("grabtify:open-folder", dir),
  browseFolder: () => ipcRenderer.invoke("grabtify:browse-folder"),
  recheckResolve: () => ipcRenderer.invoke("grabtify:recheck-resolve"),
  checkUpdates: (opts) => ipcRenderer.invoke("grabtify:check-updates", opts),
  updateTools: (ids) => ipcRenderer.invoke("grabtify:update-tools", ids),
  snoozeUpdates: () => ipcRenderer.invoke("grabtify:snooze-updates"),
  openExternal: (url) => ipcRenderer.invoke("grabtify:open-external", url),
  onEvent: (callback) => {
    if (typeof callback === "function") eventListeners.push(callback);
  },
});
