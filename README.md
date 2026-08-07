<a name="readme-top"></a>

<p align="center">
  <img src="https://i.postimg.cc/mkhzsddd/header.png" alt="Grabtify" width="100%">
</p>

<p align="center">
  <em>Grab a web video and drop it straight onto your DaVinci Resolve timeline.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OS-Windows-00d4ff" alt="Windows">
  <img src="https://img.shields.io/badge/Resolve%20Studio-19.0.2%2B-00d4ff" alt="Requires DaVinci Resolve Studio 19.0.2+">
  <img src="https://img.shields.io/badge/Version-1.0-00d4ff" alt="Version 1.0">
  <img src="https://img.shields.io/badge/License-MIT-00d4ff" alt="License MIT">
  <a href="https://ko-fi.com/pedrogott"><img src="https://img.shields.io/badge/Support-ko--fi-00d4ff" alt="Support on ko-fi"></a>
  <br>
  <img src="https://img.shields.io/badge/Video%20Effects-10-00d4ff" alt="Video Effects">
  <img src="https://img.shields.io/badge/Audio%20Effects-10-00d4ff" alt="Audio Effects">
  <img src="https://img.shields.io/badge/GPU-NVIDIA%20NVENC-00d4ff" alt="GPU Acceleration">
  <img src="https://img.shields.io/badge/Auto%20Updates-In--app-00d4ff" alt="Auto Updates">
</p>

Grabtify is a **DaVinci Resolve Workflow Integration plugin** for Windows. You
paste a link, it downloads the clip with **yt-dlp**, optionally trims it and
re-encodes it with **ffmpeg**, then imports the file into your project and
inserts it at the playhead — without leaving Resolve.

It runs inside Resolve's embedded Electron runtime, so there is no Python, no
separate window to babysit, and no configuration beyond a single `install.bat`.

> **Requires DaVinci Resolve Studio (paid).** Workflow Integrations are a
> Studio-only feature — the free Resolve does not load them.

## ⚡ Quick start

1. **Download the release zip** and extract it anywhere.
2. **Run `install.bat`** and accept the UAC prompt.
3. **In Resolve Studio**, open **Workspace → Workflow Integrations → Grabtify**.

<p align="center">
<img src="https://i.postimg.cc/25cLKRwM/screenshot.png" alt="Grabtify">
</p>

## How it works

<p align="center">
<img src="https://i.postimg.cc/wMWX5yrN/howitworks.png" alt="How it works" width="100%">
</p>

Downloads prefer H.264/AAC MP4, so encoding runs only when you opt in (re-encode,
audio mode, encode-time trim, or an effect) or the file uses an unusual codec.

<details>
<summary><strong>📑 Table of contents</strong></summary>

- [🚀 Features](#-features)
- [✅ Requirements](#-requirements)
- [📦 Install](#-install)
- [🗑 Uninstall](#-uninstall)
- [🎬 Usage](#-usage)
- [⚙ Settings](#-settings)
- [🛠 Troubleshooting](#-troubleshooting)
- [🔒 Privacy & Legal](#-privacy--legal)
- [☕ Support](#-support)
- [📄 License](#-license)

</details>

## 🚀 Features

| Category | Capabilities |
|----------|--------------|
| **Core** | One-click grab • Quality cap (best/2160p/1440p/1080p/720p) • Audio-only MP3 (128/192/320 kbps) • Optional trim (download-time fast cut or encode-time precise cut) • Optional re-encode (Good/Balanced/Fast) • 3 insert modes (playhead, append, bin-only) • Live progress with cancel • Bilingual (EN/PT-BR) |
| **Experimental Effects** | **10 Video**: Datamosh (smear/true), Glitch/RGB split, VHS, Pixel, Tiny 240p, Posterize, Noir, CRT scanlines, Motion trails • **10 Audio**: Echo, Reverb, Radio, Nightcore, Deep, Bass boost, Tremolo, Bitcrush, Reverse • All force re-encode, apply in both video & audio modes |
| **GPU Acceleration** | NVIDIA NVENC (`h264_nvenc`) with **Auto** (default, detects GPU), **On** (force), **Off** (CPU). Auto-fallback to CPU. 3–5× faster on modern GPUs. |
| **Binary Auto-Updates** | In-app updater for yt-dlp, ffmpeg/ffprobe, deno. Checks GitHub/Gyan.dev, downloads, applies via UAC. Windows only. Respects 24h snooze. |

## ✅ Requirements

- **Windows 10 or 11**
- **DaVinci Resolve Studio ≥ 19.0.2**
- **Internet on first install** — downloads yt-dlp, ffmpeg, ffprobe, deno into `bin\win\`
- **Administrator rights once** (writes to `C:\ProgramData\Blackmagic Design`)
- **NVIDIA GPU (optional)** — for NVENC hardware encoding; falls back to CPU automatically

## 📦 Install

1. **Download the release zip** and extract it anywhere.
2. **Run `install.bat`.** Accept UAC. It checks system, copies plugin to Resolve's Workflow Integration folder, locates `WorkflowIntegration.node`, downloads tools to `bin\win\` if missing.
3. **In Resolve Studio**, open **Workspace → Workflow Integrations → Grabtify**.

Re-run `install.bat` anytime to update or after moving Resolve — it's idempotent.

<details>
<summary><strong>Manual install (without install.bat)</strong></summary>

1. Close DaVinci Resolve.
2. Copy runtime files to `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.grabtify.plugin` (exact folder name required). Files: `manifest.xml`, `package.json`, `index.html`, `main.js`, `preload.js`, `newico.png`, `css/`, `js/`, `bin/`.
3. Ensure `WorkflowIntegration.node` sits next to `main.js` (get from Help → Documentation → Developer → "Workflow Integration Plugins" if missing).
4. Install tools to `bin\win\` or PATH: yt-dlp.exe, ffmpeg.exe, ffprobe.exe, deno.exe.
5. Restart Resolve Studio.

</details>

## 🗑 Uninstall

Run `uninstall.bat` and confirm. Removes the plugin folder only. Downloads and settings are kept.

## 🎬 Usage

1. Open a project with an active timeline.
2. Paste a link (YouTube, Instagram, Vimeo, Twitch, etc.). Title fetches as you type.
3. Pick **Video MP4** or **Audio MP3**, quality cap, insert mode.
4. **Optional:** *Experimental* → choose **Video effect** and/or **Audio effect** (forces re-encode).
5. **Optional:** *Trim clip* → set in/out timecodes.
6. **Optional:** Settings → Video → **GPU acceleration**: Auto (default) / On / Off.
7. Press **Grabtify to timeline**.

Console streams progress; **Cancel** kills the process tree. Result lands in the `Grabtify` bin and on timeline (per insert mode).

## ⚙ Settings

Open the gear icon. Persisted in `%APPDATA%\Grabtify\settings.json`:

| Tab | Options |
|-----|---------|
| **General** | Language (English / Português) |
| **Video** | Trim timing (download vs encode) • Encode quality • Auto-encode • Always encode to MP4 • **Video effect** • **GPU acceleration (Auto/On/Off)** |
| **Audio** | **Audio effect** |
| **Storage** | Download folder (default `Documents\Grabtify`) |
| **System check** | Live status: Resolve, yt-dlp, ffmpeg, deno, GPU |
| **Updates** | **Check for updates** button, version comparison, update logs |

> **Video effect** and **Audio effect** are *per-session* — they reset to "Off" when the panel closes.

## 🛠 Troubleshooting

<details>
<summary><strong>Panel doesn't appear in Workspace → Workflow Integrations</strong></summary>
You're on free DaVinci Resolve. Workflow Integrations require **Resolve Studio ≥ 19.0.2**.
</details>

<details>
<summary><strong>Resolve status stays red / "Resolve not ready"</strong></summary>
Panel opened outside Resolve (double-clicking `main.js` won't work), or Resolve Studio isn't running with a project open, or `WorkflowIntegration.node` is missing next to `main.js`. Re-run `install.bat`; if it can't find the `.node` file, get it from **Help → Documentation → Developer** → "Workflow Integration Plugins" and copy it into `com.grabtify.plugin`.
</details>

<details>
<summary><strong>yt-dlp / ffmpeg / deno chips are red</strong></summary>
Installer downloads them to `bin\win\`. Antivirus may quarantine them — add exclusion, re-run `install.bat`, or install tools manually and let plugin pick them up from PATH.
</details>

<details>
<summary><strong>Job fails after "Encoded: …"</strong></summary>
Failure in Resolve handoff (`importAndInsert`). Copy the job console log — it states whether import or timeline insert failed.
</details>

<details>
<summary><strong>Duplicate plugin in menu</strong></summary>
Delete `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.grabtify.plugin` and re-run `install.bat`.
</details>

<details>
<summary><strong>"GPU encoding failed — retrying with CPU" in log</strong></summary>
GPU busy, drivers outdated, or NVENC session limit reached. Job continues on CPU automatically. In Settings → Video, set GPU acceleration to "Off" to silence the fallback.
</details>

<details>
<summary><strong>Effect selected but output looks unchanged</strong></summary>
Some effects (VHS, pixel, tiny240) degrade audio only when the source *has* audio. Silent input skips audio portion. Video filters always apply.
</details>

<details>
<summary><strong>Update check: "The update prompt was cancelled or timed out"</strong></summary>
UAC elevation prompt has a 2-minute timeout. Accept promptly, or re-run update check. Ensure you have administrator rights.
</details>

## 🔒 Privacy & Legal

- **Local only.** No account, telemetry, analytics, or third-party servers. Outbound requests: yt-dlp to the site you download from; update checker to GitHub (yt-dlp, deno) and Gyan.dev (ffmpeg) for version numbers.
- **Download responsibly.** Fetch only videos you own or are licensed to download. Platform terms restrict downloading; this tool does not bypass DRM.
- **Bundled tools:** yt-dlp (Unlicense), FFmpeg (LGPL/GPL), Deno (MIT). Downloaded from official sources at install/update time.

## ☕ Support

Found a bug or want a feature? Open an issue. If this saves you time,
[buy me a coffee](https://ko-fi.com/pedrogott) — it keeps the project going.

## 📄 License

[MIT](LICENSE).

---

<p align="center">
  <a href="#readme-top">Back to top ⤴</a>
</p>

<!-- Badge reference links -->
[windows-badge]: https://img.shields.io/badge/OS-Windows-00d4ff
[resolve-badge]: https://img.shields.io/badge/Resolve%20Studio-19.0.2%2B-00d4ff
[version-badge]: https://img.shields.io/badge/Version-1.0-00d4ff
[license-badge]: https://img.shields.io/badge/License-MIT-00d4ff
[kofi-badge]: https://img.shields.io/badge/Support-ko--fi-00d4ff
[video-fx-badge]: https://img.shields.io/badge/Video%20Effects-10-00d4ff
[audio-fx-badge]: https://img.shields.io/badge/Audio%20Effects-10-00d4ff
[gpu-badge]: https://img.shields.io/badge/GPU-NVIDIA%20NVENC-00d4ff
[autoupdate-badge]: https://img.shields.io/badge/Auto%20Updates-In--app-00d4ff