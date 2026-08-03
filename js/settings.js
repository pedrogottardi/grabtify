/* Grabtify plugin — settings persistence.
 *
 * Stored as a small JSON file in the user's AppData (Windows) or Application
 * Support (macOS) folder so it survives plugin reinstalls and Resolve restarts.
 */
"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");

const IS_WIN = process.platform === "win32";

const DEFAULTS = {
  quality: "1080",
  audioQuality: "192",
  mode: "video",
  preset: "crf21",
  insertMode: "playhead",
  trimMethod: "download",
  outDir: "",
  convert: false,
  autoEncode: true,
  language: "en",
};

// Option labels are i18n keys (see js/i18n.js) resolved by the renderer's
// fillSelect; the values stay the stable identifiers used everywhere else.
const PRESETS = [
  ["crf18", "opt.crf18"],
  ["crf21", "opt.crf21"],
  ["crf23", "opt.crf23"],
];

const QUALITIES = [
  ["best", "opt.best"],
  ["2160", "opt.q2160"],
  ["1440", "opt.q1440"],
  ["1080", "opt.q1080"],
  ["720", "opt.q720"],
];

const AUDIO_QUALITIES = [
  ["128", "opt.a128"],
  ["192", "opt.a192"],
  ["320", "opt.a320"],
];

const MODES = [
  ["video", "opt.video"],
  ["audio", "opt.audio"],
];

const INSERT_MODES = [
  ["playhead", "opt.playhead"],
  ["append", "opt.append"],
  ["bin", "opt.bin"],
];

const TRIM_METHODS = [
  ["download", "opt.downloadTrim"],
  ["ffmpeg", "opt.ffmpegTrim"],
];

const LANGUAGES = [
  ["en", "lang.en"],
  ["pt-BR", "lang.ptBR"],
];

function defaultOutDir() {
  return path.join(os.homedir(), "Documents", "Grabtify");
}

function settingsPath() {
  const base = IS_WIN
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : path.join(os.homedir(), "Library", "Application Support");
  const folder = path.join(base, "Grabtify");
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch (e) {
    // ignore — load() will still return defaults
  }
  return path.join(folder, "settings.json");
}

function load() {
  const out = Object.assign({}, DEFAULTS);
  out.outDir = defaultOutDir();
  const p = module.exports.settingsPath();
  if (!fs.existsSync(p)) return out;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(DEFAULTS)) {
        if (raw[k] !== undefined) out[k] = raw[k];
      }
    }
  } catch (e) {
    // corrupt settings — fall through to defaults
  }
  if (!out.outDir) out.outDir = defaultOutDir();
  if (typeof out.autoEncode !== "boolean") out.autoEncode = true;
  if (!LANGUAGES.some((l) => l[0] === out.language)) out.language = DEFAULTS.language;
  // Guard against stale values saved by older versions (old HandBrake preset
  // names, etc.) so the panel never shows an empty dropdown.
  if (!QUALITIES.some((q) => q[0] === out.quality)) out.quality = DEFAULTS.quality;
  if (!AUDIO_QUALITIES.some((a) => a[0] === out.audioQuality)) out.audioQuality = DEFAULTS.audioQuality;
  if (!MODES.some((m) => m[0] === out.mode)) out.mode = DEFAULTS.mode;
  if (!PRESETS.some((p) => p[0] === out.preset)) out.preset = DEFAULTS.preset;
  if (!INSERT_MODES.some((m) => m[0] === out.insertMode)) out.insertMode = DEFAULTS.insertMode;
  if (!TRIM_METHODS.some((t) => t[0] === out.trimMethod)) out.trimMethod = DEFAULTS.trimMethod;
  return out;
}

function save(settings) {
  try {
    fs.writeFileSync(module.exports.settingsPath(), JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    // best effort — never crash the plugin over settings
  }
}

module.exports = {
  DEFAULTS,
  PRESETS,
  QUALITIES,
  AUDIO_QUALITIES,
  MODES,
  INSERT_MODES,
  TRIM_METHODS,
  LANGUAGES,
  defaultOutDir,
  settingsPath,
  load,
  save,
};
