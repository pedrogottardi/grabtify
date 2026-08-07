"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pipeline = require("../../js/pipeline");
const tools = require("../../js/tools");
const settings = require("../../js/settings");
const resolveApi = require("../../js/resolve_api");
const validation = require("../../js/validation");
const i18n = require("../../js/i18n");
const updater = require("../../js/updater");

function fakeResolveApi(mediaItem, opts) {
  opts = opts || {};
  const calls = { append: [] };
  const trackItems = { video: [], audio: [] };
  let itemCounter = 0;
  const timeline = {
    GetStartFrame: () => (opts.startFrame !== undefined ? opts.startFrame : 0),
    GetStartTimecode: () => opts.startTimecode || "00:00:00:00",
    GetCurrentTimecode: () => opts.currentTimecode || "00:00:37:12",
    GetTrackCount: () => 1,
    GetItemListInTrack: (type) => trackItems[type],
    GetEndFrame: () => 0,
    GetPlayheadFrame:
      opts.playheadFrame !== undefined ? () => opts.playheadFrame : undefined,
  };
  const mp = {
    GetRootFolder: () => ({ GetSubFolders: () => [], GetName: () => "Root" }),
    AddSubFolder: () => ({ GetName: () => "Grabtify" }),
    ImportMedia: () => [mediaItem],
    MoveClips: () => true,
    AppendToTimeline: (clips) => {
      calls.append.push(clips);
      const first = clips[0];
      const isDict = !!(first && typeof first === "object" && first.mediaPoolItem);
      if (isDict && opts.noOp) return [{}, {}];
      if (!isDict && opts.plainThrows) throw new Error("target track locked");
      const item = {
        GetName: () => "item" + itemCounter++,
        GetStart: () => (opts.startFrame !== undefined ? opts.startFrame : 0),
        GetTrackTypeAndIndex: () => ["video", 1],
      };
      if (isDict) {
        const type = first.mediaType === 2 ? "audio" : "video";
        trackItems[type].push(item);
      } else {
        trackItems.video.push(item);
      }
      return [item];
    },
  };
  const project = {
    GetMediaPool: () => mp,
    GetCurrentTimeline: () => timeline,
    GetSetting: (key) => {
      if (key === "timelineFrameRate") return opts.frameRate || "25";
      return null;
    },
  };
  const pm = { GetCurrentProject: () => project };
  const resolve = { GetProjectManager: () => pm };
  const workflowIntegration = { GetResolve: () => resolve };
  return { api: resolveApi.createApi(workflowIntegration), calls: calls };
}

test("parseTimecode accepts plain seconds", () => {
  assert.strictEqual(pipeline.parseTimecode("90"), 90);
  assert.strictEqual(pipeline.parseTimecode("1:30"), 90);
  assert.strictEqual(pipeline.parseTimecode("01:02:03.5"), 3723.5);
});

test("parseTimecode rejects garbage", () => {
  assert.strictEqual(pipeline.parseTimecode(""), null);
  assert.strictEqual(pipeline.parseTimecode("   "), null);
  assert.throws(() => pipeline.parseTimecode("abc"));
  assert.throws(() => pipeline.parseTimecode("1:2:3:4"));
});

test("fmtSeconds rounds to ms", () => {
  assert.strictEqual(pipeline.fmtSeconds(1.2345), "1.235");
});

test("encodePct converts ffmpeg -progress output to a percentage", () => {
  assert.ok(Math.abs(pipeline.encodePct("out_time_ms=937042", 10) - 9.37042) < 0.001);
  assert.strictEqual(pipeline.encodePct("out_time=00:00:01.500000", 10), 15);
  assert.strictEqual(pipeline.encodePct("out_time_ms=10000000", 10), 100);
});

test("encodePct ignores non-progress lines and missing duration", () => {
  assert.strictEqual(pipeline.encodePct("progress=continue", 10), null);
  assert.strictEqual(pipeline.encodePct("frame=100", 10), null);
  assert.strictEqual(pipeline.encodePct("out_time_ms=937042", null), null);
  assert.strictEqual(pipeline.encodePct("out_time_ms=937042", 0), null);
});

test("buildFormat applies height filter except for best", () => {
  assert.ok(pipeline.buildFormat("1080").includes("[height<=?1080]"));
  assert.ok(!pipeline.buildFormat("best").includes("height"));
});

test("normalizeVideoUrl canonicalizes Instagram reels", () => {
  const [canonical, original] = pipeline.normalizeVideoUrl(
    "https://www.instagram.com/reel/AbC123/"
  );
  assert.strictEqual(canonical, "https://www.instagram.com/reel/AbC123/");
  assert.ok(original);
  const [same] = pipeline.normalizeVideoUrl("https://youtu.be/xyz");
  assert.strictEqual(same, "https://youtu.be/xyz");
});

test("validateUrl accepts http(s) links only", () => {
  assert.strictEqual(pipeline.validateUrl("https://example.com/v"), null);
  assert.strictEqual(pipeline.validateUrl("https://example.com/v "), null);
  assert.ok(pipeline.validateUrl("youtube.com/watch?v=1"));
  assert.ok(pipeline.validateUrl(""));
});

test("validation.validateUrl is the same behaviour pipeline exposes", () => {
  assert.strictEqual(validation.validateUrl("https://example.com/v"), null);
  assert.strictEqual(validation.validateUrl("https://example.com/v "), null);
  assert.ok(validation.validateUrl("youtube.com/watch?v=1"));
  assert.ok(validation.validateUrl(""));
});

test("validation.validateTimecode accepts empty, seconds, and rejects garbage", () => {
  assert.strictEqual(validation.validateTimecode(""), null);
  assert.strictEqual(validation.validateTimecode("  "), null);
  assert.strictEqual(validation.validateTimecode("90"), null);
  assert.strictEqual(validation.validateTimecode("1:30"), null);
  assert.strictEqual(validation.validateTimecode("01:02:03.5"), null);
  assert.ok(validation.validateTimecode("1:2:3:4"));
  assert.ok(validation.validateTimecode("abc"));
});

test("validation.parseTimecode returns seconds or throws", () => {
  assert.strictEqual(validation.parseTimecode("90"), 90);
  assert.strictEqual(validation.parseTimecode("1:30"), 90);
  assert.strictEqual(validation.parseTimecode("01:02:03.5"), 3723.5);
  assert.strictEqual(validation.parseTimecode(""), null);
  assert.strictEqual(validation.parseTimecode("   "), null);
  assert.throws(() => validation.parseTimecode("abc"));
  assert.throws(() => validation.parseTimecode("1:2:3:4"));
});

test("friendlyHost strips www and falls back gracefully", () => {
  assert.strictEqual(
    pipeline.friendlyHost("https://www.instagram.com/reel/AbC123/"),
    "instagram.com"
  );
  assert.strictEqual(pipeline.friendlyHost("https://youtu.be/xyz"), "youtu.be");
  assert.strictEqual(pipeline.friendlyHost("not a url"), "the site");
  assert.strictEqual(pipeline.friendlyHost(""), "the site");
});

test("settings load returns defaults and round-trips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    assert.ok(Object.prototype.hasOwnProperty.call(before, "quality"));
    assert.ok(Object.prototype.hasOwnProperty.call(before, "insertMode"));
    settings.save(Object.assign({}, before, { quality: "2160" }));
    const after = settings.load();
    assert.strictEqual(after.quality, "2160");
    settings.save(before);
    const restored = settings.load();
    assert.strictEqual(restored.quality, before.quality);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings normalize stale preset and trim values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    settings.save(Object.assign({}, before, { preset: "Fast 1080p30", trimMethod: "handbrake" }));
    const after = settings.load();
    assert.strictEqual(after.preset, "crf21");
    assert.strictEqual(after.trimMethod, "download");
    settings.save(before);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings normalize stale mode and audio quality values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    settings.save(Object.assign({}, before, { mode: "wav", audioQuality: "999" }));
    const after = settings.load();
    assert.strictEqual(after.mode, "video");
    assert.strictEqual(after.audioQuality, "192");
    settings.save(before);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings autoEncode defaults true and round-trips", () => {
  assert.strictEqual(settings.DEFAULTS.autoEncode, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    assert.strictEqual(typeof before.autoEncode, "boolean");
    settings.save(Object.assign({}, before, { autoEncode: !before.autoEncode }));
    assert.strictEqual(settings.load().autoEncode, !before.autoEncode);
    settings.save(before);
    assert.strictEqual(settings.load().autoEncode, before.autoEncode);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings gpuEncode defaults to auto, round-trips, and normalizes junk", () => {
  assert.strictEqual(settings.DEFAULTS.gpuEncode, "auto");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    assert.strictEqual(before.gpuEncode, "auto");
    settings.save(Object.assign({}, before, { gpuEncode: "on" }));
    assert.strictEqual(settings.load().gpuEncode, "on");
    settings.save(Object.assign({}, before, { gpuEncode: "bogus" }));
    assert.strictEqual(settings.load().gpuEncode, "auto");
    settings.save(before);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings verboseLog defaults to false, round-trips booleans", () => {
  assert.strictEqual(settings.DEFAULTS.verboseLog, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    assert.strictEqual(before.verboseLog, false);
    settings.save(Object.assign({}, before, { verboseLog: true }));
    assert.strictEqual(settings.load().verboseLog, true);
    settings.save(Object.assign({}, before, { verboseLog: false }));
    assert.strictEqual(settings.load().verboseLog, false);
    settings.save(before);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings verboseLog normalizes non-boolean to default", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-settings-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    const before = settings.load();
    settings.save(Object.assign({}, before, { verboseLog: "yes" }));
    assert.strictEqual(settings.load().verboseLog, false);
    settings.save(Object.assign({}, before, { verboseLog: null }));
    assert.strictEqual(settings.load().verboseLog, false);
    settings.save(before);
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GPU_ENCODE_MODES drives the gpu dropdown and each label resolves", () => {
  assert.strictEqual(settings.GPU_ENCODE_MODES[0][0], "auto");
  for (const pair of settings.GPU_ENCODE_MODES) {
    const label = i18n.translate("en", pair[1]);
    assert.ok(label && label !== pair[1], "label " + pair[1] + " must resolve");
    const pt = i18n.translate("pt-BR", pair[1]);
    assert.ok(pt && pt !== pair[1], "pt-BR label " + pair[1] + " must resolve");
  }
});

test("i18n new job log keys resolve in both languages", () => {
  const en = i18n.translate("en", "job.savedTo");
  assert.ok(en && en.includes(": {0}", "savedTo resolves"));
  for (const k of [
    "job.convertingVideo", "job.convertingAudio", "job.trimmingTo",
    "job.toolMissing", "job.downloadFailed", "job.encodeFailed", "job.gpuFallback"
  ]) {
    const enText = i18n.translate("en", k);
    const ptText = i18n.translate("pt-BR", k);
    assert.ok(enText && enText !== k, "en label " + k + " resolves");
    assert.ok(ptText && ptText !== k, "pt-BR label " + k + " resolves");
  }
});

test("i18n verbose log settings keys resolve in both languages", () => {
  for (const k of ["settings.verboseLog", "settings.verboseLogNote"]) {
    const enText = i18n.translate("en", k);
    const ptText = i18n.translate("pt-BR", k);
    assert.ok(enText && enText !== k, "en label " + k + " resolves");
    assert.ok(ptText && ptText !== k, "pt-BR label " + k + " resolves");
  }
});

test("shouldEncode covers audio, manual convert, ffmpeg trim, and auto detection", () => {
  const base = {
    mode: "video", convert: false, auto_encode: true,
    trim: false, trim_method: "download",
  };
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { mode: "audio" }), false), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { convert: true }), true), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { trim: true, trim_method: "ffmpeg" }), true), true);
  assert.strictEqual(pipeline.shouldEncode(base, false), true);
  assert.strictEqual(pipeline.shouldEncode(base, true), false);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { auto_encode: false }), true), false);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { auto_encode: false }), false), false);
});

test("isResolveReady returns false when the probe fails", () => {
  const f = path.join(os.tmpdir(), "grabtify-notmedia-" + Date.now() + ".mp4");
  fs.writeFileSync(f, "not a real media file");
  try {
    assert.strictEqual(tools.isResolveReady(f), false);
  } finally {
    fs.unlinkSync(f);
  }
});

test("main.js boot payload exposes every settings dropdown array", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "main.js"), "utf-8");
  for (const key of ["QUALITIES", "AUDIO_QUALITIES", "MODES", "INSERT_MODES",
                     "TRIM_METHODS", "PRESETS", "EFFECTS", "AUDIO_EFFECTS",
                     "LANGUAGES", "GPU_ENCODE_MODES"]) {
    assert.ok(
      new RegExp("^\\s*" + key + ": settingsMod\\." + key + ",", "m").test(src),
      "boot payload must expose " + key);
  }
  assert.ok(/\bgpu: detectGpuCached\(\),/.test(src), "boot payload must expose gpu");
});

test("main.js start-job maps every renderer option into jobOpts", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "main.js"), "utf-8");
  const block = src.split("grabtify:start-job")[1] || "";
  for (const field of ["mode", "quality", "preset", "convert", "auto_encode",
                       "insert_mode", "audio_quality", "effect", "audio_effect"]) {
    assert.ok(
      new RegExp("^\\s*" + field + ": opts\\.", "m").test(block),
      "start-job must map " + field + " into jobOpts");
  }
  assert.ok(/\n\s*gpu_encode: gpuEncodeForJob\(settings\),/.test(block), "start-job must map gpu_encode");
  assert.ok(/\n\s*verbose_log: !!opts\.verbose_log,/.test(block), "start-job must map verbose_log");
  assert.ok(/\n\s*out_dir: outDir,/.test(block), "start-job must map out_dir into jobOpts");
});

test("newestMediaFile finds the newest media file deterministically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-test-"));
  const a = path.join(dir, "old.mp4");
  const b = path.join(dir, "new.mkv");
  fs.writeFileSync(a, "x");
  fs.writeFileSync(b, "x");
  fs.utimesSync(a, new Date(2020, 0, 1), new Date(2020, 0, 1));
  fs.utimesSync(b, new Date(2030, 0, 1), new Date(2030, 0, 1));
  try {
    const newest = tools.newestMediaFile(dir, 0, true);
    assert.strictEqual(newest, b);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkTool reports status for bundled tools", () => {
  const r = tools.checkTool("ffmpeg");
  assert.strictEqual(typeof r.ok, "boolean");
  assert.strictEqual(typeof r.version, "string");
});

test("quickCheckAll returns {ok, version, err} objects per tool", () => {
  const r = tools.quickCheckAll();
  for (const name of ["yt-dlp", "ffmpeg"]) {
    assert.ok(r[name] && typeof r[name] === "object");
    assert.strictEqual(typeof r[name].ok, "boolean");
    assert.strictEqual(typeof r[name].version, "string");
    assert.strictEqual(typeof r[name].err, "string");
  }
});

test("detectGpu reports a well-formed GPU status without throwing", () => {
  const gpu = tools.detectGpu();
  assert.strictEqual(typeof gpu.available, "boolean");
  assert.strictEqual(typeof gpu.label, "string");
  assert.strictEqual(typeof gpu.encoder, "string");
  if (gpu.available) {
    assert.ok(gpu.label.length > 0, "available GPU must have a name");
    assert.strictEqual(gpu.encoder, "h264_nvenc");
  }
});

test("updater.parseVersion extracts real release versions", () => {
  assert.strictEqual(updater.parseVersion("yt-dlp", "yt-dlp 2026.07.04 from yt-dlp/yt-dlp"), "2026.07.04");
  assert.strictEqual(updater.parseVersion("deno", "deno 2.9.4 (stable, release, x86_64-pc-windows-msvc)"), "2.9.4");
  assert.strictEqual(updater.parseVersion("ffmpeg", "ffmpeg version 8.1.2-essentials_build-www.gyan.dev Copyright (c)"), "8.1.2");
  assert.strictEqual(updater.parseVersion("ffmpeg", "8.1.2-essentials"), "8.1.2");
});

test("updater.parseVersion returns null for unparsable or nightly builds", () => {
  assert.strictEqual(updater.parseVersion("yt-dlp", ""), null);
  assert.strictEqual(updater.parseVersion("deno", "garbage"), null);
  assert.strictEqual(updater.parseVersion("ffmpeg", "ffmpeg version N-119000-gabcdef Copyright (c)"), null);
  assert.strictEqual(updater.parseVersion("ffmpeg", ""), null);
});

test("updater.versionCompare orders dot and dash separated numbers", () => {
  assert.strictEqual(updater.versionCompare("2026.07.04", "2026.07.04"), 0);
  assert.strictEqual(updater.versionCompare("2026.07.04", "2026.07.05"), -1);
  assert.strictEqual(updater.versionCompare("2.9.4", "2.10.0"), -1);
  assert.strictEqual(updater.versionCompare("2.10.0", "2.9.4"), 1);
  assert.strictEqual(updater.versionCompare("8.1.2", "8.1"), 1);
});

test("updater.isOutdated never guesses on unparsable versions", () => {
  assert.strictEqual(updater.isOutdated("yt-dlp", "yt-dlp 2026.07.04", "2026.07.04"), false);
  assert.strictEqual(updater.isOutdated("yt-dlp", "yt-dlp 2026.07.04", "2026.07.05"), true);
  assert.strictEqual(updater.isOutdated("yt-dlp", "yt-dlp 2026.07.04", "2026.07.03"), false);
  assert.strictEqual(updater.isOutdated("ffmpeg", "ffmpeg version N-119000-gabc", "8.1.2"), null);
  assert.strictEqual(updater.isOutdated("deno", "garbage", "2.9.4"), null);
  assert.strictEqual(updater.isOutdated("yt-dlp", "yt-dlp 2026.07.04", "not-a-version"), null);
});

test("updater.requestText awaits the body and follows a redirect", async () => {
  const http = require("node:http");
  const server = http.createServer((req, res) => {
    if (req.url === "/version") {
      res.setHeader("content-type", "text/plain");
      res.end("2026.07.04");
    } else {
      res.writeHead(302, { location: "/version" });
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    assert.strictEqual(await updater.requestText("http://127.0.0.1:" + port + "/version"), "2026.07.04");
    assert.strictEqual(await updater.requestText("http://127.0.0.1:" + port + "/jump"), "2026.07.04");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("updater.downloadFile writes the full payload before resolving", async () => {
  const http = require("node:http");
  const payload = Buffer.from("binary-payload-" + Math.random());
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/octet-stream");
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-upd-test-"));
  const dest = path.join(dir, "out.bin");
  try {
    await updater.downloadFile("http://127.0.0.1:" + port + "/file", dest);
    assert.strictEqual(fs.readFileSync(dest).toString(), payload.toString());
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("titleArgs asks for a title only and guards the URL with --", () => {
  const args = tools.titleArgs("https://example.com/v");
  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("--skip-download"));
  assert.ok(args.includes("--print"));
  assert.ok(args.includes("title"));
  assert.strictEqual(args.indexOf("--") + 1, args.indexOf("https://example.com/v"));
  assert.strictEqual(args[args.length - 1], "https://example.com/v");
});

test("playhead insert uses clipInfo with video mediaType and recordFrame", () => {
  const mediaItem = { GetClipProperty: () => "9000" };
  const { api, calls } = fakeResolveApi(mediaItem);
  const file = path.join(os.tmpdir(), "grabtify-insert-video.mp4");
  fs.writeFileSync(file, "x");
  try {
    assert.strictEqual(api.importAndInsert(file, "playhead", false), "playhead");
    const clipInfo = calls.append[0][0];
    assert.strictEqual(clipInfo.mediaPoolItem, mediaItem);
    assert.strictEqual(clipInfo.mediaType, undefined);
    assert.strictEqual(clipInfo.trackIndex, 1);
    assert.strictEqual(clipInfo.recordFrame, 937);
    assert.strictEqual(clipInfo.startFrame, 1);
    assert.strictEqual(clipInfo.endFrame, 9000);
  } finally {
    fs.unlinkSync(file);
  }
});

test("playhead insert uses audio mediaType and negative track for mp3", () => {
  const mediaItem = { GetClipProperty: () => "3600" };
  const { api, calls } = fakeResolveApi(mediaItem);
  const file = path.join(os.tmpdir(), "grabtify-insert-audio.mp3");
  fs.writeFileSync(file, "x");
  try {
    assert.strictEqual(api.importAndInsert(file, "playhead", true), "playhead");
    const clipInfo = calls.append[0][0];
    assert.strictEqual(clipInfo.mediaType, 2);
    assert.strictEqual(clipInfo.trackIndex, -1);
    assert.strictEqual(clipInfo.recordFrame, 937);
  } finally {
    fs.unlinkSync(file);
  }
});

test("playhead insert prefers GetPlayheadFrame when the binding exposes it", () => {
  const mediaItem = { GetClipProperty: () => "9000" };
  const { api, calls } = fakeResolveApi(mediaItem, { playheadFrame: 900 });
  const file = path.join(os.tmpdir(), "grabtify-insert-playheadframe.mp4");
  fs.writeFileSync(file, "x");
  try {
    assert.strictEqual(api.importAndInsert(file, "playhead", false), "playhead");
    assert.strictEqual(calls.append[0][0].recordFrame, 900);
  } finally {
    fs.unlinkSync(file);
  }
});

test("playhead recordFrame is absolute for timelines that do not start at 0", () => {
  const mediaItem = { GetClipProperty: () => "9000" };
  const { api, calls } = fakeResolveApi(mediaItem, {
    startFrame: 86400,
    startTimecode: "01:00:00:00",
    currentTimecode: "01:00:01:05",
    frameRate: "24",
  });
  const file = path.join(os.tmpdir(), "grabtify-insert-nonzero-start.mp4");
  fs.writeFileSync(file, "x");
  try {
    assert.strictEqual(api.importAndInsert(file, "playhead", false), "playhead");
    assert.strictEqual(calls.append[0][0].recordFrame, 86429);
  } finally {
    fs.unlinkSync(file);
  }
});

test("silent no-op playhead insert falls back to a plain append", () => {
  const mediaItem = { GetClipProperty: () => "9000" };
  const { api, calls } = fakeResolveApi(mediaItem, { noOp: true });
  const file = path.join(os.tmpdir(), "grabtify-insert-noop.mp4");
  fs.writeFileSync(file, "x");
  try {
    assert.strictEqual(api.importAndInsert(file, "playhead", false), "append");
    assert.strictEqual(calls.append.length, 2);
    assert.strictEqual(calls.append[1].length, 1);
    assert.strictEqual(calls.append[1][0], mediaItem);
  } finally {
    fs.unlinkSync(file);
  }
});

test("no-op playhead insert reports an error when the fallback append also fails", () => {
  const mediaItem = { GetClipProperty: () => "9000" };
  const { api } = fakeResolveApi(mediaItem, { noOp: true, plainThrows: true });
  const file = path.join(os.tmpdir(), "grabtify-insert-noop-throw.mp4");
  fs.writeFileSync(file, "x");
  try {
    assert.throws(() => api.importAndInsert(file, "playhead", false), /track locked/);
  } finally {
    fs.unlinkSync(file);
  }
});

test("timecodeToFrame converts plain, fractional, and drop-frame timecodes", () => {
  assert.strictEqual(resolveApi.timecodeToFrame("00:00:37:12", "25"), 937);
  assert.strictEqual(resolveApi.timecodeToFrame("00:00:01:00", 24), 24);
  assert.strictEqual(resolveApi.timecodeToFrame("01:00:00:00", "29.97 DF"), 107892);
  assert.strictEqual(resolveApi.timecodeToFrame("00:59:59:29", "29.97 DF"), 107891);
  assert.strictEqual(resolveApi.timecodeToFrame("01:00:00:00", "59.94 DF"), 215784);
  assert.strictEqual(resolveApi.timecodeToFrame("01:00:00;00", "29.97 DF"), 107892);
});

test("timecodeToFrame rejects garbage and fpsInfo flags drop-frame", () => {
  assert.strictEqual(resolveApi.timecodeToFrame("garbage", "24"), null);
  assert.strictEqual(resolveApi.timecodeToFrame("00:00:00", "24"), null);
  assert.strictEqual(resolveApi.timecodeToFrame("00:00:00:00", "not-a-rate"), null);
  assert.strictEqual(resolveApi.fpsInfo("29.97 DF").dropFrame, true);
  assert.strictEqual(resolveApi.fpsInfo("30").dropFrame, false);
  assert.strictEqual(resolveApi.fpsInfo(null), null);
});

test("openInResolveFolder reports success only when it really navigates", () => {
  function makeApi(behavior) {
    const bin = { GetName: () => "Grabtify" };
    const mp = {
      GetRootFolder: () => ({ GetSubFolders: () => ({ 1: bin }) }),
      SetCurrentFolder: () => behavior.setCurrentFolder,
      OpenInFolder: () => behavior.openInFolder,
    };
    const project = { GetMediaPool: () => mp };
    const pm = { GetCurrentProject: () => project };
    const resolve = { GetProjectManager: () => pm };
    const workflowIntegration = { GetResolve: () => resolve };
    return resolveApi.createApi(workflowIntegration);
  }
  assert.strictEqual(makeApi({ setCurrentFolder: true, openInFolder: false }).openInResolveFolder(), true);
  assert.strictEqual(makeApi({ setCurrentFolder: false, openInFolder: true }).openInResolveFolder(), true);
  assert.strictEqual(makeApi({ setCurrentFolder: false, openInFolder: false }).openInResolveFolder(), false);
});

test("openInResolveFolder returns false when the bin is missing", () => {
  const mp = {
    GetRootFolder: () => ({ GetSubFolders: () => [] }),
    SetCurrentFolder: () => true,
    OpenInFolder: () => true,
  };
  const project = { GetMediaPool: () => mp };
  const pm = { GetCurrentProject: () => project };
  const resolve = { GetProjectManager: () => pm };
  const workflowIntegration = { GetResolve: () => resolve };
  const api = resolveApi.createApi(workflowIntegration);
  assert.strictEqual(api.openInResolveFolder(), false);
});

test("i18n translate defaults to English and interpolates {0}", () => {
  assert.strictEqual(i18n.translate("en", "status.pastePrompt"),
    "> paste a link, then [grabtify to timeline]");
  assert.strictEqual(i18n.translate("pt-BR", "status.pastePrompt"),
    "> cole um link, então [grabtify para a timeline]");
  assert.strictEqual(i18n.translate("pt-BR", "settings.kofi"), "Me pague um café!");
  assert.strictEqual(i18n.translate("pt-BR", "stage.fetch"), "CAPTURAR");
  assert.strictEqual(i18n.translate("pt-BR", "stage.encode"), "CODIFICAR");
  assert.strictEqual(i18n.translate("pt-BR", "job.downloadTrim", ["3", "45.5"]),
    "Cortando até 3–45.5 (cópia rápida, precisa de ffmpeg).");
  assert.strictEqual(i18n.translate("pt-BR", "job.encodingVideo", ["video.mp4", "21"]),
    "Codificando video.mp4 para H.264 CRF 21");
});

test("i18n falls back to the key for unknown strings and to English for unknown languages", () => {
  assert.strictEqual(i18n.translate("en", "no.such.key"), "no.such.key");
  assert.strictEqual(i18n.translate("pt-BR", "no.such.key"), "no.such.key");
  assert.strictEqual(i18n.translate("xx-XX", "status.finishedOk"), "Done.");
});

test("i18n currentLanguage/setLanguage swap the active table and t() follows it", () => {
  i18n.setLanguage("pt-BR");
  assert.strictEqual(i18n.currentLanguage(), "pt-BR");
  assert.strictEqual(i18n.t("form.grab"), "Grabtify para a timeline");
  i18n.setLanguage("xx-XX");
  assert.strictEqual(i18n.currentLanguage(), "pt-BR");
  i18n.setLanguage("en");
  assert.strictEqual(i18n.t("form.grab"), "Grabtify to timeline");
});

test("validation messages are localized through i18n", () => {
  i18n.setLanguage("pt-BR");
  assert.strictEqual(validation.URL_ERROR, "Insira um link http(s) completo primeiro.");
  assert.strictEqual(validation.validateUrl("ftp://example.com"),
    "Insira um link http(s) completo primeiro.");
  i18n.setLanguage("en");
  assert.strictEqual(validation.URL_ERROR, "Enter a full http(s) link first.");
  assert.strictEqual(validation.validateUrl("ftp://example.com"),
    "Enter a full http(s) link first.");
});

test("settings language defaults to en, round-trips, and normalizes junk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-i18n-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    assert.strictEqual(settings.load().language, "en");
    settings.save(Object.assign(settings.load(), { language: "pt-BR" }));
    assert.strictEqual(settings.load().language, "pt-BR");
    settings.save(Object.assign(settings.load(), { language: "xx" }));
    assert.strictEqual(settings.load().language, "en");
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LANGUAGES drives the language dropdown and each label resolves", () => {
  assert.deepStrictEqual(settings.LANGUAGES,
    [["en", "lang.en"], ["pt-BR", "lang.ptBR"]]);
  for (const pair of settings.LANGUAGES) {
    const label = i18n.translate("en", pair[1]);
    assert.ok(label && label !== pair[1], "label " + pair[1] + " must resolve");
  }
});

test("EFFECTS drives the effect dropdown and each label resolves", () => {
  assert.strictEqual(settings.EFFECTS[0][0], "off");
  assert.deepStrictEqual(settings.EFFECTS[0], ["off", "fx.off"]);
  for (const pair of settings.EFFECTS) {
    const label = i18n.translate("en", pair[1]);
    assert.ok(label && label !== pair[1], "label " + pair[1] + " must resolve");
    const pt = i18n.translate("pt-BR", pair[1]);
    assert.ok(pt && pt !== pair[1], "pt-BR label " + pair[1] + " must resolve");
  }
});

test("AUDIO_EFFECTS drives the audio effect dropdown and each label resolves", () => {
  assert.strictEqual(settings.AUDIO_EFFECTS[0][0], "off");
  assert.deepStrictEqual(settings.AUDIO_EFFECTS[0], ["off", "af.off"]);
  for (const pair of settings.AUDIO_EFFECTS) {
    const label = i18n.translate("en", pair[1]);
    assert.ok(label && label !== pair[1], "label " + pair[1] + " must resolve");
    const pt = i18n.translate("pt-BR", pair[1]);
    assert.ok(pt && pt !== pair[1], "pt-BR label " + pair[1] + " must resolve");
  }
});

test("settings effect is session-only: defaults to off and never restores from disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-effect-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    assert.strictEqual(settings.DEFAULTS.effect, "off");
    assert.strictEqual(settings.load().effect, "off");
    settings.save(Object.assign(settings.load(), { effect: "noir" }));
    assert.strictEqual(settings.load().effect, "off");
    settings.save(Object.assign(settings.load(), { effect: "bogus-fx" }));
    assert.strictEqual(settings.load().effect, "off");
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings audioEffect is session-only: defaults to off and never restores from disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-audio-effect-"));
  const saved = settings.settingsPath;
  settings.settingsPath = () => path.join(dir, "settings.json");
  try {
    assert.strictEqual(settings.DEFAULTS.audioEffect, "off");
    assert.strictEqual(settings.load().audioEffect, "off");
    settings.save(Object.assign(settings.load(), { audioEffect: "reverb" }));
    assert.strictEqual(settings.load().audioEffect, "off");
    settings.save(Object.assign(settings.load(), { audioEffect: "bogus-af" }));
    assert.strictEqual(settings.load().audioEffect, "off");
  } finally {
    settings.settingsPath = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("shouldEncode forces a re-encode when an effect is active", () => {
  const base = {
    mode: "video", convert: false, auto_encode: true,
    trim: false, trim_method: "download",
  };
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { effect: "noir" }), true), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { effect: "mosh" }), false), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { effect: "off" }), true), false);
  assert.strictEqual(pipeline.shouldEncode(base, true), false);
});

test("shouldEncode forces a re-encode when an audio effect is active", () => {
  const base = {
    mode: "video", convert: false, auto_encode: true,
    trim: false, trim_method: "download",
  };
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { audio_effect: "bass" }), true), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { audio_effect: "reverse" }), false), true);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { audio_effect: "off" }), true), false);
  assert.strictEqual(pipeline.shouldEncode(Object.assign({}, base, { mode: "audio", audio_effect: "off" }), true), true);
});

test("effectArgs maps every experimental effect to a filter chain", () => {
  const vf = (e) => pipeline.effectArgs(e, false);
  assert.strictEqual(vf("off"), null);
  assert.strictEqual(vf(null), null);
  assert.strictEqual(vf(undefined), null);
  assert.strictEqual(vf(""), null);
  assert.strictEqual(vf("not-an-effect"), null);
  for (const e of ["smear", "mosh", "glitch", "vhs", "pixel", "tiny240", "poster", "noir", "crt", "trail"]) {
    assert.ok(vf(e), e + " must produce a descriptor");
  }
  assert.match(vf("smear").filterComplex, /blend=all_mode=difference/);
  assert.match(vf("glitch").vf, /rgbashift/);
  assert.match(vf("pixel").vf, /flags=neighbor/);
  assert.match(vf("tiny240").vf, /scale=-2:240/);
  assert.match(vf("noir").vf, /hue=s=0/);
  assert.match(vf("crt").vf, /geq/);
  assert.match(vf("trail").vf, /tmix/);
  assert.match(vf("poster").filterComplex, /palettegen/);
  assert.strictEqual(vf("mosh").prep, "mosh");
  assert.match(vf("mosh").filterComplex, /\[1:v\]/);
  assert.strictEqual(vf("mosh").longGop, true);
});

test("audioEffectArgs maps every audio effect to an -af chain", () => {
  const af = (e) => pipeline.audioEffectArgs(e);
  assert.strictEqual(af("off"), null);
  assert.strictEqual(af(null), null);
  assert.strictEqual(af(undefined), null);
  assert.strictEqual(af(""), null);
  assert.strictEqual(af("not-an-effect"), null);
  for (const e of ["echo", "reverb", "radio", "nightcore", "deep", "bass", "tremolo", "crush", "reverse"]) {
    assert.ok(typeof af(e) === "string" && af(e).length > 0, e + " must produce an -af chain");
  }
  assert.match(af("echo"), /aecho/);
  assert.match(af("reverb"), /aecho=0\.8:0\.88:60:0\.4/);
  assert.match(af("radio"), /highpass=f=300/);
  assert.match(af("nightcore"), /asetrate=44100\*1\.15/);
  assert.match(af("deep"), /asetrate=44100\*0\.85/);
  assert.match(af("bass"), /bass=g=6:f=100/);
  assert.match(af("tremolo"), /tremolo=f=5:d=0\.7/);
  assert.match(af("crush"), /acrusher/);
  assert.strictEqual(af("reverse"), "areverse");
});

test("videoEncoderArgs picks NVIDIA NVENC on GPU and libx264 on CPU", () => {
  const cpu = pipeline.videoEncoderArgs(false, 21, false);
  assert.deepStrictEqual(cpu, ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]);
  const gpu = pipeline.videoEncoderArgs(true, 18, false);
  assert.deepStrictEqual(gpu,
    ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "18", "-b:v", "0", "-pix_fmt", "yuv420p"]);
  const cpuLong = pipeline.videoEncoderArgs(false, 18, true);
  assert.ok(cpuLong.includes("-sc_threshold"), "CPU longGop keeps the x264 scene-cut option");
  assert.ok(cpuLong.includes("-bf"), "CPU longGop keeps -bf");
  const gpuLong = pipeline.videoEncoderArgs(true, 18, true);
  assert.ok(gpuLong.includes("-g"), "GPU longGop keeps the keyframe interval");
  assert.ok(!gpuLong.includes("sc_threshold"), "GPU path must drop the x264-only sc_threshold");
  assert.ok(!gpuLong.includes("-bf"), "GPU path must drop -bf");
});

test("effectArgs VHS degrades audio only when the source has audio", () => {
  const silent = pipeline.effectArgs("vhs", false);
  assert.ok(silent.vf, "silent VHS uses a plain -vf chain");
  assert.strictEqual(silent.filterComplex, undefined);
  assert.ok(silent.vf.includes("scale=-2:480"));
  const noisy = pipeline.effectArgs("vhs", true);
  assert.ok(noisy.filterComplex, "VHS with audio uses a graph");
  assert.strictEqual(noisy.vf, undefined);
  assert.ok(noisy.filterComplex.includes("amix"));
  assert.ok(noisy.filterComplex.includes("normalize=0"));
  assert.ok(noisy.filterComplex.includes("alimiter"));
  assert.ok(noisy.filterComplex.includes("aresample=22050"));
  assert.ok(noisy.filterComplex.includes("highpass=f=100"));
  assert.strictEqual(noisy.mapAudio, "[amix]");
  assert.strictEqual(noisy.shortest, true);
});

test("effectArgs pixel and tiny240 add lo-fi audio only when the source has audio", () => {
  for (const fx of ["pixel", "tiny240"]) {
    const silent = pipeline.effectArgs(fx, false);
    assert.ok(silent.vf, fx + " without audio stays a plain -vf chain");
    assert.strictEqual(silent.filterComplex, undefined);
    const noisy = pipeline.effectArgs(fx, true);
    assert.ok(noisy.filterComplex, fx + " with audio uses a graph");
    assert.strictEqual(noisy.vf, undefined);
    assert.ok(noisy.filterComplex.includes("[0:a]"), fx + " must filter the audio stream");
    assert.strictEqual(noisy.mapAudio, "[amix]");
  }
  assert.ok(pipeline.effectArgs("pixel", true).filterComplex.includes("aresample=11025"));
  assert.ok(pipeline.effectArgs("tiny240", true).filterComplex.includes("aresample=8000"));
  assert.ok(pipeline.effectArgs("tiny240", true).filterComplex.includes("channel_layouts=mono"));
});

test("pickOutFile stamps a unique timestamped output name", () => {
  const now = new Date(2026, 7, 5, 19, 8, 45);
  assert.strictEqual(
    pipeline.pickOutFile("C:/v/clip", false, now, () => false),
    "C:/v/clip-converted-20260805-190845.mp4"
  );
  assert.strictEqual(
    pipeline.pickOutFile("C:/v/clip", true, now, () => false),
    "C:/v/clip-20260805-190845.mp3"
  );
  const later = new Date(2026, 7, 5, 19, 8, 46);
  assert.notStrictEqual(
    pipeline.pickOutFile("C:/v/clip", false, later, () => false),
    "C:/v/clip-converted-20260805-190845.mp4"
  );
});

test("pickOutFile falls back to a numeric suffix on collision", () => {
  const now = new Date(2026, 7, 5, 19, 8, 45);
  const stem = "C:/v/clip-converted-20260805-190845";
  const exists = (p) => p === stem + ".mp4" || p === stem + "-2.mp4";
  assert.strictEqual(
    pipeline.pickOutFile("C:/v/clip", false, now, exists),
    stem + "-3.mp4"
  );
});

test("datamoshPrep produces a playable Xvid intermediate (needs ffmpeg)", { skip: !tools.checkTool("ffmpeg").ok }, async () => {
  const ffmpeg = tools.resolveTool("ffmpeg").cmd;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-mosh-"));
  const src = path.join(dir, "src.mp4");
  const st = require("node:child_process").spawnSync(ffmpeg,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2",
     "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
     "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-shortest", src],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st.status, 0, "test clip must be created");
  assert.ok(fs.existsSync(src));
  const cancelState = { cancelled: false, child: null };
  try {
    const avi = await pipeline.datamoshPrep(src, { trim: false }, cancelState, () => {});
    assert.ok(avi.endsWith(".avi"), "intermediate is an AVI");
    assert.ok(fs.statSync(avi).size > 0, "intermediate is not empty");
    const probe = require("node:child_process").spawnSync(ffmpeg,
      ["-i", avi], { encoding: "utf-8", windowsHide: true });
    const text = probe.stderr || "";
    assert.ok(/Video:/.test(text), "intermediate decodes as video");
    assert.ok(/_xvid|mpeg4/.test(text), "intermediate is Xvid/MPEG-4");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("audio effect in audio mode applies -af and yields a playable MP3 (needs ffmpeg)", { skip: !tools.checkTool("ffmpeg").ok }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-afx-mp3-"));
  const src = path.join(dir, "src.mp4");
  const st = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
     "-c:a", "aac", src],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st.status, 0, "test clip must be created");
  const cancelState = { cancelled: false, child: null };
  try {
    const out = await pipeline.encode(src,
      { mode: "audio", audio_quality: "128", audio_effect: "bass", auto_encode: true },
      cancelState, () => {});
    assert.ok(/\.mp3$/.test(out), "audio mode produces an mp3");
    const probe = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
      ["-i", out], { encoding: "utf-8", windowsHide: true });
    assert.ok(/Audio:/.test(probe.stderr || ""), "mp3 decodes with an audio stream");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("audio effect composes into a filter-graph effect and yields a playable MP4 (needs ffmpeg)", { skip: !tools.checkTool("ffmpeg").ok }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-afx-graph-"));
  const src = path.join(dir, "src.mp4");
  const st = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2",
     "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
     "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-shortest", src],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st.status, 0, "test clip must be created");
  const cancelState = { cancelled: false, child: null };
  try {
    const out = await pipeline.encode(src,
      { mode: "video", effect: "pixel", audio_effect: "echo", auto_encode: true },
      cancelState, () => {});
    assert.ok(/\.mp4$/.test(out), "video mode produces an mp4");
    const probe = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
      ["-i", out], { encoding: "utf-8", windowsHide: true });
    const text = probe.stderr || "";
    assert.ok(/Video:/.test(text), "mp4 decodes with a video stream");
    assert.ok(/Audio:/.test(text), "mp4 decodes with an audio stream");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GPU encode produces a playable H.264 MP4 (needs NVIDIA + ffmpeg)", { skip: !tools.detectGpu().available }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-gpu-"));
  const src = path.join(dir, "src.mp4");
  const st = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2",
     "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", src],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st.status, 0, "test clip must be created");
  const cancelState = { cancelled: false, child: null };
  try {
    const out = await pipeline.encode(src,
      { mode: "video", gpu_encode: true, auto_encode: true },
      cancelState, () => {});
    assert.ok(/\.mp4$/.test(out), "video mode produces an mp4");
    const probe = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
      ["-i", out], { encoding: "utf-8", windowsHide: true });
    const text = probe.stderr || "";
    assert.ok(/h264/.test(text), "mp4 is H.264 encoded");
    assert.ok(/Video:/.test(text), "mp4 decodes with a video stream");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("encode job emit events differ between concise and verbose modes", { skip: !tools.detectGpu().available }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grabtify-verbose-"));
  const src = path.join(dir, "src.mp4");
  const st = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1.5", src],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st.status, 0);

  // Concise mode test with its own source file
  const conciseDir = fs.mkdtempSync(path.join(dir, "concise-"));
  const conciseSrc = path.join(conciseDir, "src.mp4");
  const st2 = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1.5", conciseSrc],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st2.status, 0);
  const cancelState1 = { cancelled: false, child: null };
  const conciseLines = [];
  await pipeline.encode(conciseSrc,
    { mode: "video", verbose_log: false, auto_encode: true },
    cancelState1, (ev) => { if (ev.type === "log") conciseLines.push(ev.line); });
  assert.ok(conciseLines.find(l => l && l.trim()).includes("Converting"),
    "concise mode emits friendly wording ('Converting video…')");

  // Verbose mode test with its own source file
  const verboseDir = fs.mkdtempSync(path.join(dir, "verbose-"));
  const verboseSrc = path.join(verboseDir, "src.mp4");
  const st3 = require("node:child_process").spawnSync(tools.resolveTool("ffmpeg").cmd,
    ["-y", "-hide_banner", "-loglevel", "error",
     "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1.5", verboseSrc],
    { encoding: "utf-8", windowsHide: true });
  assert.strictEqual(st3.status, 0);
  const cancelState2 = { cancelled: false, child: null };
  const verboseLines = [];
  await pipeline.encode(verboseSrc,
    { mode: "video", verbose_log: true, auto_encode: true },
    cancelState2, (ev) => { if (ev.type === "log") verboseLines.push(ev.line); });
  assert.ok(verboseLines.find(l => l && l.includes("H.264")) ||
           verboseLines.find(l => l && l.includes("CRF")),
    "verbose mode emits detailed log line (CRF or codec info)");

  // Cleanup
  fs.rmSync(dir, { recursive: true, force: true });
});
