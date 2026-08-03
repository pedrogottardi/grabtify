"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pipeline = require("../js/pipeline");
const tools = require("../js/tools");
const settings = require("../js/settings");
const resolveApi = require("../js/resolve_api");
const validation = require("../js/validation");
const i18n = require("../js/i18n");
const updater = require("../js/updater");

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
  const before = settings.load();
  assert.ok(Object.prototype.hasOwnProperty.call(before, "quality"));
  assert.ok(Object.prototype.hasOwnProperty.call(before, "insertMode"));
  settings.save(Object.assign({}, before, { quality: "2160" }));
  const after = settings.load();
  assert.strictEqual(after.quality, "2160");
  settings.save(before);
  const restored = settings.load();
  assert.strictEqual(restored.quality, before.quality);
});

test("settings normalize stale preset and trim values", () => {
  const before = settings.load();
  settings.save(Object.assign({}, before, { preset: "Fast 1080p30", trimMethod: "handbrake" }));
  const after = settings.load();
  assert.strictEqual(after.preset, "crf21");
  assert.strictEqual(after.trimMethod, "download");
  settings.save(before);
});

test("settings normalize stale mode and audio quality values", () => {
  const before = settings.load();
  settings.save(Object.assign({}, before, { mode: "wav", audioQuality: "999" }));
  const after = settings.load();
  assert.strictEqual(after.mode, "video");
  assert.strictEqual(after.audioQuality, "192");
  settings.save(before);
});

test("settings autoEncode defaults true and round-trips", () => {
  assert.strictEqual(settings.DEFAULTS.autoEncode, true);
  const before = settings.load();
  assert.strictEqual(typeof before.autoEncode, "boolean");
  settings.save(Object.assign({}, before, { autoEncode: !before.autoEncode }));
  assert.strictEqual(settings.load().autoEncode, !before.autoEncode);
  settings.save(before);
  assert.strictEqual(settings.load().autoEncode, before.autoEncode);
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
