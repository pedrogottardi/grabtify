/* Grabtify plugin — tool resolution + child-process helpers.
 * Tools are bundled under bin/win/ (or bin/mac/), else resolved on PATH.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const i18n = require("./i18n");

function t(key, vars) {
  return i18n.t(key, vars);
}

const IS_WIN = process.platform === "win32";

const EXTRA_DIRS = IS_WIN
  ? []
  : [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/opt/local/bin",
      path.join(os.homedir(), ".local", "bin"),
      path.join(os.homedir(), "bin"),
    ];

function pluginRoot() {
  return path.join(__dirname, "..");
}

function binDir() {
  return path.join(pluginRoot(), "bin", IS_WIN ? "win" : "mac");
}

function exe(base) {
  return base + (IS_WIN ? ".exe" : "");
}

function resolveTool(base) {
  const name = exe(base);
  const plat = path.join(binDir(), name);
  if (fs.existsSync(plat)) {
    return { cmd: plat, bundled: true, label: "Bundled" };
  }
  const flat = path.join(pluginRoot(), "bin", name);
  if (fs.existsSync(flat)) {
    return { cmd: flat, bundled: true, label: "Bundled" };
  }
  for (const d of EXTRA_DIRS) {
    const cand = path.join(d, name);
    if (fs.existsSync(cand)) {
      return { cmd: cand, bundled: false, label: "Installed" };
    }
  }
  return { cmd: name, bundled: false, label: "On PATH" };
}

function toolHint(base) {
  if (IS_WIN) {
    return t("tools.hintWin", [exe(base)]);
  }
  return t("tools.hintMac", [base]);
}

function toolVersionArgs(base) {
  return base === "ffmpeg" ? ["-version"] : ["--version"];
}

function checkTool(base) {
  const tool = resolveTool(base);
  try {
    const out = spawnSync(tool.cmd, toolVersionArgs(base), {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 15000,
    });
    const text = (out.stdout || out.stderr || "").toString().split(/\r?\n/)[0] || "";
    const ok = out.status === 0;
    return { ok: ok, version: ok ? text : "", err: ok ? "" : text || t("tools.failed") };
  } catch (e) {
    return { ok: false, version: "", err: String(e && e.message ? e.message : e) };
  }
}

function quickCheckAll() {
  const names = ["yt-dlp", "ffmpeg", "deno"];
  const result = {};
  for (const n of names) result[n] = checkTool(n);
  return result;
}

function mediaDuration(filePath) {
  const ffprobe = resolveTool("ffprobe");
  try {
    const out = spawnSync(
      ffprobe.cmd,
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf-8", windowsHide: true, timeout: 15000 }
    );
    const dur = parseFloat((out.stdout || "").trim());
    return isNaN(dur) || dur <= 0 ? null : dur;
  } catch (e) {
    return null;
  }
}

// Detects whether the machine can hardware-encode with NVIDIA NVENC. The GPU
// must actually be present (nvidia-smi reports it) AND the bundled ffmpeg must
// ship the h264_nvenc encoder. Never throws; slow paths get short timeouts.
function detectGpu() {
  let label = "";
  try {
    const out = spawnSync("nvidia-smi", ["-L"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 8000,
    });
    if (out.status === 0) {
      const text = (out.stdout || "").trim();
      const m = /GPU \d+: (.+?) \(UUID:/.exec(text);
      if (m) label = m[1].trim();
    }
  } catch (e) {
    // no nvidia-smi on PATH — no NVIDIA GPU
  }

  let encoder = "";
  try {
    const ffmpeg = resolveTool("ffmpeg");
    const out = spawnSync(ffmpeg.cmd, ["-hide_banner", "-encoders"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 15000,
    });
    const text = (out.stdout || "") + (out.stderr || "");
    if (/\bh264_nvenc\b/.test(text)) encoder = "h264_nvenc";
  } catch (e) {
    // ffmpeg unavailable — GPU path can't run
  }

  const available = !!label && !!encoder;
  return { available: available, label: label, encoder: encoder };
}

// True when the file has at least one audio stream. Used by the VHS effect,
// which only wires the lo-fi audio filters when there is something to filter.
function mediaHasAudio(filePath) {
  const ffprobe = resolveTool("ffprobe");
  try {
    const out = spawnSync(
      ffprobe.cmd,
      [
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf-8", windowsHide: true, timeout: 15000 }
    );
    return /^\d/.test((out.stdout || "").trim());
  } catch (e) {
    return false;
  }
}

// True when the file can go straight into a Resolve timeline: H.264 video with
// AAC/MP3 audio (the codecs yt-dlp prefers for MP4). VP9/AV1/HEVC and odd
// audio codecs come back false so automatic encoding can normalize them. A
// probe failure is treated as "not ready" so we attempt the safe encode.
function isResolveReady(filePath) {
  const ffprobe = resolveTool("ffprobe");
  let out;
  try {
    out = spawnSync(
      ffprobe.cmd,
      [
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name",
        "-of", "default=noprint_wrappers=1",
        filePath,
      ],
      { encoding: "utf-8", windowsHide: true, timeout: 15000 }
    );
  } catch (e) {
    return false;
  }
  const text = (out.stdout || "").trim();
  if (!text) return false;

  let video = null;
  let audio = null;
  let type = null;
  for (const tok of text.split(/[ \t]/)) {
    if (tok === "") continue;
    if (tok === "codec_type=video") { type = "video"; continue; }
    if (tok === "codec_type=audio") { type = "audio"; continue; }
    const m = /^codec_name=(.+)$/.exec(tok);
    if (!m) continue;
    if (type === "video" && video === null) video = m[1];
    else if (type === "audio" && audio === null) audio = m[1];
  }
  if (video !== "h264") return false;
  if (audio !== null && audio !== "aac" && audio !== "mp3") return false;
  return true;
}

class JobCancelled extends Error {
  constructor(message) {
    super(message || "Cancelled.");
    this.name = "JobCancelled";
  }
}

function lineReader(stream, sink, onLine) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      sink.push(line);
      try {
        onLine(line);
      } catch (e) {
        // A misbehaving callback must not kill the stream loop.
      }
    }
  });
  stream.on("end", () => {
    if (buf) {
      sink.push(buf);
      try {
        onLine(buf);
      } catch (e) {
        // ignore
      }
    }
  });
}

function killTree(proc) {
  if (IS_WIN) {
    try {
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        windowsHide: true,
      });
    } catch (e) {
      // ignore
    }
  } else {
    try {
      proc.kill("SIGKILL");
    } catch (e) {
      // ignore
    }
  }
}

function runTool(cmd, args, onLine, cancelState, logCmd) {
  if (logCmd === undefined) logCmd = true;
  args = args || [];
  if (logCmd) onLine("$ " + cmd + " " + args.join(" "));

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const wrapped = new Error(t("tools.couldNotStart", [cmd, e.message]));
      wrapped.code = e.code || "ENOENT";
      reject(wrapped);
      return;
    }

    cancelState.child = proc;
    const outBuf = [];
    const errBuf = [];
    lineReader(proc.stdout, outBuf, onLine);
    lineReader(proc.stderr, errBuf, onLine);

    const poll = setInterval(() => {
      if (cancelState.cancelled && proc.exitCode === null) {
        killTree(proc);
      }
    }, 150);

    proc.on("error", (err) => {
      clearInterval(poll);
      cancelState.child = null;
      const wrapped = new Error(t("tools.couldNotStart", [cmd, err.message]));
      wrapped.code = err.code;
      reject(wrapped);
    });

    proc.on("close", (code) => {
      clearInterval(poll);
      cancelState.child = null;
      if (cancelState.cancelled) {
        reject(new JobCancelled("Cancelled."));
      } else {
        resolve(code == null ? 0 : code);
      }
    });
  });
}

function cancel(cancelState) {
  cancelState.cancelled = true;
  const proc = cancelState.child;
  if (proc && proc.exitCode === null) {
    killTree(proc);
  }
}

// Runs a tool and captures all output, killing the process tree after
// timeoutMs. Never blocks the main process (unlike spawnSync).
function runToolCapture(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const wrapped = new Error(t("tools.couldNotStart", [cmd, e.message]));
      wrapped.code = e.code || "ENOENT";
      reject(wrapped);
      return;
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });

    const timer = setTimeout(() => killTree(proc), timeoutMs || 10000);

    proc.on("error", (err) => {
      clearTimeout(timer);
      const wrapped = new Error(t("tools.couldNotStart", [cmd, err.message]));
      wrapped.code = err.code;
      reject(wrapped);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 0 : code, stdout: stdout, stderr: stderr });
    });
  });
}

// Lightweight single-video metadata query used to show the pasted video's
// title in the panel. The trailing "--" stops yt-dlp from reading anything
// after the URL as an option.
function titleArgs(url) {
  return [
    "--ignore-config",
    "--no-playlist",
    "--skip-download",
    "--no-warnings",
    "--print", "title",
    "--", url,
  ];
}

async function fetchTitle(url) {
  const tool = resolveTool("yt-dlp");
  try {
    const res = await runToolCapture(tool.cmd, titleArgs(url), 8000);
    if (res.code !== 0) {
      return {
        ok: false,
        err: (res.stderr || res.stdout || "").split(/\r?\n/)[0] || t("tools.ytdlpFailed"),
      };
    }
    const title = (res.stdout || "").split(/\r?\n/)[0].trim();
    if (!title) return { ok: false, err: t("tools.noTitle") };
    return { ok: true, title: title };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e) };
  }
}

const MEDIA_SUFFIXES = new Set([
  ".mp4", ".mkv", ".webm", ".mov", ".m4v", ".3gp", ".flv", ".ts", ".m4a",
  ".mp3", ".opus",
]);

function newestMediaFile(directory, sinceMs, allowExisting) {
  if (!fs.existsSync(directory)) return null;
  let best = null; // [mtime, absPath]
  let entries = [];
  try {
    entries = fs.readdirSync(directory);
  } catch (e) {
    return null;
  }
  for (const entry of entries) {
    const p = path.join(directory, entry);
    let st;
    try {
      st = fs.statSync(p);
    } catch (e) {
      continue;
    }
    if (!st.isFile()) continue;
    if (!MEDIA_SUFFIXES.has(path.extname(p).toLowerCase())) continue;
    const mt = st.mtimeMs;
    if (!allowExisting && mt < sinceMs - 5000) continue;
    if (best === null || mt > best[0]) best = [mt, p];
  }
  return best ? best[1] : null;
}

module.exports = {
  pluginRoot,
  binDir,
  resolveTool,
  toolHint,
  checkTool,
  quickCheckAll,
  mediaDuration,
  mediaHasAudio,
  isResolveReady,
  detectGpu,
  JobCancelled,
  runTool,
  cancel,
  runToolCapture,
  titleArgs,
  fetchTitle,
  newestMediaFile,
};
