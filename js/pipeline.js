/* Grabtify plugin — the three-stage pipeline: fetch → encode → timeline.
 * The renderer's go() builds a JobOptions object and calls
 * window.grabtify.startJob(opts); main.js forwards it here. All
 * progress is reported through an emit(cb) function that main.js turns into
 * window.grabtify events.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const tools = require("./tools");
const resolveApi = require("./resolve_api");
const validation = require("./validation");
const i18n = require("./i18n");

function t(key, vars) {
  return i18n.t(key, vars);
}

// ----------------------------------------------------------- helpers -------

function fmtSeconds(s) {
  return String(Math.round(s * 1000) / 1000);
}

function parseTimecode(v) {
  return validation.parseTimecode(v);
}

function buildFormat(q) {
  const h = q === "best" ? "" : "[height<=?" + q + "]";
  return (
    "bv*" + h + "[ext=mp4][vcodec^=avc1]+ba[ext=m4a]" +
    "/b" + h + "[ext=mp4]" +
    "/bv*" + h + "+ba" +
    "/b" + h +
    "/b"
  );
}

function normalizeVideoUrl(u) {
  const m = /^https?:\/\/(?:www\.)?instagram\.com\/reels?\/([A-Za-z0-9_-]+)/i.exec(u);
  if (m) {
    return ["https://www.instagram.com/reel/" + m[1] + "/", u];
  }
  return [u, null];
}

function validateUrl(url) {
  return validation.validateUrl(url);
}

function friendlyHost(url) {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, "") || "the site";
  } catch (e) {
    return "the site";
  }
}

// Turn an ffmpeg -progress line into a 0-100 percentage. The progress output
// reports the encoded time either as out_time_ms (microseconds) or as
// out_time=HH:MM:SS.micro; anything else is ignored.
function encodePct(line, totalDur) {
  if (!totalDur || totalDur <= 0) return null;
  let secs = null;
  const ms = /out_time_ms=(\d+)/.exec(line);
  if (ms) {
    secs = parseFloat(ms[1]) / 1e6;
  } else {
    const t = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    if (t) {
      secs = parseFloat(t[1]) * 3600 + parseFloat(t[2]) * 60 + parseFloat(t[3]);
    }
  }
  if (secs === null || !isFinite(secs)) return null;
  return Math.min(100, (secs / totalDur) * 100);
}

// ------------------------------------------------------- progress hooks ----

function setStage(emit, name, state, sub) {
  emit({ type: "stage", stage: name, state: state, sub: sub });
}

function setProgress(emit, pct, label) {
  emit({ type: "progress", pct: pct, label: label });
}

function log(emit, line, cls) {
  emit({ type: "log", line: line, cls: cls });
}

// ------------------------------------------------------------- stage 01 ----

function locateOutput(reported, outDir, startedMs) {
  if (reported) {
    const candidates = [reported];
    if (path.extname(reported).toLowerCase() === ".part") {
      candidates.push(reported.replace(/\.[^.]+$/, ""));
    }
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }
  return tools.newestMediaFile(outDir, startedMs, true);
}

async function download(opts, cancelState, emit) {
  setStage(emit, "fetch", "active", t("job.starting"));
  setProgress(emit, null, t("job.contacting"));
  log(emit, t("job.fetchingFrom", [friendlyHost(opts.url)]), "note");

  try {
    fs.mkdirSync(opts.out_dir, { recursive: true });
  } catch (e) {
    // yt-dlp will surface a clear error if the folder really is unusable.
  }

  const yt = tools.resolveTool("yt-dlp");
  const isAudio = opts.mode === "audio";
  const format = isAudio ? "ba[ext=m4a]/ba[ext=webm]/ba/b" : buildFormat(opts.quality);
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--newline",
    "--windows-filenames",
    "--restrict-filenames",
    "-f", format,
  ];
  if (!isAudio) args.push("--merge-output-format", "mp4");
  args.push("-o", path.join(opts.out_dir, "%(title).70s [%(id)s].%(ext)s"));

  const ffmpeg = tools.resolveTool("ffmpeg");
  // ffmpegKnown: resolveTool returned a real path, not just "ffmpeg".
  if (path.basename(ffmpeg.cmd) !== ffmpeg.cmd) {
    args.push("--ffmpeg-location", path.dirname(ffmpeg.cmd));
  }

  if (opts.trim && opts.trim_method === "download") {
    const s = opts.time_in === null || opts.time_in === undefined ? "0" : fmtSeconds(opts.time_in);
    const e = opts.time_out === null || opts.time_out === undefined ? "inf" : fmtSeconds(opts.time_out);
    args.push("--download-sections", "*" + s + "-" + e, "--force-keyframes-at-cuts");
    log(emit, t("job.downloadTrim", [s, e]), "note");
  }

  args.push(opts.url);

  const startedMs = Date.now();
  let finalFromMerger = null;
  let lastDestination = null;

  const mergerRe = /\[Merger\] Merging formats into "(.+)"/;
  const destRe = /\[download\] Destination: (.+)/;
  const alreadyRe = /\[download\] (.+) has already been downloaded/;
  const pctRe = /^\[download\]\s+(\d+(?:\.\d+)?)%/;

  function onLine(line) {
    let m = mergerRe.exec(line);
    if (m) { finalFromMerger = m[1]; return; }

    m = destRe.exec(line);
    if (m) { lastDestination = m[1].trim(); return; }

    m = alreadyRe.exec(line);
    if (m) {
      lastDestination = m[1].trim();
      log(emit, t("job.alreadyDownloaded", [path.basename(lastDestination)]), "note");
      return;
    }

    m = pctRe.exec(line);
    if (m) {
      const pct = parseFloat(m[1]);
      setProgress(emit, pct, t("job.fetchingPct", [pct.toFixed(1)]));
      setStage(emit, "fetch", "active", Math.floor(pct) + "%");
      return; // don't log per-tick progress
    }

    // Keep the log to what the job is doing: everything else yt-dlp prints
    // (the echoed command, [info] chatter, warnings) is suppressed.
    if (/^ERROR/i.test(line)) log(emit, line, "err");
  }

  let code;
  try {
    code = await tools.runTool(yt.cmd, args, onLine, cancelState);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(t("job.startYtdlp", [e.message, tools.toolHint("yt-dlp")]));
    }
    throw e;
  }

  if (cancelState.cancelled) throw new tools.JobCancelled();
  if (code !== 0) {
    let msg = t("job.ytdlpExit", [code]);
    if ((opts.url || "").toLowerCase().indexOf("instagram.com") !== -1) {
      msg += t("job.instagramHint");
    }
    throw new Error(msg);
  }

  const filePath = locateOutput(finalFromMerger || lastDestination, opts.out_dir, startedMs);
  if (!filePath) {
    let listing = t("job.folderMissing");
    try {
      listing = fs.readdirSync(opts.out_dir).filter((n) => {
        try { return fs.statSync(path.join(opts.out_dir, n)).isFile(); } catch (e) { return false; }
      }).join(", ");
    } catch (e) {
      // folder missing
    }
    throw new Error(t("job.noOutput", [listing]));
  }

  setStage(emit, "fetch", "done", path.basename(filePath));
  log(emit, t("job.downloaded", [filePath]), "ok");
  return filePath;
}

// ------------------------------------------------------------- stage 02 ----

// "Encode quality" → libx264 CRF. Downloading already prefers H.264/AAC in
// MP4, so this pass runs only when the user opts in (re-encode / trim) or
// automatic mode finds an unusual codec. Automatic mode always uses the
// visually-lossless CRF 18 / AAC 192k pair.
const PRESET_CRF = { crf18: 18, crf21: 21, crf23: 23 };

async function encode(inputFile, opts, cancelState, emit) {
  setStage(emit, "encode", "active", t("job.starting"));
  setProgress(emit, 0, t("job.encodingPct", ["0"]));

  const isAudio = opts.mode === "audio";
  const ffmpeg = tools.resolveTool("ffmpeg");
  const base = inputFile.replace(/\.[^.\\/]+$/, "");
  const stem = isAudio ? base + ".mp3" : base + "-converted.mp4";
  let outFile = stem;
  let suffix = 2;
  for (;;) {
    const clash = outFile.toLowerCase() === inputFile.toLowerCase() || fs.existsSync(outFile);
    if (clash) {
      if (outFile.toLowerCase() !== inputFile.toLowerCase()) {
        try {
          fs.unlinkSync(outFile);
          break;
        } catch (e) {
          log(emit, t("job.encodeClash"), "note");
        }
      }
      outFile = isAudio
        ? base + "-" + suffix + ".mp3"
        : base + "-converted-" + suffix + ".mp4";
      suffix += 1;
    } else {
      break;
    }
  }

  const crf = opts.auto_encode
    ? PRESET_CRF.crf18
    : (PRESET_CRF[opts.preset] !== undefined ? PRESET_CRF[opts.preset] : PRESET_CRF.crf21);
  const args = ["-hide_banner", "-nostats", "-y", "-i", inputFile];

  if (opts.trim && opts.trim_method === "ffmpeg") {
    const startS = opts.time_in === null || opts.time_in === undefined ? 0 : opts.time_in;
    args.push("-ss", fmtSeconds(startS));
    if (opts.time_out !== null && opts.time_out !== undefined) {
      args.push("-t", fmtSeconds(Math.max(0.1, opts.time_out - startS)));
    }
    let note = t("job.encodeTrimStart", [fmtSeconds(startS)]);
    if (opts.time_out !== null && opts.time_out !== undefined) {
      note += t("job.encodeTrimDur", [fmtSeconds(opts.time_out - startS)]);
    }
    log(emit, note, "note");
  }

  if (isAudio) {
    const kbps = String(opts.audio_quality || "192");
    args.push(
      "-map", "a",
      "-c:a", "libmp3lame",
      "-b:a", kbps + "k",
      "-f", "mp3",
      "-progress", "pipe:1",
      outFile
    );
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(crf),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", opts.auto_encode ? "192k" : "160k",
      "-movflags", "+faststart",
      "-f", "mp4",
      "-progress", "pipe:1",
      outFile
    );
  }

  log(emit, isAudio
    ? t("job.encodingAudio", [path.basename(outFile), String(opts.audio_quality || "192")])
    : t("job.encodingVideo", [path.basename(outFile), crf]), "note");

  // ffprobe gives us the source duration so ffmpeg's progress output can be
  // shown as a real percentage; if it fails we fall back to an indeterminate
  // bar. ffmpeg's default stats block uses \r overwrites (no newlines), so we
  // read newline-terminated -progress pipe:1 lines from stdout instead.
  const totalDur = tools.mediaDuration(inputFile);
  if (!totalDur) setProgress(emit, null, t("job.encoding"));

  function onLine(line) {
    if (/^progress=end/.test(line)) {
      setProgress(emit, 100, t("job.encodingPct", ["100"]));
      setStage(emit, "encode", "active", "100%");
      return;
    }
    const pct = encodePct(line, totalDur);
    if (pct !== null) {
      setProgress(emit, pct, t("job.encodingPct", [pct.toFixed(1)]));
      setStage(emit, "encode", "active", Math.floor(pct) + "%");
      return;
    }
    if (/error/i.test(line)) log(emit, line, "err");
  }

  let code;
  try {
    code = await tools.runTool(ffmpeg.cmd, args, onLine, cancelState);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(t("job.startFfmpeg", [e.message, tools.toolHint("ffmpeg")]));
    }
    throw e;
  }

  if (cancelState.cancelled) throw new tools.JobCancelled();

  if (code !== 0 || !fs.existsSync(outFile)) {
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch (e) {}
    if (opts.trim && opts.trim_method === "download") {
      try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile); } catch (e) {}
    }
    if (opts.trim) {
      throw new Error(t("job.timestamps"));
    }
    throw new Error(t("job.ffmpegExit", [code]));
  }

  setStage(emit, "encode", "done", path.basename(outFile));
  log(emit, t("job.encoded", [outFile]), "ok");

  // Only the final video is kept — the raw download goes.
  try {
    fs.unlinkSync(inputFile);
    log(emit, t("job.removedRaw"), "note");
  } catch (e) {
    log(emit, t("job.couldNotRemove", [e.message]), "note");
  }
  return outFile;
}

// ------------------------------------------------------------- stage 03 ----

function sendToResolve(filePath, mode, isAudio, cancelState, emit) {
  setStage(emit, "timeline", "active", t("job.importing"));
  setProgress(emit, null, t("job.handoff"));

  if (cancelState.cancelled) throw new tools.JobCancelled();

  const detail = resolveApi.importAndInsert(filePath, mode, isAudio, undefined, emit);
  setStage(emit, "timeline", "done", "done");
  return detail;
}

// ----------------------------------------------------------- top-level ----

function makeCancelState() {
  return { cancelled: false, child: null };
}

function successMessage(detail, bin) {
  switch (detail) {
    case "playhead": return t("job.donePlayhead");
    case "append": return t("job.doneAppend");
    case "bin-noseq": return t("job.doneBinNoseq");
    case "bin":
    default: return t("job.doneBin", [bin]);
  }
}

// Decides whether the encode stage runs for a job. Manual opt-in via the
// "Encode to MP4" checkbox (opts.convert), audio mode (MP3 is the encode), a
// frame-accurate "During encode" trim, or automatic mode when the download
// isn't already Resolve-friendly (isReady = tools.isResolveReady result).
function shouldEncode(opts, isReady) {
  if (opts.mode === "audio") return true;
  if (opts.convert === true) return true;
  if (opts.trim && opts.trim_method === "ffmpeg") return true;
  if (opts.auto_encode && !isReady) return true;
  return false;
}

function runJob(opts, emit, cancelState) {
  cancelState = cancelState || makeCancelState();
  const BIN = resolveApi.BIN_NAME;

  return Promise.resolve()
    .then(() => download(opts, cancelState, emit))
    .then((rawFile) => {
      const isAudio = opts.mode === "audio";
      const afterMedia = (finalFile) => sendToResolve(finalFile, opts.insert_mode, isAudio, cancelState, emit);
      const isReady = isAudio ? false : tools.isResolveReady(rawFile);
      if (shouldEncode(opts, isReady)) {
        return encode(rawFile, opts, cancelState, emit).then(afterMedia);
      }
      return afterMedia(rawFile);
    })
    .then((detail) => {
      return successMessage(detail, BIN);
    });
}

module.exports = {
  fmtSeconds,
  parseTimecode,
  buildFormat,
  normalizeVideoUrl,
  validateUrl,
  friendlyHost,
  encodePct,
  shouldEncode,
  download,
  encode,
  sendToResolve,
  runJob,
  makeCancelState,
  JobCancelled: tools.JobCancelled,
};
