/* Grabtify — binary update checker + in-app updater.
 *
 * Compares the bundled command-line tools (yt-dlp, ffmpeg, deno) against the
 * latest upstream version and, on Windows, replaces them in place via one
 * elevated (UAC) copy. The check uses plain https.get so it works inside
 * Resolve's bundled Electron without depending on global fetch.
 */
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const tools = require("./tools");
const i18n = require("./i18n");

function t(key, vars) {
  return i18n.t(key, vars);
}

const IS_WIN = process.platform === "win32";
const UA = "Grabtify/1.0";
const REDIRECT_LIMIT = 6;
const MAX_MARKER_WAIT_MS = 120000;

// Per-tool: how to ask for the latest version and how to download a new copy.
// URLs mirror the ones install.bat already uses, so the update replaces the
// same builds the installer would put there.
const LATEST_SOURCES = {
  "yt-dlp": {
    kind: "yt-dlp",
    latest: () => githubLatestTag("yt-dlp/yt-dlp"),
    url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
    zip: false,
    files: ["yt-dlp.exe"],
  },
  deno: {
    kind: "deno",
    latest: () => githubLatestTag("denoland/deno"),
    url: "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
    zip: true,
    files: ["deno.exe"],
  },
  ffmpeg: {
    kind: "ffmpeg",
    latest: () =>
      requestText("https://www.gyan.dev/ffmpeg/builds/release-version").then((s) => s.trim()),
    url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    zip: true,
    files: ["ffmpeg.exe", "ffprobe.exe"],
  },
};

const TOOL_IDS = Object.keys(LATEST_SOURCES);

// ------------------------------------------------------------- http helpers --
function openHttp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + u.search,
        method: "GET",
        headers: { "User-Agent": UA },
      },
      (res) => resolve(res)
    );
    req.setTimeout(timeoutMs || 30000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function followRedirects(startUrl, onResponse) {
  let cur = startUrl;
  for (let i = 0; i < REDIRECT_LIMIT; i++) {
    const res = await openHttp(cur);
    const code = res.statusCode || 0;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      cur = new URL(res.headers.location, cur).toString();
      continue;
    }
    if (code >= 400) {
      res.resume();
      throw new Error("HTTP " + code);
    }
    await onResponse(res, cur);
    return;
  }
  throw new Error("too many redirects");
}

async function requestText(url) {
  let data = "";
  await followRedirects(url, async (res) => {
    res.setEncoding("utf8");
    for await (const chunk of res) data += chunk;
  });
  return data;
}

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await followRedirects(url, (res) => {
    const out = fs.createWriteStream(destPath);
    return new Promise((resolve, reject) => {
      res.pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      res.on("error", reject);
    });
  });
}

async function githubLatestTag(repo) {
  const text = await requestText("https://api.github.com/repos/" + repo + "/releases/latest");
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("unreadable GitHub release info");
  }
  if (!json || !json.tag_name) throw new Error("no release tag");
  return json.tag_name;
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    let err = "";
    let proc;
    try {
      proc = spawn("tar", ["-xf", zipPath, "-C", destDir], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      reject(e);
      return;
    }
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("tar exit " + code + ": " + err.trim()));
    });
  });
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const found = findFile(path.join(dir, e.name), name);
    if (found) return found;
  }
  return null;
}

// ------------------------------------------------------------- version logic --
// Extract a comparable version string from a tool's --version output.
function parseVersion(kind, raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = null;
  if (kind === "deno") {
    m = /(\d+\.\d+(?:\.\d+)*)/.exec(s);
  } else if (kind === "ffmpeg") {
    // Release builds print "ffmpeg version 8.1.2-...". Git/nightly builds print
    // "ffmpeg version N-119000-..." which we cannot compare against a release,
    // so those are treated as "unknown" (parseVersion returns null).
    m = /ffmpeg version (\d+(?:\.\d+)*)/.exec(s) || /^(\d+(?:\.\d+)*)/.exec(s);
  } else {
    m = /^([0-9][0-9.]*)/.exec(s) || /([0-9][0-9.]*)/.exec(s);
  }
  return m ? m[1] : null;
}

function tokenize(v) {
  return String(v)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((x) => parseInt(x, 10));
}

function versionCompare(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i] || 0;
    const y = tb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// Returns true when a newer version exists, false when current, null when the
// installed version cannot be parsed (never guess on unparsable versions).
function isOutdated(kind, installed, latest) {
  const a = parseVersion(kind, installed);
  const b = parseVersion(kind, latest);
  if (a === null || b === null) return null;
  return versionCompare(a, b) < 0;
}

// Query the latest version for every bundled tool. A failed network lookup
// reports { err } for that tool instead of throwing, so one blocked endpoint
// never breaks the whole check.
async function latestVersions() {
  const out = [];
  for (const id of TOOL_IDS) {
    const cfg = LATEST_SOURCES[id];
    const info = tools.checkTool(id);
    const resolved = tools.resolveTool(id);
    const installed = info.ok ? info.version : "";
    const bundled = !!resolved.bundled;
    try {
      const latest = await cfg.latest();
      out.push({
        id: id,
        kind: cfg.kind,
        installed: installed,
        latest: latest,
        outdated: isOutdated(cfg.kind, installed, latest),
        bundled: bundled,
        err: "",
      });
    } catch (e) {
      out.push({
        id: id,
        kind: cfg.kind,
        installed: installed,
        latest: "",
        outdated: null,
        bundled: bundled,
        err: String((e && e.message) || e),
      });
    }
  }
  return out;
}

// ------------------------------------------------------------- in-app update --
function elevateCopy(pairs, workDir) {
  return new Promise((resolve, reject) => {
    const pairsFile = path.join(workDir, "pairs.json");
    const marker = path.join(workDir, "done.marker");
    const script = path.join(workDir, "apply.ps1");
    fs.writeFileSync(pairsFile, JSON.stringify(pairs), "utf-8");
    if (fs.existsSync(marker)) {
      try { fs.unlinkSync(marker); } catch (e) { /* ignore */ }
    }
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      "try {",
      "  $pairs = Get-Content -Raw -LiteralPath '" + pairsFile + "' | ConvertFrom-Json",
      "  foreach ($p in $pairs) {",
      "    if (-not (Test-Path -LiteralPath $p.src)) { throw ('missing source: ' + $p.src) }",
      "    Copy-Item -LiteralPath $p.src -Destination $p.dst -Force",
      "  }",
      "  'ok' | Out-File -Encoding ascii -LiteralPath '" + marker + "'",
      "} catch {",
      "  ('FAIL:' + $_.Exception.Message) | Out-File -Encoding ascii -LiteralPath '" + marker + "'",
      "}",
    ].join("\n");
    fs.writeFileSync(script, ps, "utf-8");
    const inner =
      "Start-Process -FilePath 'powershell.exe' -Verb RunAs " +
      "-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','" + script + "'";
    let proc;
    try {
      proc = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", inner], {
        windowsHide: true,
      });
    } catch (e) {
      reject(e);
      return;
    }
    proc.on("error", reject);
    const deadline = Date.now() + MAX_MARKER_WAIT_MS;
    const poll = setInterval(() => {
      if (fs.existsSync(marker)) {
        clearInterval(poll);
        const content = fs.readFileSync(marker, "utf-8").trim();
        if (content === "ok") resolve();
        else reject(new Error(content.replace(/^FAIL:\s*/, "")));
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error(t("updates.elevateTimeout")));
      }
    }, 500);
  });
}

async function updateTool(id, workDir, onProgress) {
  const cfg = LATEST_SOURCES[id];
  const dl = path.join(workDir, id + (cfg.zip ? ".zip" : ".exe"));
  onProgress(id, "downloading", 0);
  await downloadFile(cfg.url, dl);

  let srcFiles;
  if (cfg.zip) {
    onProgress(id, "extracting", null);
    const exDir = path.join(workDir, id);
    fs.mkdirSync(exDir, { recursive: true });
    await extractZip(dl, exDir);
    srcFiles = cfg.files
      .map((f) => findFile(exDir, f))
      .filter(Boolean);
  } else {
    srcFiles = [dl];
  }
  if (srcFiles.length !== cfg.files.length) {
    throw new Error(t("updates.missingFile", [id]));
  }

  onProgress(id, "applying", null);
  const binDir = tools.binDir();
  fs.mkdirSync(binDir, { recursive: true });
  const pairs = srcFiles.map((src, i) => ({
    src: src,
    dst: path.join(binDir, cfg.files[i]),
  }));
  await elevateCopy(pairs, workDir);
  return tools.checkTool(id);
}

async function updateTools(ids, onProgress) {
  if (!IS_WIN) {
    return { winError: t("updates.macManual") };
  }
  const list = (ids || []).filter((id) => TOOL_IDS.indexOf(id) !== -1);
  const results = {};
  if (!list.length) return { results: results };
  const workDir = path.join(os.tmpdir(), "grabtify-update");
  try {
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    for (const id of list) {
      try {
        const chk = await updateTool(id, workDir, onProgress);
        results[id] = { ok: chk.ok, version: chk.version, err: chk.err };
      } catch (e) {
        results[id] = { ok: false, version: "", err: String((e && e.message) || e) };
      }
    }
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  return { results: results };
}

module.exports = {
  TOOL_IDS,
  LATEST_SOURCES,
  parseVersion,
  versionCompare,
  isOutdated,
  latestVersions,
  updateTools,
  requestText,
  downloadFile,
  IS_WIN,
};
