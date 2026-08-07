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
  effect: "off",
  audioEffect: "off",
  gpuEncode: "auto",
  verboseLog: false,
  language: "en",
  updateCheckAt: 0,
  updateSnoozeUntil: 0,
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

// Experimental video effects. Each forces the re-encode stage (app.js turns
// convert on) and maps to an ffmpeg filter chain in pipeline.js effectArgs().
const EFFECTS = [
  ["off", "fx.off"],
  ["smear", "fx.smear"],
  ["mosh", "fx.mosh"],
  ["glitch", "fx.glitch"],
  ["vhs", "fx.vhs"],
  ["pixel", "fx.pixel"],
  ["tiny240", "fx.tiny240"],
  ["poster", "fx.poster"],
  ["noir", "fx.noir"],
  ["crt", "fx.crt"],
  ["trail", "fx.trail"],
];

// Audio effects. Each forces the re-encode stage (app.js) and maps to an
// ffmpeg -af chain in pipeline.js audioEffectArgs(). They apply in both video
// (MP4) and audio (MP3) modes.
const AUDIO_EFFECTS = [
  ["off", "af.off"],
  ["echo", "af.echo"],
  ["reverb", "af.reverb"],
  ["radio", "af.radio"],
  ["nightcore", "af.nightcore"],
  ["deep", "af.deep"],
  ["bass", "af.bass"],
  ["tremolo", "af.tremolo"],
  ["crush", "af.crush"],
  ["reverse", "af.reverse"],
];

const LANGUAGES = [
  ["en", "lang.en"],
  ["pt-BR", "lang.ptBR"],
];

// NVIDIA GPU encoding. "auto" uses the hardware encoder only when the GPU is
// detected; "on" forces it (falling back to CPU if unavailable); "off" always
// encodes on the CPU. Persisted normally (not session-only).
const GPU_ENCODE_MODES = [
  ["auto", "gpu.auto"],
  ["on", "gpu.on"],
  ["off", "gpu.off"],
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
  if (typeof out.verboseLog !== "boolean") out.verboseLog = false;
  if (!LANGUAGES.some((l) => l[0] === out.language)) out.language = DEFAULTS.language;
  // Guard against stale values saved by older versions (old HandBrake preset
  // names, etc.) so the panel never shows an empty dropdown.
  if (!QUALITIES.some((q) => q[0] === out.quality)) out.quality = DEFAULTS.quality;
  if (!AUDIO_QUALITIES.some((a) => a[0] === out.audioQuality)) out.audioQuality = DEFAULTS.audioQuality;
  if (!MODES.some((m) => m[0] === out.mode)) out.mode = DEFAULTS.mode;
  if (!PRESETS.some((p) => p[0] === out.preset)) out.preset = DEFAULTS.preset;
  if (!INSERT_MODES.some((m) => m[0] === out.insertMode)) out.insertMode = DEFAULTS.insertMode;
  if (!TRIM_METHODS.some((t) => t[0] === out.trimMethod)) out.trimMethod = DEFAULTS.trimMethod;
  if (!GPU_ENCODE_MODES.some((g) => g[0] === out.gpuEncode)) out.gpuEncode = DEFAULTS.gpuEncode;
  // The video effect is a per-session choice: it never comes back from disk,
  // so the panel always boots with "off" (the renderer keeps the live value
  // only in memory for the current job).
  out.effect = DEFAULTS.effect;
  // The audio effect is per-session too, same rationale as the video effect.
  out.audioEffect = DEFAULTS.audioEffect;
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
  EFFECTS,
  AUDIO_EFFECTS,
  LANGUAGES,
  GPU_ENCODE_MODES,
  defaultOutDir,
  settingsPath,
  load,
  save,
};
