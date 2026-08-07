/* Grabtify plugin — Resolve automation.
 *
 * Talks to Resolve's JavaScript API via the
 * WorkflowIntegration.node native module that BMD ships with its Developer
 * documentation. `createApi(workflowIntegration)` closes over the module so
 * the rest of the code never needs to know where the handle came from.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const i18n = require("./i18n");

function t(key, vars) {
  return i18n.t(key, vars);
}

const BIN_NAME = "Grabtify";

class ResolveError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResolveError";
  }
}

// Parse a frame-rate setting like "23.976", "30", "29.97 DF" or a plain number
// into { base, nominal, dropFrame }. Returns null for unparseable input.
function fpsInfo(fpsValue) {
  if (fpsValue === undefined || fpsValue === null) return null;
  const s = String(fpsValue).trim();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!isFinite(base) || base <= 0) return null;
  return {
    base: base,
    nominal: Math.round(base),
    dropFrame: /DF/i.test(s),
  };
}

// Convert an "HH:MM:SS:FF" (or drop-frame "HH:MM:SS;FF") timecode to a frame
// count. Drop-frame counting is handled for the two nominal rates Resolve uses
// (30 and 60); every other rate is treated as contiguous. Returns null on
// unparseable input.
function timecodeToFrame(tc, fpsValue) {
  const info = fpsInfo(fpsValue);
  if (!info) return null;
  const parts = String(tc).trim().split(/[:;]/);
  if (parts.length !== 4) return null;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const ss = parseInt(parts[2], 10);
  const ff = parseInt(parts[3], 10);
  if (![hh, mm, ss, ff].every((n) => Number.isInteger(n) && n >= 0)) return null;
  const seconds = hh * 3600 + mm * 60 + ss;
  if (!info.dropFrame || (info.nominal !== 30 && info.nominal !== 60)) {
    return seconds * info.base + ff;
  }
  const dropPerMinute = info.nominal === 60 ? 4 : 2;
  const minuteCount = hh * 60 + mm;
  const dropped = dropPerMinute * (minuteCount - Math.floor(minuteCount / 10));
  return seconds * info.nominal + ff - dropped;
}

// GetSubFolders() returns a collection that is an array on some bindings and
// an object (index- or name-keyed) on others — normalise both to an array.
function listSubFolders(root) {
  const subs = root.GetSubFolders();
  const list = [];
  if (!subs) return list;
  if (typeof subs.length === "number") {
    for (let i = 0; i < subs.length; i++) list.push(subs[i]);
  } else {
    for (const k in subs) {
      if (Object.prototype.hasOwnProperty.call(subs, k)) list.push(subs[k]);
    }
  }
  return list;
}

function findSubFolder(root, name) {
  for (const sub of listSubFolders(root)) {
    try {
      if (sub.GetName && sub.GetName() === name) return sub;
    } catch (e) {
      // keep scanning
    }
  }
  return null;
}

function createApi(workflowIntegration) {
  function resolveHandle() {
    if (!workflowIntegration || !workflowIntegration.GetResolve) {
      throw new ResolveError(t("resolve.missingModule"));
    }
    let resolve;
    try {
      resolve = workflowIntegration.GetResolve();
    } catch (e) {
      throw new ResolveError(t("resolve.bindFailRunning"));
    }
    if (!resolve) {
      throw new ResolveError(t("resolve.bindFailRunning2"));
    }
    const pm = resolve.GetProjectManager();
    if (!pm) {
      throw new ResolveError(t("resolve.noProjectManager"));
    }
    return { resolve: resolve, pm: pm };
  }

  function project(pm) {
    const p = pm.GetCurrentProject();
    if (!p) {
      throw new ResolveError(t("resolve.noProject"));
    }
    return p;
  }

  function activeTimeline(proj) {
    const tl = proj.GetCurrentTimeline();
    if (!tl) {
      throw new ResolveError(t("resolve.noTimeline"));
    }
    return tl;
  }

  function timelineFrame(timeline, proj) {
    // recordFrame is the clip's position on the timeline ruler, an absolute
    // frame number. Prefer the direct playhead getter when the binding exposes
    // it; otherwise derive the playhead frame from the timeline's timecode
    // ruler (GetCurrentTimecode/GetStartTimecode + the project frame rate),
    // which every version documents.
    try {
      if (typeof timeline.GetPlayheadFrame === "function") {
        const ph = parseInt(timeline.GetPlayheadFrame(), 10);
        if (isFinite(ph)) return Math.max(0, ph);
      }
      const start = parseInt(timeline.GetStartFrame(), 10);
      let fpsValue = null;
      if (proj && typeof proj.GetSetting === "function") {
        try {
          fpsValue = proj.GetSetting("timelineFrameRate");
        } catch (e) {
          // ignore
        }
      }
      const current = timecodeToFrame(timeline.GetCurrentTimecode(), fpsValue);
      const startTC = timecodeToFrame(timeline.GetStartTimecode(), fpsValue);
      if (current === null || startTC === null || !isFinite(start)) return null;
      return Math.max(0, Math.round(start + (current - startTC)));
    } catch (e) {
      return null;
    }
  }

  function clipEndFrame(mediaItem) {
    // startFrame/endFrame are 1-based frames within the source clip. Prefer
    // the clip's real duration; try the "Frames" property when "Duration" is
    // unavailable, and omit the pair entirely if neither is readable so Resolve
    // uses the full clip.
    for (const key of ["Duration", "Frames"]) {
      try {
        const prop = mediaItem.GetClipProperty(key);
        if (prop !== undefined && prop !== null && String(prop) !== "") {
          const d = parseFloat(String(prop));
          if (isFinite(d) && d > 0) {
            return { endFrame: d, source: key, raw: String(prop) };
          }
        }
      } catch (e) {
        // fall through
      }
    }
    return null;
  }

  function getOrCreateBin(proj, name) {
    const mp = proj.GetMediaPool();
    if (!mp) throw new ResolveError(t("resolve.noMediaPool"));
    const root = mp.GetRootFolder();
    if (!root) {
      throw new ResolveError(t("resolve.noRoot"));
    }

    let found = null;
    try {
      found = findSubFolder(root, name);
    } catch (e) {
      // GetSubFolders unavailable — fall through to create.
    }
    if (found) return found;

    let created = null;
    try {
      if (mp.AddSubFolder) created = mp.AddSubFolder(root, name);
      else if (mp.CreateSubFolder) created = mp.CreateSubFolder(root, name);
    } catch (e) {
      throw new ResolveError(t("resolve.createBinErr", [name, e.message]));
    }
    if (!created) {
      throw new ResolveError(t("resolve.createBinRefused", [name]));
    }
    return created;
  }

  function safeGet(fn) {
    try {
      const v = fn();
      if (v === undefined || v === null) return null;
      if (typeof v === "string" || typeof v === "number") return v;
      return String(v);
    } catch (e) {
      return null;
    }
  }

  function countTimelineItems(timeline) {
    let total = 0;
    for (const type of ["video", "audio"]) {
      try {
        const count = parseInt(timeline.GetTrackCount(type), 10);
        if (!isFinite(count) || count < 0) continue;
        for (let i = 1; i <= count; i++) {
          try {
            const items = timeline.GetItemListInTrack(type, i);
            if (items) total += items.length;
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return total;
  }

  function writeDiagnostics(entry) {
    try {
      const dir = process.env.TEMP || ".";
      fs.appendFileSync(
        path.join(dir, "grabtify-resolve.log"),
        JSON.stringify(entry) + "\n"
      );
    } catch (e) {
      // never fail a job over logging
    }
  }

  function emitDiag(emit, line) {
    if (typeof emit !== "function") return;
    try {
      emit({ type: "log", line: line, cls: "note" });
    } catch (e) {
      // ignore
    }
  }

  function appendToTimeline(mp, mediaItem) {
    let appended = false;
    let appendErr = null;
    try {
      appended = !!mp.AppendToTimeline([mediaItem]);
    } catch (e) {
      appendErr = e;
      appended = false;
    }
    if (!appended) {
      throw new ResolveError(
        t("resolve.insertFailed", [
          appendErr && appendErr.message ? appendErr.message : t("resolve.refused"),
        ])
      );
    }
    return "append";
  }

  // Import a file into the media pool, then move it into the Grabtify bin so
  // it stays easy to find. Resolve 21 renamed MoveMediaToFolder to MoveClips;
  // support both.
  function importToBin(mp, proj, binName, filePath) {
    const binFolder = getOrCreateBin(proj, binName);

    let items = [];
    try {
      items = mp.ImportMedia([filePath]) || [];
    } catch (e) {
      throw new ResolveError(t("resolve.importRefused", [e.message]));
    }
    if (!items.length) {
      throw new ResolveError(t("resolve.noItems"));
    }
    const clean = items.filter((i) => !!i);

    try {
      if (mp.MoveClips) mp.MoveClips(clean, binFolder);
      else {
        for (const item of clean) mp.MoveMediaToFolder([item], binFolder);
      }
    } catch (e) {
      // Non-fatal: the clip is in the pool, just in a different folder.
    }

    return clean[0];
  }

  function importAndInsert(filePath, mode, isAudio, binName, emit) {
    if (binName === undefined) binName = BIN_NAME;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new ResolveError(t("resolve.fileNotFound", [resolved]));
    }

    const { resolve, pm } = resolveHandle();
    const proj = project(pm);
    const mp = proj.GetMediaPool();
    if (!mp) throw new ResolveError(t("resolve.noMediaPool"));

    const mediaItem = importToBin(mp, proj, binName, resolved);
    if (mode === "bin") return "bin";

    const timeline = proj.GetCurrentTimeline();
    if (!timeline) return "bin-noseq";

    if (mode === "append") {
      return appendToTimeline(mp, mediaItem);
    }

    return insertAtPlayhead(mp, proj, timeline, mediaItem, isAudio, emit);
  }

  // Resolve has no "insert at playhead" API. The only way to place a clip at
  // a chosen position is AppendToTimeline with a clipInfo whose recordFrame
  // is the target timeline frame. Audio tracks use negative track indices.
  // clipInfo mediaType is 1 = video only, 2 = audio only; we only set it for
  // audio files and leave it off for video so Resolve inserts the clip's
  // natural type (video + audio). Because some Resolve builds silently accept
  // the dict form without placing anything, we verify the insert by comparing
  // the timeline's item count before and after, and fall back to a plain
  // append — reported honestly as "append" — instead of claiming the clip
  // landed at the playhead.
  function insertAtPlayhead(mp, proj, timeline, mediaItem, isAudio, emit) {
    const trackIndex = isAudio ? -1 : 1;

    const diag = {
      action: "playhead",
      isAudio: isAudio,
      ts: new Date().toISOString(),
    };
    diag.startFrame = safeGet(() => timeline.GetStartFrame());
    diag.startTimecode = safeGet(() => timeline.GetStartTimecode());
    diag.currentTimecode = safeGet(() => timeline.GetCurrentTimecode());
    diag.frameRate = safeGet(() => proj.GetSetting("timelineFrameRate"));
    diag.getPlayheadFrameAvailable = typeof timeline.GetPlayheadFrame === "function";
    const playheadFrame = timelineFrame(timeline, proj);
    diag.recordFrame = playheadFrame;

    if (playheadFrame === null) {
      diag.reason = "could-not-compute-playhead";
      writeDiagnostics(diag);
      emitDiag(emit, t("resolve.noPlayhead"));
      return appendToTimeline(mp, mediaItem);
    }

    const clipInfo = {
      mediaPoolItem: mediaItem,
      trackIndex: trackIndex,
      recordFrame: playheadFrame,
    };
    if (isAudio) clipInfo.mediaType = 2;
    const endInfo = clipEndFrame(mediaItem);
    if (endInfo) {
      clipInfo.startFrame = 1;
      clipInfo.endFrame = Math.round(endInfo.endFrame);
      diag.clipEnd = endInfo;
    }
    diag.clipInfo = {
      trackIndex: trackIndex,
      mediaType: clipInfo.mediaType,
      recordFrame: playheadFrame,
      startFrame: clipInfo.startFrame,
      endFrame: clipInfo.endFrame,
      mediaPoolItem: "<MediaPoolItem>",
    };

    const beforeCount = countTimelineItems(timeline);
    let results = null;
    try {
      results = mp.AppendToTimeline([clipInfo]);
    } catch (e) {
      diag.appendError = String((e && e.message) || e);
      results = null;
    }
    const afterCount = countTimelineItems(timeline);
    const returnedItems = Array.isArray(results) ? results.filter(Boolean) : [];
    const countGrew = afterCount > beforeCount;
    let verified = countGrew;
    if (returnedItems.length > 0 && typeof returnedItems[0] === "object") {
      try {
        const first = returnedItems[0];
        const start = typeof first.GetStart === "function" ? first.GetStart() : undefined;
        if (!countGrew && (start === undefined || !isFinite(parseFloat(start)))) {
          verified = false;
        }
      } catch (e) {
        verified = countGrew;
      }
    }
    diag.beforeCount = beforeCount;
    diag.afterCount = afterCount;
    diag.countGrew = countGrew;
    diag.returnedCount = returnedItems.length;
    diag.returned = returnedItems.map((item, i) => {
      let start = null;
      let track = null;
      if (item && typeof item.GetStart === "function") {
        try { start = item.GetStart(); } catch (e) {}
      }
      if (item && typeof item.GetTrackTypeAndIndex === "function") {
        try { track = item.GetTrackTypeAndIndex(); } catch (e) {}
      }
      return { i: i, start: start, track: track };
    });
    diag.verified = verified;
    writeDiagnostics(diag);

    if (verified) {
      return "playhead";
    }

    emitDiag(emit, t("resolve.playheadNoOp"));
    return appendToTimeline(mp, mediaItem);
  }

  function isResolveRunning() {
    try {
      const { pm } = resolveHandle();
      return !!pm;
    } catch (e) {
      return false;
    }
  }

  function openInResolveFolder() {
    try {
      const { resolve, pm } = resolveHandle();
      const proj = project(pm);
      const mp = proj.GetMediaPool();
      if (!mp) return false;
      const root = mp.GetRootFolder();
      if (!root) return false;
      const bin = findSubFolder(root, BIN_NAME);
      if (!bin) return false;
      if (mp.SetCurrentFolder && mp.SetCurrentFolder(bin)) return true;
      if (mp.OpenInFolder && mp.OpenInFolder(bin)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  return {
    BIN_NAME: BIN_NAME,
    ResolveError: ResolveError,
    importAndInsert: importAndInsert,
    isResolveRunning: isResolveRunning,
    openInResolveFolder: openInResolveFolder,
  };
}

// -------------------------------------------------------------------------
// Module-level bridge: pipeline.js calls resolve_api.importAndInsert(...)
// on the module, but the real implementation needs a WorkflowIntegration
// handle that only exists in the Electron main process. main.js wires one
// in with setActiveApi(createApi(WorkflowIntegration)).
// -------------------------------------------------------------------------

let activeApi = null;

function setActiveApi(api) {
  activeApi = api;
}

function importAndInsert(filePath, mode, isAudio, binName, emit) {
  if (!activeApi) {
    throw new ResolveError(t("resolve.missingModule"));
  }
  return activeApi.importAndInsert(filePath, mode, isAudio, binName, emit);
}

module.exports = {
  BIN_NAME: BIN_NAME,
  createApi,
  ResolveError,
  fpsInfo,
  timecodeToFrame,
  importAndInsert,
  setActiveApi,
};
