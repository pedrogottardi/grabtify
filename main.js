/* Grabtify — DaVinci Resolve Workflow Integration Plugin (main process).
 *
 * Follows the sandboxed pattern from Resolve's official SamplePlugin:
 * WorkflowIntegration.node is required HERE (in the main process), all
 * Resolve calls happen here, and the renderer talks to us over a preload
 * contextBridge + ipcRenderer. This is the model Resolve >= 19.0.2 enforces
 * (sandbox + context isolation by default).
 */
"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const settingsMod = require("./js/settings");
const toolsMod = require("./js/tools");
const pipeline = require("./js/pipeline");
const resolveApiModule = require("./js/resolve_api");
const updater = require("./js/updater");
const i18n = require("./js/i18n");

function t(key, vars) {
  return i18n.t(key, vars);
}

// Main-process messages follow the persisted language; call before any IPC
// handler that produces user-visible output.
function useLanguage() {
  i18n.setLanguage(settingsMod.load().language);
}

const PLUGIN_ID = "com.grabtify.plugin";

// BMD's native module ships alongside main.js. Required directly in the main
// process exactly like the official SamplePlugin does.
let WorkflowIntegration = null;
try {
  WorkflowIntegration = require("./WorkflowIntegration.node");
} catch (e) {
  WorkflowIntegration = null;
}

// The Resolve-facing API instance lives here; pipeline.js reaches it through
// the module-level bridge (resolve_api.importAndInsert delegates to this).
const resolveApi = resolveApiModule.createApi(WorkflowIntegration);
resolveApiModule.setActiveApi(resolveApi);

let win = null;
let activeJob = null; // { running: bool, cancelState: {cancelled, child} }

// GPU detection result, cached so a running job and the panel agree. Refreshed
// on boot and whenever the user hits "Check again" in Settings.
let gpuInfo = null;
function detectGpuCached() {
  if (gpuInfo === null) gpuInfo = toolsMod.detectGpu();
  return gpuInfo;
}

// "auto" and "on" both enable the hardware encoder whenever an NVIDIA GPU is
// actually present; "off" (or a GPU-less machine) keeps encoding on the CPU.
function gpuEncodeForJob() {
  const gpu = detectGpuCached();
  if (!gpu.available) return false;
  const mode = settingsMod.load().gpuEncode;
  return mode === "on" || mode === "auto";
}

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function emit(ev) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("grabtify:event", ev);
  }
}

function internalError(error) {
  activeJob = null;
  emit({
    type: "finish",
    ok: false,
    message: t("internal.error", [(error && error.stack) || String(error)]),
  });
}

function resolveStatus() {
  if (!WorkflowIntegration) {
    return {
      ok: false,
      message: t("resolve.notRunning"),
    };
  }
  try {
    const ok = resolveApi.isResolveRunning();
    return {
      ok: ok,
      message: ok ? t("resolve.connected") : t("resolve.notResponding"),
    };
  } catch (e) {
    return {
      ok: false,
      message: e && e.message ? e.message : t("resolve.notResponding"),
    };
  }
}

function registerIpc() {
  ipcMain.handle("grabtify:boot", () => {
    useLanguage();
    const rs = resolveStatus();
    return {
      settings: settingsMod.load(),
      QUALITIES: settingsMod.QUALITIES,
      AUDIO_QUALITIES: settingsMod.AUDIO_QUALITIES,
      MODES: settingsMod.MODES,
      INSERT_MODES: settingsMod.INSERT_MODES,
      TRIM_METHODS: settingsMod.TRIM_METHODS,
      PRESETS: settingsMod.PRESETS,
      EFFECTS: settingsMod.EFFECTS,
      AUDIO_EFFECTS: settingsMod.AUDIO_EFFECTS,
      LANGUAGES: settingsMod.LANGUAGES,
      GPU_ENCODE_MODES: settingsMod.GPU_ENCODE_MODES,
      gpu: detectGpuCached(),
      tools: toolsMod.quickCheckAll(),
      resolve_ok: rs.ok,
      resolve_msg: rs.message,
    };
  });

  ipcMain.handle("grabtify:save-settings", (_e, settings) => {
    const current = settingsMod.load();
    for (const k of Object.keys(settingsMod.DEFAULTS)) {
      if (k === "effect" || k === "audioEffect") continue; // effects are per-session; never persisted
      if (settings[k] !== undefined) current[k] = settings[k];
    }
    settingsMod.save(current);
    return { ok: true };
  });

  ipcMain.handle("grabtify:fetch-title", async (_e, rawUrl) => {
    useLanguage();
    const url = String(rawUrl || "").trim();
    const urlErr = pipeline.validateUrl(url);
    if (urlErr) return { ok: false, err: urlErr };
    const normalized = pipeline.normalizeVideoUrl(url);
    return toolsMod.fetchTitle(normalized[0]);
  });

  ipcMain.handle("grabtify:start-job", async (_e, opts) => {
    useLanguage();
    if (opts && opts.language) i18n.setLanguage(opts.language);
    if (!opts || typeof opts !== "object") {
      throw new Error(t("main.noOptions"));
    }
    if (activeJob && activeJob.running) {
      throw new Error(t("main.jobRunning"));
    }

    const urlErr = pipeline.validateUrl(opts.url);
    if (urlErr) throw new Error(urlErr);

    const normalized = pipeline.normalizeVideoUrl(opts.url);
    const url = normalized[0];

    let timeIn = null;
    let timeOut = null;
    if (opts.time_in) timeIn = pipeline.parseTimecode(String(opts.time_in));
    if (opts.time_out) timeOut = pipeline.parseTimecode(String(opts.time_out));

    const outDir = (opts.out_dir || "").trim() || settingsMod.defaultOutDir();
    const jobOpts = {
      url: url,
      time_in: timeIn,
      time_out: timeOut,
      trim: !!(timeIn || timeOut),
      trim_method: opts.trim_method || settingsMod.DEFAULTS.trimMethod,
      quality: opts.quality || settingsMod.DEFAULTS.quality,
      preset: opts.preset || settingsMod.DEFAULTS.preset,
      convert: opts.convert === undefined ? false : !!opts.convert,
      auto_encode: opts.auto_encode === undefined ? true : !!opts.auto_encode,
      insert_mode: opts.insert_mode || settingsMod.DEFAULTS.insertMode,
      mode: opts.mode === "audio" ? "audio" : "video",
      audio_quality: opts.audio_quality || settingsMod.DEFAULTS.audioQuality,
      effect: opts.effect || settingsMod.DEFAULTS.effect,
      audio_effect: opts.audio_effect || settingsMod.DEFAULTS.audioEffect,
      gpu_encode: gpuEncodeForJob(),
      verbose_log: !!opts.verbose_log,
      out_dir: outDir,
    };

    const cancelState = { cancelled: false, child: null };
    activeJob = { running: true, cancelState: cancelState };

    pipeline
      .runJob(jobOpts, emit, cancelState)
      .then((message) => {
        activeJob = null;
        emit({ type: "finish", ok: true, message: message });
      })
      .catch((error) => {
        activeJob = null;
        const cancelled = error instanceof toolsMod.JobCancelled;
        emit({
          type: "finish",
          ok: false,
          message: cancelled ? t("job.cancelled") : (error && error.message) || String(error),
        });
      });

    return { started: true };
  });

  ipcMain.handle("grabtify:cancel-job", () => {
    if (activeJob && activeJob.running) {
      toolsMod.cancel(activeJob.cancelState);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle("grabtify:open-folder", async (_e, dir) => {
    const target = (dir || "").trim() || settingsMod.defaultOutDir();
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (e) {
      // fall through — openPath will report an error string if unusable
    }
    const err = await shell.openPath(target);
    if (err) {
      emit({
        type: "log",
        line: t("main.openFolderErr", [err]),
        cls: "err",
      });
      return { ok: false };
    }
    return { ok: true };
  });

  ipcMain.handle("grabtify:browse-folder", async () => {
    const opts = {
      title: t("main.chooseFolder"),
      properties: ["openDirectory", "createDirectory"],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("grabtify:recheck-resolve", () => {
    useLanguage();
    gpuInfo = null; // re-run GPU detection too
    const rs = resolveStatus();
    emit({ type: "resolveStatus", ok: rs.ok, message: rs.message });
    return { ok: rs.ok, message: rs.message, gpu: detectGpuCached() };
  });

  ipcMain.handle("grabtify:open-external", async (_e, url) => {
    const target = String(url || "").trim();
    if (!/^https?:\/\//i.test(target)) return { ok: false };
    await shell.openExternal(target);
    return { ok: true };
  });

  // ------------------------------------------------------------ updater ---
  // Explicit checks always hit the network; automatic ones (panel open) are
  // throttled to once a day and silenced while the user has snoozed them.
  ipcMain.handle("grabtify:check-updates", async (_e, opts) => {
    useLanguage();
    const explicit = !!(opts && opts.explicit);
    if (!explicit) {
      const s0 = settingsMod.load();
      if ((s0.updateSnoozeUntil || 0) > Date.now()) return { tools: null, skipped: "snoozed" };
      if (Date.now() - (s0.updateCheckAt || 0) < UPDATE_INTERVAL_MS) {
        return { tools: null, skipped: "throttled" };
      }
    }
    const tools = await updater.latestVersions();
    const s = settingsMod.load();
    s.updateCheckAt = Date.now();
    settingsMod.save(s);
    emit({ type: "updates", tools: tools });
    return { tools: tools };
  });

  ipcMain.handle("grabtify:update-tools", async (_e, ids) => {
    useLanguage();
    if (activeJob && activeJob.running) {
      return { ok: false, err: t("updates.jobRunning") };
    }
    const list = Array.isArray(ids) ? ids : [];
    const results = await updater.updateTools(list, (tool, state, pct) => {
      emit({ type: "updateProgress", tool: tool, state: state, pct: pct });
    });
    const s = settingsMod.load();
    s.updateCheckAt = Date.now();
    settingsMod.save(s);
    const fresh = await updater.latestVersions();
    emit({ type: "updates", tools: fresh });
    emit({ type: "tools", tools: toolsMod.quickCheckAll() });
    return { ok: true, results: results };
  });

  ipcMain.handle("grabtify:snooze-updates", () => {
    const s = settingsMod.load();
    s.updateSnoozeUntil = Date.now() + UPDATE_INTERVAL_MS;
    settingsMod.save(s);
    return { ok: true };
  });

  ipcMain.handle("window-minimize", () => {
    if (win) win.minimize();
  });

  ipcMain.handle("window-close", () => {
    if (win) win.close();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 600,
    height: 560,
    icon: path.join(__dirname, "newico.png"),
    minWidth: 560,
    minHeight: 520,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: "silver",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      zoomFactor: 1,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setZoomFactor(1);
  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  // Never fail silently: any uncaught error in the main process becomes a
  // visible error in the panel instead of a frozen "job started".
  process.on("uncaughtException", internalError);
  process.on("unhandledRejection", internalError);

  let initResult = false;
  if (WorkflowIntegration && WorkflowIntegration.Initialize) {
    try {
      initResult = WorkflowIntegration.Initialize(PLUGIN_ID);
    } catch (e) {
      initResult = false;
    }
  }

  registerIpc();
  createWindow();

  if (initResult !== true) {
    setTimeout(() => {
      emit({
        type: "log",
        line: t("main.bindingFailed"),
        cls: "err",
      });
    }, 800);
  }
});

app.on("will-quit", () => {
  if (WorkflowIntegration && WorkflowIntegration.CleanUp) {
    try {
      WorkflowIntegration.CleanUp();
    } catch (e) {
      // ignore
    }
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
