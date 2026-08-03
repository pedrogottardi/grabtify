/* Grabtify — panel logic. Talks to the Electron main process through the
 * sandboxed preload bridge (window.grabtify over contextBridge + IPC) — the
 * Resolve >= 19.0.2 replacement for pywebview's window.pywebview.API. Same
 * three-stage pipeline as YOINK!: Fetch → Encode → Timeline.
 */
"use strict";

(function () {
  const MAX_LOG_LINES = 300;

  function $(id) {
    return document.getElementById(id);
  }

  const el = {
    url: $("url"),
    timeIn: $("timeIn"),
    timeOut: $("timeOut"),
    trimMethod: $("trimMethod"),
    mode: $("mode"),
    quality: $("quality"),
    audioQuality: $("audioQuality"),
    preset: $("preset"),
    convert: $("convert"),
    autoEncode: $("autoEncode"),
    insertMode: $("insertMode"),
    language: $("language"),
    outDir: $("outDir"),
    browse: $("browseBtn"),
    go: $("goBtn"),
    cancel: $("cancelBtn"),
    open: $("openBtn"),
    log: $("log"),
    statusLine: $("statusLine"),
    notice: $("encodeNotice"),
    updatesModal: $("updatesModal"),
    updatesList: $("updatesList"),
    updNowBtn: $("updNowBtn"),
    updLaterBtn: $("updLaterBtn"),
    checkUpdatesBtn: $("checkUpdatesBtn"),
  };

  const state = {
    running: false,
    activeStage: null,
    pct: 0,
    indet: false,
    progressLabel: "",
    doneMsg: null,
    formErr: null,
    pastedTitle: null,
    titleFetching: false,
    updateTools: null,
    updating: false,
  };

  // The config returned by boot(), kept so the language change handler can
  // re-fill the dropdowns with freshly translated labels.
  let lastCfg = null;

  function t(key, vars) {
    const I = window.GrabtifyI18n;
    if (!I) return key;
    return I.translate(I.currentLanguage(), key, vars);
  }

  // Applies the saved language to every element annotated with a data-i18n
  // attribute (text, placeholder, title, aria-label) and to <html lang>.
  function applyLanguage() {
    const I = window.GrabtifyI18n;
    const lang = I ? I.currentLanguage() : "en";
    document.documentElement.lang = lang;
    if (!I) return;
    document.querySelectorAll("[data-i18n]").forEach((n) => {
      n.textContent = I.translate(lang, n.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((n) => {
      n.placeholder = I.translate(lang, n.getAttribute("data-i18n-ph"));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((n) => {
      n.title = I.translate(lang, n.getAttribute("data-i18n-title"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((n) => {
      n.setAttribute("aria-label", I.translate(lang, n.getAttribute("data-i18n-aria")));
    });
    refreshRigWords();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function truncate(s, n) {
    if (String(s).length <= n) return String(s);
    return String(s).slice(0, Math.max(0, n - 1)) + "…";
  }

  // ---------------------------------------------------------------- log ---
  function log(line, cls) {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = line;
    el.log.appendChild(d);
    while (el.log.children.length > MAX_LOG_LINES) {
      el.log.removeChild(el.log.firstChild);
    }
    el.log.scrollTop = el.log.scrollHeight;
  }

  // ------------------------------------------------------ stage strip / bar --
  function stageEl(name) {
    return document.querySelector('.stage-tok[data-stage="' + name + '"]');
  }
  function setStage(name, cls) {
    const s = stageEl(name);
    if (s) s.className = "stage-tok " + cls;
  }
  function resetRail(encodeOn) {
    setStage("fetch", "idle");
    setStage("encode", encodeOn ? "idle" : "skip");
    setStage("timeline", "idle");
    state.activeStage = null;
    state.pct = 0;
    state.indet = false;
    state.progressLabel = "";
  }

  // Show/hide the video-only vs audio-only controls (body class drives CSS;
  // hidden attributes avoid any layout flash before the class lands).
  function applyMode(mode) {
    document.body.className = "mode-" + (mode === "audio" ? "audio" : "video");
    document.querySelectorAll(".video-only").forEach((n) => {
      n.hidden = mode !== "video";
    });
    document.querySelectorAll(".audio-only").forEach((n) => {
      n.hidden = mode !== "audio";
    });
  }

  function renderStatus() {
    const L = el.statusLine;
    if (!L) return;
    L.classList.remove("err", "indet");
    if (state.formErr) {
      L.classList.add("err");
      L.textContent = state.formErr;
      return;
    }
    if (!state.running) {
      if (state.doneMsg) { L.textContent = state.doneMsg; return; }
      if (state.titleFetching) {
        L.innerHTML = t("status.fetchingTitle") +
          '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
        return;
      }
      if (state.pastedTitle) { L.textContent = "→ " + truncate(state.pastedTitle, 60); return; }
      L.textContent = t("status.pastePrompt");
      return;
    }
    const stg = state.activeStage || "?";
    const label = state.progressLabel || "";
    if (state.indet || state.pct === null) {
      L.classList.add("indet");
      L.innerHTML =
        '<span class="stg">[' + esc(stg) + ']</span> ' +
        '<span class="bar-blocks">▚▚▚▚▚▚▚▚▚▚</span> — ' + esc(label);
      return;
    }
    let blocks = "";
    const filled = Math.max(0, Math.min(10, Math.round(state.pct / 10)));
    for (let i = 0; i < 10; i++) blocks += i < filled ? "▮" : "▯";
    L.innerHTML =
      '<span class="stg">[' + esc(stg) + ']</span> ' +
      '<span class="bar-blocks">' + blocks + '</span> ' +
      Math.round(state.pct) + '% — ' + esc(label);
  }

  // ------------------------------------------------------- field validation --
  const invalidFields = [];
  function markInvalid(id) {
    const input = $(id);
    if (input && invalidFields.indexOf(id) === -1) {
      input.classList.add("invalid");
      invalidFields.push(id);
    }
  }
  function clearInvalid(id) {
    const input = $(id);
    if (input) input.classList.remove("invalid");
    const i = invalidFields.indexOf(id);
    if (i !== -1) invalidFields.splice(i, 1);
  }
  function anyFieldError() {
    return !!state.formErr;
  }
  function clearFormError() {
    state.formErr = null;
    ["url", "timeIn", "timeOut"].forEach(clearInvalid);
    renderStatus();
  }
  function validateFields() {
    const V = window.GrabtifyValidation;
    let first = null;
    if (V.validateUrl(el.url.value)) {
      markInvalid("url");
      first = first || "url";
    } else {
      clearInvalid("url");
    }
    for (const id of ["timeIn", "timeOut"]) {
      if (V.validateTimecode($(id).value)) {
        markInvalid(id);
        first = first || id;
      } else {
        clearInvalid(id);
      }
    }
    if (first) {
      state.formErr = first === "url" ? V.URL_ERROR : V.TIMECODE_ERROR;
      renderStatus();
    } else {
      clearFormError();
    }
    return first;
  }

  // ------------------------------------------- pasted-link title hint ------
  // After a short debounce, ask the main process for the pasted video's title
  // (via yt-dlp) and show it in the status line so the user can tell which
  // link they grabbed. "Last response wins" via titleSeq, and results are
  // ignored once a job is running.
  let titleTimer = null;
  let titleSeq = 0;

  function clearPastedTitle() {
    state.pastedTitle = null;
    state.titleFetching = false;
  }

  function fetchTitle(url) {
    const seq = ++titleSeq;
    state.titleFetching = true;
    renderStatus();
    const api = pyApi();
    if (!api || !api.fetchTitle) {
      state.titleFetching = false;
      renderStatus();
      return;
    }
    api.fetchTitle(url).then((res) => {
      if (seq !== titleSeq || state.running) return;
      state.titleFetching = false;
      if (res && res.ok && res.title) {
        state.pastedTitle = res.title;
        state.doneMsg = null;
      } else {
        state.pastedTitle = null;
      }
      renderStatus();
    }).catch(() => {
      if (seq !== titleSeq || state.running) return;
      state.titleFetching = false;
      state.pastedTitle = null;
      renderStatus();
    });
  }

  function scheduleTitleFetch() {
    clearTimeout(titleTimer);
    const V = window.GrabtifyValidation;
    const url = el.url.value.trim();
    if (state.running || !url || V.validateUrl(url)) {
      clearPastedTitle();
      renderStatus();
      return;
    }
    titleTimer = setTimeout(() => fetchTitle(url), 500);
  }

  // ---------------------------------------------------------- host bridge --
  function pyApi() {
    return window.grabtify || null;
  }
  function isReady() {
    return !!pyApi();
  }

  // ------------------- event sink: main process pushes events here ---------
  // The preload (contextBridge) forwards main-process events to this function
  // via window.grabtify.onEvent(handleEvent).
  function handleEvent(ev) {
    if (!ev || !ev.type) return;
    switch (ev.type) {
      case "stage":
        setStage(ev.stage, ev.state);
        if (ev.state === "active") {
          state.activeStage = ev.stage;
          if (ev.sub) { state.progressLabel = ev.sub; state.indet = true; }
          renderStatus();
        } else if (ev.state === "error") {
          renderStatus();
        }
        break;
      case "progress":
        state.pct = ev.pct === null || ev.pct === undefined ? null : Math.max(0, Math.min(100, ev.pct));
        state.indet = state.pct === null;
        if (ev.label !== undefined) state.progressLabel = ev.label;
        renderStatus();
        break;
      case "log":
        log(ev.line, ev.cls);
        break;
      case "finish":
        finishRun(ev.ok, ev.message);
        break;
      case "tools":
        applyToolStatus(ev.tools);
        break;
      case "resolveStatus":
        applyResolveStatus(ev.ok, ev.message);
        break;
      case "updates":
        renderUpdates(ev.tools);
        break;
      case "updateProgress":
        updateUpdateRow(ev.tool, ev.state, ev.pct);
        break;
    }
  }

  // With context isolation the preload lives in a separate world and cannot
  // reach the renderer's globals, so main-process events arrive over the
  // contextBridge instead.
  if (window.grabtify && window.grabtify.onEvent) {
    window.grabtify.onEvent(handleEvent);
  }

  // ------------------------------------------------- rig / system check ----
  // Settings opens as an equipment manifest: one row per rig unit
  // (resolve-api, yt-dlp, ffmpeg). A row's class is the source of truth for
  // state; refreshRigWords() renders the localized status word and the ready
  // summary so a language switch never desyncs them.
  function refreshRigWords() {
    document.querySelectorAll(".rig-row").forEach((row) => {
      const st = row.querySelector(".rig-state");
      if (!st) return;
      if (row.classList.contains("bad")) st.textContent = t("status.missing");
      else if (row.classList.contains("ok")) st.textContent = t("status.ready");
      else st.textContent = t("status.checking");
      if (row.dataset.tip) row.title = row.dataset.tip;
    });
    updateRigSummary();
  }

  function updateRigSummary() {
    const s = $("rigSummary");
    if (!s) return;
    const rows = document.querySelectorAll(".rig-row");
    if (!rows.length) return;
    const resolved = document.querySelectorAll(".rig-row.ok, .rig-row.bad").length;
    if (!resolved) { s.textContent = ""; return; }
    const ok = document.querySelectorAll(".rig-row.ok").length;
    s.textContent = t("settings.summary", [ok, rows.length]);
  }

  function setToken(id, ok, tip) {
    const st = $(id);
    if (!st) return;
    const row = st.closest(".rig-row");
    if (row) {
      row.classList.remove("wait", "ok", "bad");
      row.classList.add(ok === null || ok === undefined ? "wait" : ok ? "ok" : "bad");
      row.dataset.tip = tip || "";
    }
    refreshRigWords();
  }

  function applyToolStatus(tools) {
    const mapping = [
      { tool: "yt-dlp", state: "stYtdlp" },
      { tool: "ffmpeg", state: "stFfmpeg" },
      { tool: "deno", state: "stDeno" },
    ];
    for (const m of mapping) {
      const info = tools[m.tool];
      if (!info) {
        setToken(m.state, null, t("tools.noInfo"));
        continue;
      }
      const ok = info.ok;
      const tip = ok ? (info.version || "ok") : (info.err || info.version || "missing");
      setToken(m.state, ok, tip);
    }
  }

  function applyResolveStatus(ok, message) {
    setToken("stResolve", ok, message || "");
  }

  // ----------------------------------------------- binary update modal ---
  function hideUpdates() {
    if (el.updatesModal) el.updatesModal.setAttribute("hidden", "");
  }

  function updateUpdateRow(toolId, state, pct) {
    const ul = el.updatesList;
    if (!ul) return;
    for (const row of ul.querySelectorAll(".upd-row")) {
      if (row.dataset.tool !== toolId) continue;
      const st = row.querySelector(".upd-state");
      if (!st) return;
      st.classList.remove("downloading", "done", "failed");
      if (state === "downloading") {
        st.textContent = t("updates.stateDownloading", [pct == null ? 0 : pct]);
        st.classList.add("downloading");
      } else if (state === "extracting") {
        st.textContent = t("updates.stateExtracting");
        st.classList.add("downloading");
      } else if (state === "applying") {
        st.textContent = t("updates.stateApplying");
        st.classList.add("downloading");
      } else if (state === "done") {
        st.textContent = t("updates.stateDone");
        st.classList.add("done");
      } else if (state === "failed") {
        st.textContent = t("updates.stateFailed");
        st.classList.add("failed");
      }
    }
  }

  function renderUpdates(tools) {
    if (!tools || !Array.isArray(tools)) return;
    state.updateTools = tools;
    const outdated = tools.filter((tool) => tool.outdated);
    if (!outdated.length) {
      hideUpdates();
      return;
    }
    const ul = el.updatesList;
    if (!ul) return;
    ul.innerHTML = "";
    for (const tool of tools) {
      const li = document.createElement("li");
      li.className = "upd-row" + (tool.outdated ? " outdated" : "");
      li.dataset.tool = tool.id;

      const name = document.createElement("span");
      name.className = "upd-name";
      name.textContent = tool.id;

      const vers = document.createElement("span");
      vers.className = "upd-vers";
      vers.textContent = tool.outdated
        ? (tool.installed || "?") + " → " + (tool.latest || "?")
        : (tool.installed || t("updates.unknown"));

      const st = document.createElement("span");
      st.className = "upd-state";
      if (tool.outdated && !tool.bundled) st.textContent = t("updates.onPath");
      else if (tool.err) st.textContent = t("updates.unknown");
      else if (!tool.outdated) st.textContent = t("updates.upToDate");
      else st.textContent = "";

      li.appendChild(name);
      li.appendChild(vers);
      li.appendChild(st);
      ul.appendChild(li);
    }
    el.updatesModal.removeAttribute("hidden");
    if (el.updNowBtn) el.updNowBtn.disabled = state.updating || state.running;
    if (el.updLaterBtn) el.updLaterBtn.disabled = state.updating;
  }

  function wireUpdateUi() {
    if (el.checkUpdatesBtn) {
      el.checkUpdatesBtn.addEventListener("click", () => {
        const api = pyApi();
        if (!api || !api.checkUpdates || state.running) return;
        const btn = el.checkUpdatesBtn;
        btn.disabled = true;
        api.checkUpdates({ explicit: true })
          .then((res) => {
            if (res && res.tools) {
              renderUpdates(res.tools);
              if (!res.tools.some((tool) => tool.outdated)) {
                log(t("updates.noUpdate"), "ok");
              }
            } else if (res && res.skipped) {
              log(t("updates.noUpdate"), "ok");
            }
          })
          .catch((e) => {
            log(t("status.couldNotStart", [t("settings.checkUpdates")]) + ": " +
              (e && e.message ? e.message : e), "err");
          })
          .then(() => { btn.disabled = false; });
      });
    }
    if (el.updNowBtn) {
      el.updNowBtn.addEventListener("click", () => {
        if (!state.updateTools || state.updating || state.running) return;
        const api = pyApi();
        if (!api || !api.updateTools) return;
        const ids = state.updateTools
          .filter((tool) => tool.outdated && tool.bundled)
          .map((tool) => tool.id);
        if (!ids.length) { hideUpdates(); return; }
        state.updating = true;
        el.updNowBtn.disabled = true;
        el.updLaterBtn.disabled = true;
        api.updateTools(ids)
          .catch((e) => {
            log(t("updates.stateFailed") + ": " + (e && e.message ? e.message : e), "err");
          })
          .then(() => {
            state.updating = false;
            el.updNowBtn.disabled = false;
            el.updLaterBtn.disabled = false;
          });
      });
    }
    if (el.updLaterBtn) {
      el.updLaterBtn.addEventListener("click", () => {
        const api = pyApi();
        if (api && api.snoozeUpdates) api.snoozeUpdates();
        hideUpdates();
      });
    }
  }

  // ----------------------------------------------------------- selectors ---
  // Option labels are i18n keys (settings.js keeps values stable); resolve
  // them here so switching language re-labels every dropdown.
  function fillSelect(c, pairs, current) {
    c.innerHTML = "";
    for (const pair of pairs) {
      const o = document.createElement("option");
      o.value = pair[0];
      o.textContent = t(pair[1]);
      if (pair[0] === current) o.selected = true;
      c.appendChild(o);
    }
  }
  function fillSelects(cfg) {
    fillSelect(el.quality, cfg.QUALITIES, cfg.settings.quality);
    fillSelect(el.audioQuality, cfg.AUDIO_QUALITIES, cfg.settings.audioQuality);
    fillSelect(el.mode, cfg.MODES, cfg.settings.mode);
    fillSelect(el.insertMode, cfg.INSERT_MODES, cfg.settings.insertMode);
    fillSelect(el.trimMethod, cfg.TRIM_METHODS, cfg.settings.trimMethod);
    fillSelect(el.preset, cfg.PRESETS, cfg.settings.preset);
    fillSelect(el.language, cfg.LANGUAGES, cfg.settings.language);
    el.outDir.value = cfg.settings.outDir;
    el.convert.checked = !!cfg.settings.convert;
    el.autoEncode.checked = cfg.settings.autoEncode !== false;
    el.preset.disabled = !el.convert.checked;
    applyMode(el.mode.value);
    applyAutoEncode();
    updateNotice();
    // Keep the trim drawer open when points are set (e.g. after a language
    // switch), so an active cut is never hidden inside a collapsed panel.
    const trimDetails = $("trimBlock");
    if (trimDetails) trimDetails.open = !!(el.timeIn.value || el.timeOut.value);
  }

  // The "Automatic encoding" switch hides the manual encode controls. When it
  // is on, the pipeline decides on its own (H.264/AAC passes straight through);
  // turning it off restores the manual "Encode to MP4" checkbox + quality.
  function applyAutoEncode() {
    const manual = document.querySelectorAll(".manual-only");
    const hide = el.autoEncode && el.autoEncode.checked;
    for (let i = 0; i < manual.length; i++) {
      if (hide) manual[i].setAttribute("hidden", "");
      else manual[i].removeAttribute("hidden");
    }
    if (el.preset) el.preset.disabled = hide || !el.convert.checked;
  }

  // Whether the ENCODE stage will do real work on the next run (audio always,
  // manual convert, or an "encode-time" trim). With automatic mode alone we
  // can't know until the download lands, so the token stays neutral.
  function railEncodeOn() {
    return el.mode.value === "audio" || el.convert.checked ||
      (el.autoEncode.checked && el.trimMethod.value === "ffmpeg" &&
       !!(el.timeIn.value.trim() || el.timeOut.value.trim()));
  }

  // ------------------------------------------------------------- settings ---
  function gatherSettings() {
    return {
      mode: el.mode.value,
      quality: el.quality.value,
      audioQuality: el.audioQuality.value,
      preset: el.preset.value,
      insertMode: el.insertMode.value,
      trimMethod: el.trimMethod.value,
      outDir: el.outDir.value,
      convert: el.convert.checked,
      autoEncode: el.autoEncode.checked,
      language: el.language.value,
    };
  }
  function saveSettings() {
    const api = pyApi();
    if (api && api.saveSettings) api.saveSettings(gatherSettings());
  }

  // ------------------------------------------------ encode-dependency notice --
  // Only meaningful in video + manual mode: MP3 mode always encodes (that IS the
  // MP3 conversion) and automatic mode never nudges (the pipeline decides).
  function updateNotice() {
    if (el.mode.value === "audio" || (el.autoEncode && el.autoEncode.checked)) {
      el.notice.setAttribute("hidden", "");
      return;
    }
    const trimFfmpeg = el.trimMethod.value === "ffmpeg";
    if (trimFfmpeg && !el.convert.checked) {
      el.notice.removeAttribute("hidden");
    } else {
      el.notice.setAttribute("hidden", "");
    }
  }

  // ------------------------------------------------------------- run flow ---
  function setFormEnabled(enabled) {
    const ids = ["url", "timeIn", "timeOut", "mode", "trimMethod", "quality",
                 "audioQuality", "preset", "convert", "autoEncode", "insertMode",
                 "outDir", "browseBtn", "goBtn", "clearTcBtn"];
    for (const id of ids) {
      const n = $(id);
      if (n) n.disabled = !enabled;
    }
    el.cancel.hidden = enabled;
  }

  function finishRun(ok, message) {
    state.running = false;
    state.doneMsg = message || (ok ? t("status.finishedOk") : t("status.finishedFail"));
    setFormEnabled(true);
    if (ok) {
      log(message, "ok");
      el.url.select();
    } else {
      log(message, "err");
      setStage(state.activeStage || "fetch", "error");
    }
    renderStatus();
    if (!ok) {
      const L = el.statusLine;
      if (L) L.classList.add("err");
    }
  }

  function go() {
    if (state.running) return;
    if (!isReady()) {
      const L = el.statusLine;
      if (L) { L.classList.add("err"); L.textContent = t("status.notReady"); }
      return;
    }

    const firstErr = validateFields();
    if (firstErr) {
      $(firstErr).focus();
      return;
    }

    const tInRaw = el.timeIn.value;
    const tOutRaw = el.timeOut.value;
    const tIn = tInRaw.trim() ? tInRaw.trim() : null;
    const tOut = tOutRaw.trim() ? tOutRaw.trim() : null;

    const mode = el.mode.value === "audio" ? "audio" : "video";

    const autoEncode = el.autoEncode.checked;
    let convert = !autoEncode && el.convert.checked;
    if (!autoEncode && mode !== "audio" && (tIn || tOut) &&
        el.trimMethod.value === "ffmpeg" && !convert) {
      convert = true;
      el.convert.checked = true;
      el.preset.disabled = false;
      updateNotice();
    }

    const opts = {
      url: el.url.value.trim(),
      mode: mode,
      time_in: tIn,
      time_out: tOut,
      trim: !!(tIn || tOut),
      trim_method: el.trimMethod.value,
      quality: el.quality.value,
      audio_quality: el.audioQuality.value,
      preset: el.preset.value,
      convert: convert,
      auto_encode: autoEncode,
      insert_mode: el.insertMode.value,
      out_dir: (el.outDir.value || "").trim(),
    };

    saveSettings();
    resetRail(opts.mode === "audio" || opts.convert ||
      (opts.auto_encode && opts.trim && opts.trim_method === "ffmpeg"));
    state.running = true;
    state.doneMsg = null;
    titleSeq++;
    state.titleFetching = false;
    state.activeStage = "fetch";
    state.pct = null;
    state.indet = true;
    state.progressLabel = t("job.starting");
    setFormEnabled(false);
    el.log.innerHTML = "";
    renderStatus();
    log(t("boot.jobStarted", [new Date().toLocaleTimeString()]));

    pyApi().startJob(opts).then(() => {
      // The whole job state is pushed back through handleEvent.
    }).catch((e) => {
      finishRun(false, t("status.couldNotStart", [e && e.message ? e.message : e]));
    });
  }

  function cancelRun() {
    if (!state.running) return;
    log(t("boot.cancelling"), "note");
    const api = pyApi();
    if (api && api.cancelJob) api.cancelJob();
  }

  // ------------------------------------------------------------- wiring ---
  el.go.addEventListener("click", go);
  el.cancel.addEventListener("click", cancelRun);

  el.url.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });

  // Ctrl+Enter runs from anywhere; Esc cancels (or clears an inline error
  // when nothing is running).
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      go();
    } else if (e.key === "Escape") {
      if (state.running) {
        cancelRun();
      } else if (el.updatesModal && !el.updatesModal.hasAttribute("hidden")) {
        const api = pyApi();
        if (api && api.snoozeUpdates) api.snoozeUpdates();
        hideUpdates();
      } else if (anyFieldError()) {
        clearFormError();
        el.url.focus();
      }
    }
  });

  el.open.addEventListener("click", () => {
    const api = pyApi();
    if (api && api.openFolder) api.openFolder((el.outDir.value || "").trim());
  });

  // External links (settings donate + header coffee cup) open in the system
  // browser through the main process.
  function wireExternal(link) {
    if (!link) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const api = pyApi();
      if (api && api.openExternal) api.openExternal(link.href);
      else window.open(link.href, "_blank");
    });
  }
  wireExternal($("koFiLink"));
  wireExternal($("koFiHeaderBtn"));

  el.browse.addEventListener("click", () => {
    const api = pyApi();
    if (!api || !api.browseFolder) return;
    api.browseFolder().then((res) => {
      if (res) { el.outDir.value = res; saveSettings(); }
    });
  });

  el.convert.addEventListener("change", () => {
    el.preset.disabled = !el.convert.checked;
    updateNotice();
    resetRail(railEncodeOn());
    saveSettings();
  });

  el.autoEncode.addEventListener("change", () => {
    applyAutoEncode();
    updateNotice();
    resetRail(railEncodeOn());
    saveSettings();
  });

  el.mode.addEventListener("change", () => {
    applyMode(el.mode.value);
    updateNotice();
    resetRail(railEncodeOn());
    saveSettings();
  });

  el.trimMethod.addEventListener("change", () => {
    updateNotice();
    resetRail(railEncodeOn());
    saveSettings();
  });

  for (const id of ["quality", "audioQuality", "preset", "insertMode"]) {
    $(id).addEventListener("change", saveSettings);
  }
  el.outDir.addEventListener("change", saveSettings);

  // Field errors clear as you type.
  for (const id of ["url", "timeIn", "timeOut"]) {
    $(id).addEventListener("input", () => {
      clearInvalid(id);
      if (state.formErr) clearFormError();
    });
  }

  // Debounced title lookup for the pasted link.
  el.url.addEventListener("input", () => {
    scheduleTitleFetch();
  });

  // Language switch re-labels everything immediately and persists the choice.
  // Re-fill from the CURRENT DOM values (not the boot snapshot) so the
  // language select keeps the new choice and other settings don't revert.
  el.language.addEventListener("change", () => {
    if (window.GrabtifyI18n) window.GrabtifyI18n.setLanguage(el.language.value);
    if (lastCfg) {
      lastCfg.settings = gatherSettings();
      fillSelects(lastCfg);
    }
    applyLanguage();
    renderStatus();
    saveSettings();
  });

  // Settings gear toggle
  const gear = $("settingsBtn");
  const main = $("mainView");
  const settings = $("settingsView");
  const consoleEl = document.querySelector(".console");
  const statusEl = document.querySelector(".status");
  if (gear && main && settings) {
    gear.addEventListener("click", () => {
      const opening = settings.hasAttribute("hidden");
      if (opening) { settings.removeAttribute("hidden"); main.setAttribute("hidden", ""); }
      else { settings.setAttribute("hidden", ""); main.removeAttribute("hidden"); }
      if (consoleEl) {
        if (opening) consoleEl.setAttribute("hidden", "");
        else consoleEl.removeAttribute("hidden");
      }
      if (statusEl) {
        if (opening) statusEl.setAttribute("hidden", "");
        else statusEl.removeAttribute("hidden");
      }
      gear.className = "icon-btn" + (opening ? " active" : "");
      gear.setAttribute("aria-expanded", opening ? "true" : "false");
    });
  }

  // Timecode auto-grouping — same behaviour as YOINK! Colons are inserted
  // automatically while typing, grouping right-to-left from the digit count:
  // 1-2 digits = seconds, 3-4 = M:SS/MM:SS, 5-6 = H:MM:SS/HH:MM:SS (max
  // HH:MM:SS). Any ":" the user types or pastes is absorbed and rebuilt into
  // that canonical form, so "1:30:00" and "13000" both end up "1:30:00".
  function formatTimecode(v) {
    if (v.indexOf(".") !== -1) return v;
    if (!/^[0-9:]*$/.test(v)) return v;
    let d = v.replace(/:/g, "");
    if (d.length > 6) d = d.slice(0, 6);
    if (d.length <= 2) return d;
    if (d.length <= 4) return d.slice(0, d.length - 2) + ":" + d.slice(-2);
    return d.slice(0, d.length - 4) + ":" + d.slice(-4, -2) + ":" + d.slice(-2);
  }
  function wireTimecode(id) {
    const input = $(id);
    if (!input) return;
    input.addEventListener("input", () => {
      const f = formatTimecode(input.value);
      if (f !== input.value) {
        input.value = f;
        try { input.setSelectionRange(f.length, f.length); } catch (e) {}
      }
    });
  }
  wireTimecode("timeIn");
  wireTimecode("timeOut");

  const clearTc = $("clearTcBtn");
  if (clearTc) {
    clearTc.addEventListener("click", () => {
      el.timeIn.value = "";
      el.timeOut.value = "";
      clearInvalid("timeIn");
      clearInvalid("timeOut");
    });
  }

  // Re-check Resolve button
  const recheckBtn = $("recheckResolveBtn");
  if (recheckBtn) {
    recheckBtn.addEventListener("click", () => {
      const api = pyApi();
      if (api && api.recheckResolve) api.recheckResolve();
    });
  }

  wireUpdateUi();

  let autoChecked = false;
  function autoCheckUpdates() {
    if (autoChecked) return;
    autoChecked = true;
    const api = pyApi();
    if (!api || !api.checkUpdates) return;
    api.checkUpdates({ auto: true })
      .then((res) => {
        if (res && res.tools) renderUpdates(res.tools);
      })
      .catch(() => {});
  }

  // --------------------------------------------------------------- init ---
  // The preload bridge (window.grabtify) is live before any page script
  // runs, but we still poll so the panel copes with slow IPC startup.
  function hideBoot() {
    const b = $("bootScreen");
    if (b) b.setAttribute("hidden", "");
  }

  function bootstrap() {
    const api = pyApi();
    if (!api) return false;
    api.boot().then((cfg) => {
      if (cfg) {
        if (window.GrabtifyI18n) window.GrabtifyI18n.setLanguage(cfg.settings.language || "en");
        lastCfg = cfg;
        fillSelects(cfg);
        resetRail(railEncodeOn());
        if (cfg.tools) applyToolStatus(cfg.tools);
        applyResolveStatus(cfg.resolve_ok, cfg.resolve_msg);
        applyLanguage();
        renderStatus();
        log(t("boot.ready"));
        log(t("boot.toolsNote"), "note");
        autoCheckUpdates();
      }
      hideBoot();
    }).catch((e) => {
      const L = el.statusLine;
      applyLanguage();
      if (L) { L.classList.add("err"); L.textContent = t("status.bootFailed", [e && e.message ? e.message : e]); }
      hideBoot();
    });
    return true;
  }

  let tries = 0;
  const t2 = setInterval(() => {
    if (bootstrap() || ++tries > 40) clearInterval(t2);
  }, 250);
})();
