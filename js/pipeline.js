/* Grabtify plugin — the three-stage pipeline: fetch → encode → timeline.
 * The renderer's go() builds a JobOptions object and calls
 * window.grabtify.startJob(opts); main.js forwards it here. All
 * progress is reported through an emit(cb) function that main.js turns into
 * window.grabtify events.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
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

// Concise mode only logs milestones and errors; verbose mode also forwards the
// raw tool chatter and internal steps. Every stage picks its wording itself.
function isVerbose(opts) {
  return !!(opts && opts.verbose_log);
}

// Emits a line only when the verbose log is enabled.
function logVerbose(emit, opts, line, cls) {
  if (isVerbose(opts)) log(emit, line, cls);
}

// Paths are noise in concise mode: show the file name unless verbosity is on.
function fileName(p, opts) {
  return isVerbose(opts) ? p : path.basename(p || "");
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

  // YouTube now requires a JS runtime to solve its download challenges;
  // without one some formats fail with HTTP 403. yt-dlp finds deno on PATH
  // or next to yt-dlp.exe — when we have a real copy, point to it directly.
  const deno = tools.resolveTool("deno");
  if (deno.cmd && fs.existsSync(deno.cmd)) {
    args.push("--js-runtimes", "deno:" + deno.cmd);
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
    // (the echoed command, [info] chatter, warnings) is suppressed. Verbose
    // mode also forwards the raw ERROR lines.
    if (/^ERROR/i.test(line)) logVerbose(emit, opts, line, "err");
  }

  let code;
  try {
    code = await tools.runTool(yt.cmd, args, onLine, cancelState);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(isVerbose(opts)
        ? t("job.startYtdlp", [e.message, tools.toolHint("yt-dlp")])
        : t("job.toolMissing"));
    }
    throw e;
  }

  if (cancelState.cancelled) throw new tools.JobCancelled();
  if (code !== 0) {
    let msg = isVerbose(opts) ? t("job.ytdlpExit", [code]) : t("job.downloadFailed");
    if (isVerbose(opts) && (opts.url || "").toLowerCase().indexOf("instagram.com") !== -1) {
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

  let finalFile = filePath;
  if (opts.trim && opts.trim_method === "download") {
    finalFile = await cutLocal(filePath, opts, cancelState, emit);
  }

  setStage(emit, "fetch", "done", path.basename(finalFile));
  log(emit, t("job.downloaded", [fileName(finalFile, opts)]), "ok");
  return finalFile;
}

// The "download" trim method used to hand --download-sections to yt-dlp, which
// for DASH sources makes ffmpeg re-open the signed media URL — that 403s on
// long videos (expired signature). Instead we download the whole file (yt-dlp
// handles headers/signing correctly) and cut it locally with a fast stream
// copy, which never touches the remote URL and works for any length.
async function cutLocal(inputFile, opts, cancelState, emit) {
  const startS = opts.time_in === null || opts.time_in === undefined ? 0 : opts.time_in;
  const endS = opts.time_out === null || opts.time_out === undefined ? null : opts.time_out;

  const base = inputFile.replace(/\.[^.\\/]+$/, "");
  const ext = path.extname(inputFile);
  let cutFile = base + "-cut" + ext;
  let suffix = 2;
  for (;;) {
    const clash = cutFile.toLowerCase() === inputFile.toLowerCase() || fs.existsSync(cutFile);
    if (clash) {
      cutFile = base + "-cut-" + suffix + ext;
      suffix += 1;
    } else {
      break;
    }
  }

  const s = fmtSeconds(Math.max(0, startS));
  const e = endS === null ? t("job.cutToEnd") : fmtSeconds(endS);
  const args = ["-hide_banner", "-nostats", "-y"];
  if (startS > 0) args.push("-ss", s);
  args.push("-i", inputFile);
  if (endS !== null) args.push("-t", fmtSeconds(Math.max(0.1, endS - startS)));
  args.push("-c", "copy", "-avoid_negative_ts", "make_zero", cutFile);

  setStage(emit, "cut", "active", t("job.cutting"));
  setProgress(emit, null, t("job.cutting"));
  log(emit, isVerbose(opts)
    ? t("job.downloadTrim", [s, e])
    : t("job.trimmingTo", [s, e]), "note");

  const totalDur = tools.mediaDuration(inputFile);
  const span = (endS !== null ? endS : totalDur) - startS;

  function onLine(line) {
    if (/^progress=end/.test(line)) {
      setProgress(emit, 100, t("job.cuttingPct", ["100"]));
      return;
    }
    let secs = null;
    const ms = /out_time_ms=(\d+)/.exec(line);
    if (ms) secs = parseFloat(ms[1]) / 1e6;
    else {
      const t2 = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
      if (t2) secs = parseFloat(t2[1]) * 3600 + parseFloat(t2[2]) * 60 + parseFloat(t2[3]);
    }
    if (secs === null || !isFinite(secs) || !span || span <= 0) return;
    const pct = Math.min(100, Math.max(0, ((secs - startS) / span) * 100));
    setProgress(emit, pct, t("job.cuttingPct", [pct.toFixed(1)]));
    setStage(emit, "cut", "active", Math.floor(pct) + "%");
    if (/error/i.test(line)) logVerbose(emit, opts, line, "err");
  }

  const ffmpeg = tools.resolveTool("ffmpeg");
  let code;
  try {
    code = await tools.runTool(ffmpeg.cmd, args, onLine, cancelState);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(isVerbose(opts)
        ? t("job.startFfmpeg", [e.message, tools.toolHint("ffmpeg")])
        : t("job.toolMissing"));
    }
    throw e;
  }

  if (cancelState.cancelled) throw new tools.JobCancelled();

  if (code !== 0 || !fs.existsSync(cutFile)) {
    try { if (fs.existsSync(cutFile)) fs.unlinkSync(cutFile); } catch (e) {}
    throw new Error(t("job.timestamps"));
  }

  setStage(emit, "cut", "done", path.basename(cutFile));
  log(emit, t("job.cutDone", [fileName(cutFile, opts)]), "ok");

  try {
    fs.unlinkSync(inputFile);
    logVerbose(emit, opts, t("job.removedRaw"), "note");
  } catch (e) {
    logVerbose(emit, opts, t("job.couldNotRemove", [e.message]), "note");
  }
  return cutFile;
}

// ------------------------------------------------------------- stage 02 ----

// "Encode quality" → libx264 CRF. Downloading already prefers H.264/AAC in
// MP4, so this pass runs only when the user opts in (re-encode / trim) or
// automatic mode finds an unusual codec. Automatic mode always uses the
// visually-lossless CRF 18 / AAC 192k pair.
const PRESET_CRF = { crf18: 18, crf21: 21, crf23: 23 };

// Experimental effects map to ffmpeg filter chains. A descriptor is either
// null (no effect), { vf } for a plain -vf chain, or { filterComplex,
// outLabel, ... } for a graph (which needs explicit -map). "mosh" needs the
// two-pass Xvid pre-pass first (see datamoshPrep) and builds its graph on the
// intermediate ([1:v]) while audio stays on the original input ([0]).
function effectArgs(effect, hasAudio) {
  switch (effect) {
    case "off":
    case null:
    case undefined:
    case "":
      return null;
    case "smear":
      return {
        filterComplex:
          "[0:v]split[a][b];" +
          "[a]setpts=PTS+0.2/TB[l];" +
          "[b][l]blend=all_mode=difference:all_opacity=0.5[d];" +
          "[b][d]blend=all_mode=screen[out]",
        outLabel: "[out]",
      };
    case "mosh":
      return {
        prep: "mosh",
        filterComplex:
          "[1:v]split[a][b];" +
          "[a]setpts=PTS+0.35/TB[l];" +
          "[b][l]blend=all_mode=difference:all_opacity=0.7[d];" +
          "[b][d]blend=all_mode=screen[m];" +
          "[m]tmix=frames=4[out]",
        outLabel: "[out]",
        longGop: true,
      };
    case "glitch":
      return {
        vf: "rgbashift=rh=6:bh=-6:edge=smear,noise=alls=9:allf=t,eq=saturation=1.15",
      };
    case "vhs":
      if (hasAudio) {
        return {
          filterComplex:
            "[0:v]rgbashift=rh=3:bh=-3," +
            "crop=in_w-4:in_h:2+2*sin(2*PI*0.6*t):0," +
            "noise=alls=8:allf=t,vignette=PI/5," +
            "eq=saturation=0.92:contrast=1.05,scale=-2:480[out];" +
            "[0:a]highpass=f=100,lowpass=f=2800," +
            "aresample=22050,aresample=48000," +
            "acompressor=threshold=0.3:ratio=3[a];" +
            "[1:a]volume=0.5[n];" +
            "[a][n]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[m];" +
            "[m]alimiter=limit=0.95[amix]",
          outLabel: "[out]",
          mapAudio: "[amix]",
          extraLavfi: true,
          shortest: true,
        };
      }
      return {
        vf: "rgbashift=rh=3:bh=-3," +
            "crop=in_w-4:in_h:2+2*sin(2*PI*0.6*t):0," +
            "noise=alls=8:allf=t,vignette=PI/5," +
            "eq=saturation=0.92:contrast=1.05,scale=-2:480",
      };
    case "pixel":
      if (hasAudio) {
        return {
          filterComplex:
            "[0:v]scale=-2:144:flags=neighbor,scale=-2:720:flags=neighbor[out];" +
            "[0:a]aformat=channel_layouts=mono,aresample=11025,aresample=48000[amix]",
          outLabel: "[out]",
          mapAudio: "[amix]",
        };
      }
      return { vf: "scale=-2:144:flags=neighbor,scale=-2:720:flags=neighbor" };
    case "tiny240":
      if (hasAudio) {
        return {
          filterComplex:
            "[0:v]scale=-2:240[out];" +
            "[0:a]aformat=channel_layouts=mono,aresample=8000," +
            "lowpass=f=2600,highpass=f=300,aresample=48000[amix]",
          outLabel: "[out]",
          mapAudio: "[amix]",
        };
      }
      return { vf: "scale=-2:240" };
    case "poster":
      return {
        filterComplex:
          "[0:v]split[a][b];" +
          "[a]palettegen=max_colors=8:reserve_transparent=0[p];" +
          "[b][p]paletteuse=dither=bayer:bayer_scale=5[out]",
        outLabel: "[out]",
      };
    case "noir":
      return { vf: "hue=s=0,noise=alls=12:allf=t,eq=contrast=1.35" };
    case "crt":
      return {
        vf: "scale=-2:480," +
            "geq=lum='if(lt(mod(Y,4),2),lum(X,Y)*0.78,lum(X,Y))'," +
            "noise=alls=5:allf=t,vignette=PI/5",
      };
    case "trail":
      return { vf: "tmix=frames=12" };
    default:
      return null;
  }
}

// Video encoder selection: CPU (libx264, CRF) vs NVIDIA (h264_nvenc, CQ VBR).
// The longGop variant (datamosh) needs wide keyframe spacing; sc_threshold/bf
// are libx264-only options that NVENC rejects, so they only appear on CPU.
function videoEncoderArgs(gpuOn, crf, longGop) {
  const a = gpuOn
    ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr",
       "-cq", String(crf), "-b:v", "0", "-pix_fmt", "yuv420p"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p"];
  if (longGop) {
    a.push("-g", "9999");
    if (!gpuOn) a.push("-sc_threshold", "0", "-bf", "0");
  }
  return a;
}

// Experimental audio effects map to ffmpeg -af chains. They run in both video
// (MP4) and audio (MP3) modes; a null/off value means "no audio processing".
function audioEffectArgs(effect) {
  switch (effect) {
    case "off":
    case null:
    case undefined:
    case "":
      return null;
    case "echo":
      return "aecho=0.8:0.9:1000:0.3";
    case "reverb":
      return "aecho=0.8:0.88:60:0.4,aecho=0.8:0.7:180:0.3";
    case "radio":
      return "highpass=f=300,lowpass=f=3400,acompressor=threshold=0.2:ratio=4";
    case "nightcore":
      return "asetrate=44100*1.15,aresample=44100";
    case "deep":
      return "asetrate=44100*0.85,aresample=44100";
    case "bass":
      return "bass=g=6:f=100";
    case "tremolo":
      return "tremolo=f=5:d=0.7";
    case "crush":
      return "acrusher=level_in=1:level_out=1:bits=8:mode=log:aa=1";
    case "reverse":
      return "areverse";
    default:
      return null;
  }
}

// Wraps tools.runTool with the standard ffmpeg ENOENT handling. The mosh
// pre-pass produces no progress output, so onLine is a no-op.
async function runFfmpeg(ffmpeg, args, cancelState, opts) {
  try {
    return await tools.runTool(ffmpeg.cmd, args, function () {}, cancelState);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(isVerbose(opts)
        ? t("job.startFfmpeg", [e.message, tools.toolHint("ffmpeg")])
        : t("job.toolMissing"));
    }
    throw e;
  }
}

// First half of the two-pass datamosh ("mosh"): re-encode the clip as
// MPEG-4/Xvid with a huge GOP, few B-frames and no scene-cut keyframes. That
// pushes every frame onto one long prediction chain and adds generational
// loss, so the blend/tmix graph in effectArgs("mosh") has real artifacts to
// chew on. The trimmed range is honoured here (the second pass filters the
// intermediate, not the original input).
async function datamoshPrep(inputFile, opts, cancelState, emit) {
  logVerbose(emit, opts, t("job.moshPrep"), "note");
  const ffmpeg = tools.resolveTool("ffmpeg");
  const tag = "grabtify-mosh-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const avi = path.join(os.tmpdir(), tag + ".avi");

  const pre = ["-y", "-hide_banner", "-nostats"];
  if (opts.trim && opts.trim_method === "ffmpeg") {
    const startS = opts.time_in === null || opts.time_in === undefined ? 0 : opts.time_in;
    pre.push("-ss", fmtSeconds(startS));
    if (opts.time_out !== null && opts.time_out !== undefined) {
      pre.push("-t", fmtSeconds(Math.max(0.1, opts.time_out - startS)));
    }
  }
  const args = pre.concat([
    "-i", inputFile,
    "-map", "0:v:0",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-an",
    "-c:v", "mpeg4", "-vtag", "xvid",
    "-qscale:v", "4",
    "-g", "9999", "-bf", "0", "-sc_threshold", "0",
    avi,
  ]);

  const code = await runFfmpeg(ffmpeg, args, cancelState, opts);
  if (cancelState.cancelled) throw new tools.JobCancelled();
  if (code !== 0 || !fs.existsSync(avi)) {
    try { if (fs.existsSync(avi)) fs.unlinkSync(avi); } catch (e) {}
    throw new Error(t("job.ffmpegExit", [code]));
  }
  return avi;
}

// Pick a unique output path for the encode stage. A timestamp is baked into
// the name so every job produces a distinct file: Resolve's media pool caches
// a file's analysis by path, so reusing the same path on a later run would
// import the OLD pool item (stale audio/video) instead of re-scanning the
// overwritten file. Collisions (two jobs in the same second) fall back to a
// numeric suffix.
function pickOutFile(base, isAudio, now, exists) {
  const ts = new Date(now === undefined ? Date.now() : now);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
    "-" + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
  const ext = isAudio ? ".mp3" : ".mp4";
  const stem = isAudio ? base + "-" + stamp : base + "-converted-" + stamp;
  const existsFn = typeof exists === "function" ? exists : fs.existsSync;
  let outFile = stem + ext;
  let suffix = 2;
  while (existsFn(outFile)) {
    outFile = stem + "-" + suffix + ext;
    suffix += 1;
  }
  return outFile;
}

async function encode(inputFile, opts, cancelState, emit) {
  setStage(emit, "encode", "active", t("job.starting"));
  setProgress(emit, 0, t("job.encodingPct", ["0"]));

  const isAudio = opts.mode === "audio";
  const ffmpeg = tools.resolveTool("ffmpeg");
  const base = inputFile.replace(/\.[^.\\/]+$/, "");
  const outFile = pickOutFile(base, isAudio);

  const crf = opts.auto_encode
    ? PRESET_CRF.crf18
    : (PRESET_CRF[opts.preset] !== undefined ? PRESET_CRF[opts.preset] : PRESET_CRF.crf21);

  const hasAudio = tools.mediaHasAudio(inputFile);
  const efx = isAudio ? null : effectArgs(opts.effect, hasAudio);
  const afx = audioEffectArgs(opts.audio_effect);
  const tempFiles = [];

  // Extra inputs resolved once (datamosh intermediate, lavfi noise source);
  // the argument list is rebuilt per encode attempt so a GPU failure can
  // retry the exact same command with the CPU encoder.
  const extraInputs = [];
  if (efx && efx.prep === "mosh") {
    const avi = await datamoshPrep(inputFile, opts, cancelState, emit);
    tempFiles.push(avi);
    extraInputs.push("-i", avi);
  }
  if (efx && efx.extraLavfi) {
    const dur = tools.mediaDuration(inputFile) || 30;
    extraInputs.push("-f", "lavfi", "-i",
      "anoisesrc=color=pink:amplitude=0.05:sample_rate=44100:duration=" + dur);
  }

  if (opts.trim && opts.trim_method === "ffmpeg" && !(efx && efx.prep === "mosh")) {
    const startS = opts.time_in === null || opts.time_in === undefined ? 0 : opts.time_in;
    let note = t("job.encodeTrimStart", [fmtSeconds(startS)]);
    if (opts.time_out !== null && opts.time_out !== undefined) {
      note += t("job.encodeTrimDur", [fmtSeconds(opts.time_out - startS)]);
    }
    logVerbose(emit, opts, note, "note");
  }

  // Assembles the full ffmpeg command. gpuOn swaps the software x264 encoder
  // for the NVIDIA hardware one; both keep the same CRF-like quality target.
  function buildArgs(gpuOn) {
    const a = ["-hide_banner", "-nostats", "-y", "-i", inputFile].concat(extraInputs);

    if (opts.trim && opts.trim_method === "ffmpeg" && !(efx && efx.prep === "mosh")) {
      const startS = opts.time_in === null || opts.time_in === undefined ? 0 : opts.time_in;
      a.push("-ss", fmtSeconds(startS));
      if (opts.time_out !== null && opts.time_out !== undefined) {
        a.push("-t", fmtSeconds(Math.max(0.1, opts.time_out - startS)));
      }
    }

    if (isAudio) {
      const kbps = String(opts.audio_quality || "192");
      a.push(
        "-map", "a",
        "-c:a", "libmp3lame",
        "-b:a", kbps + "k"
      );
      if (afx) a.push("-af", afx);
      a.push(
        "-f", "mp3",
        "-progress", "pipe:1",
        outFile
      );
    } else {
      if (efx) {
        if (efx.filterComplex) {
          let fc = efx.filterComplex;
          let mapA = efx.mapAudio || "0:a?";
          if (afx) {
            if (efx.mapAudio) {
              // Chain the audio effect onto the effect's own mixed audio output
              // inside the graph (e.g. VHS/pixel/tiny240) instead of mixing -af
              // with a complex filter graph.
              fc = fc + ";" + efx.mapAudio + afx + "[aout]";
              mapA = "[aout]";
            } else {
              a.push("-af", afx);
            }
          }
          a.push("-filter_complex", fc);
          a.push("-map", efx.outLabel);
          a.push("-map", mapA);
        } else {
          a.push("-vf", efx.vf);
          if (afx) a.push("-af", afx);
        }
        if (efx.shortest) a.push("-shortest");
      } else if (afx) {
        a.push("-af", afx);
      }
      if (gpuOn) {
        a.push.apply(a, videoEncoderArgs(true, crf, !!(efx && efx.longGop)));
      } else {
        a.push.apply(a, videoEncoderArgs(false, crf, !!(efx && efx.longGop)));
      }
      a.push(
        "-c:a", "aac",
        "-b:a", opts.auto_encode ? "192k" : "160k",
        "-movflags", "+faststart",
        "-f", "mp4",
        "-progress", "pipe:1",
        outFile
      );
    }
    return a;
  }

  log(emit, isAudio
    ? (isVerbose(opts)
        ? t("job.encodingAudio", [path.basename(outFile), String(opts.audio_quality || "192")])
        : t("job.convertingAudio"))
    : (isVerbose(opts)
        ? t("job.encodingVideo", [path.basename(outFile), crf])
        : t("job.convertingVideo")), "note");

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
    if (/error/i.test(line)) logVerbose(emit, opts, line, "err");
  }

  let code;
  // NVIDIA hardware encode is the fast path; if it ever fails at runtime
  // (driver hiccup, GPU in use) we transparently retry once on the CPU so the
  // job never dies over the hardware encoder.
  const gpuWanted = !!opts.gpu_encode && !isAudio;
  const attempts = gpuWanted ? [true, false] : [false];
  for (const useGpu of attempts) {
    if (useGpu) logVerbose(emit, opts, t("job.usingGpu"), "note");
    const args = buildArgs(useGpu);
    try {
      code = await tools.runTool(ffmpeg.cmd, args, onLine, cancelState);
    } catch (e) {
      if (e && e.code === "ENOENT") {
        throw new Error(isVerbose(opts)
          ? t("job.startFfmpeg", [e.message, tools.toolHint("ffmpeg")])
          : t("job.toolMissing"));
      }
      throw e;
    }
    if (code === 0 || cancelState.cancelled) break;
    if (useGpu) {
      log(emit, isVerbose(opts) ? t("job.usingGpuFallback") : t("job.gpuFallback"), "note");
      continue;
    }
    break;
  }

  if (cancelState.cancelled) throw new tools.JobCancelled();

  if (code !== 0 || !fs.existsSync(outFile)) {
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch (e) {}
    for (const tmp of tempFiles) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e) {}
    }
    if (opts.trim && opts.trim_method === "download") {
      try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile); } catch (e) {}
    }
    if (opts.trim) {
      throw new Error(t("job.timestamps"));
    }
    throw new Error(isVerbose(opts) ? t("job.ffmpegExit", [code]) : t("job.encodeFailed"));
  }

  setStage(emit, "encode", "done", path.basename(outFile));
  logVerbose(emit, opts, t("job.encoded", [outFile]), "ok");

  for (const tmp of tempFiles) {
    try { fs.unlinkSync(tmp); logVerbose(emit, opts, t("job.removedRaw"), "note"); } catch (e) {}
  }

  // Only the final video is kept — the raw download goes.
  try {
    fs.unlinkSync(inputFile);
    logVerbose(emit, opts, t("job.removedRaw"), "note");
  } catch (e) {
    logVerbose(emit, opts, t("job.couldNotRemove", [e.message]), "note");
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
  if (opts.effect && opts.effect !== "off") return true;
  if (opts.audio_effect && opts.audio_effect !== "off") return true;
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
      const afterMedia = (finalFile) => {
        // Concise mode keeps paths out of the running log; the single full
        // path is the "Saved to:" line before the handoff to Resolve.
        if (!isVerbose(opts)) log(emit, t("job.savedTo", [finalFile]), "ok");
        return sendToResolve(finalFile, opts.insert_mode, isAudio, cancelState, emit);
      };
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
  effectArgs,
  audioEffectArgs,
  videoEncoderArgs,
  datamoshPrep,
  pickOutFile,
  download,
  encode,
  sendToResolve,
  runJob,
  makeCancelState,
  JobCancelled: tools.JobCancelled,
};
