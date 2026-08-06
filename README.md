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

> **Requires DaVinci Resolve Studio (paid).** Grabtify is a Workflow Integration
> plugin, and Workflow Integrations are a Studio-only feature — the free Resolve
> does not load them, so the panel never appears there.

## ⚡ Quick start

1. **Download the release zip** and extract it anywhere.
2. **Run `install.bat`** and accept the UAC prompt.
3. **In Resolve Studio**, open **Workspace → Workflow Integrations → Grabtify**.

<p align="center">
<img src="https://i.postimg.cc/25cLKRwM/screenshot.png" alt="Grabtify">
</p>

## How it works

<p align="center">
<img src="https://i.postimg.cc/wMWX5yrN/howitworks.png" alt="How it works">
</p>

Downloads already prefer H.264/AAC MP4, so the encode pass runs only when you
opt in (re-encode, audio mode, or an encode-time trim) or the file uses an
unusual codec.

<details>
<summary><strong>📑 Table of contents</strong></summary>

- [🚀 Features](#-features)
- [✅ Requirements](#-requirements)
- [📦 Install](#-install)
- [🗑 Uninstall](#-uninstall)
- [🎬 Usage](#-usage)
- [🧪 Experimental Effects](#-experimental-effects)
- [⚡ GPU Acceleration](#-gpu-acceleration)
- [🔄 Binary Auto-Updates](#-binary-auto-updates)
- [⚙ Settings](#-settings)
- [🛠 Troubleshooting](#-troubleshooting)
- [🔒 Privacy & Legal](#-privacy--legal)
- [☕ Support](#-support)
- [📄 License](#-license)

</details>

## 🚀 Features

- **One-click grab** — paste a URL, hit *Grabtify to timeline*.
- **Quality cap** — best available, or up to 2160p / 1440p / 1080p / 720p.
- **Audio-only mode** — extract MP3 at 128 / 192 / 320 kbps.
- **Optional trim** — set in/out timecodes, cut either during download
  (fast) or during encoding (precise).
- **Optional re-encode** — normalize to H.264/AAC MP4 at Good / Balanced /
  Fast presets. Unusual codecs are converted automatically so Resolve never
  chokes on a downloaded file.
- **Three insert modes** — at the playhead, at the end of the sequence, or
  into the media pool only (files land in a `Grabtify` bin).
- **Live progress** — stage strip, progress bar, and a scrollable job console
  with real yt-dlp/ffmpeg output. Cancel mid-download.
- **Readiness check** — the Settings panel shows whether Resolve, yt-dlp, and
  ffmpeg are reachable before you start a job.
- **Bilingual** — English and Brazilian Portuguese.
- **🎞 Video Effects (Experimental)** — 10 creative filters: Datamosh (smear/true), Glitch/RGB split, VHS, Pixel/Tiny 240p, Posterize, Noir, CRT scanlines, Motion trails. Each forces a re-encode.
- **🔊 Audio Effects (Experimental)** — 10 audio processors: Echo, Reverb, Radio/telephone, Nightcore (speed up), Deep/slowed, Bass boost, Tremolo, Bitcrush, Reverse. Works in both Video and Audio modes.
- **⚡ GPU Acceleration (NVIDIA)** — Hardware encode via `h264_nvenc` with Auto/On/Off modes. Auto detects GPU and falls back to CPU seamlessly.
- **🔄 Binary Auto-Updates** — In-app updater for yt-dlp, ffmpeg, ffprobe, deno. Checks latest versions from GitHub/Gyan.dev, downloads, and applies via UAC elevation.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ✅ Requirements

- **Windows 10 or 11**
- **DaVinci Resolve Studio ≥ 19.0.2** — Workflow Integration plugins are a
  Studio feature and do not exist in the free Resolve
- **Internet on first install** — the installer downloads `yt-dlp.exe`,
  `ffmpeg.exe`, `ffprobe.exe`, and `deno.exe` into the plugin folder the first time you
  run it (skipped if they are already present or on your `PATH`)
- **Administrator rights once**, for the installer (it writes under
  `C:\ProgramData\Blackmagic Design`)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 📦 Install

1. **Download the release zip** and extract it anywhere.
2. **Run `install.bat`.** 
3. **In Resolve Studio**, open **Workspace → Workflow Integrations →
   Grabtify**.

Re-run `install.bat` any time you update the plugin or move Resolve — it is
idempotent.

<details>
<summary><strong>Manual install (without install.bat)</strong></summary>

If you would rather place the files yourself:

1. **Close DaVinci Resolve.**
2. **Copy the plugin into Resolve's Workflow Integration folder.** The
   destination folder must be named exactly `com.grabtify.plugin`:
   `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow
   Integration Plugins\com.grabtify.plugin`
   Copy only the runtime files — `manifest.xml`, `package.json`, `index.html`,
   `main.js`, `preload.js`, `newico.png`, and the `css`, `js`, and `bin`
   folders. Skip `install.bat`, `uninstall.bat`, `README.md`, `LICENSE`, and
   `.gitignore`. Writing under `ProgramData` needs administrator rights;
   accept the UAC prompt if Explorer asks.
3. **Make sure `WorkflowIntegration.node` sits next to `main.js`.** Resolve
   Studio usually provisions it on its own, but if the panel reports
   "Resolve not ready", get it from Resolve's **Help → Documentation →
   Developer** ("Workflow Integration Plugins" package) and copy
   `WorkflowIntegration.node` into the plugin folder.
4. **Install the command-line tools** into `bin\win\` (or anywhere on your
   `PATH`):
   - `yt-dlp.exe` — <https://github.com/yt-dlp/yt-dlp/releases/latest>
   - `ffmpeg.exe` and `ffprobe.exe` — an FFmpeg build such as
     <https://www.gyan.dev/ffmpeg/builds/> (extract both from the "essentials"
     archive)
   - `deno.exe` — <https://github.com/denoland/deno/releases/latest>
5. **Restart DaVinci Resolve Studio**, then open **Workspace → Workflow
   Integrations → Grabtify**.

> The folder name must match `com.grabtify.plugin` exactly, or Resolve will not
> load the plugin.

</details>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🗑 Uninstall

Run `uninstall.bat` and confirm. It removes the plugin folder
(`com.grabtify.plugin`) from Resolve's Workflow Integration directory.
Downloaded clips and your settings are left untouched.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🎬 Usage

1. Open a project with an active timeline.
2. Paste a link into the URL field (YouTube, Instagram, Vimeo, Twitch, most
   sites yt-dlp supports). The panel fetches the video title while you type.
3. Pick a mode (**Video MP4** or **Audio MP3**), quality cap, and insert mode.
4. **Optional:** open *Experimental* and choose a **Video effect** and/or
   **Audio effect** — these force a re-encode and override normal quality
   settings.
5. **Optional:** open *Trim clip* and set in/out timecodes.
6. **Optional:** in Settings → Video, set **GPU acceleration** to Auto (default),
   On (force NVENC), or Off (CPU only).
7. Press **Grabtify to timeline**.

The job console streams progress; **Cancel** stops the download and kills the
tool process tree. When it finishes, the clip is in the media pool's
`Grabtify` bin and, depending on the insert mode, on the timeline.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🧪 Experimental Effects

Effects are marked **Experimental** because they use complex ffmpeg filter
graphs that may behave unexpectedly on unusual inputs. They always force the
re-encode stage (the panel enables "Encode to MP4" automatically) and replace
the normal quality/preset settings.

<details>
<summary><strong>Video Effects (10)</strong></summary>

| ID | Label | Description |
|----|-------|-------------|
| `off` | Off (no effect) | No filter applied |
| `smear` | Datamosh - smear (1 pass) | Removes I-frames for a smearing/melting look |
| `mosh` | Datamosh - true (2 passes) | Full datamosh: exports AVI, strips keyframes, re-imports |
| `glitch` | Glitch / RGB split | RGB channel offset with noise and displacement |
| `vhs` | VHS (lo-fi audio) | Scanlines, chroma noise, static, + audio degradation |
| `pixel` | Pixel / tiny resolution | Blocky pixelation with nearest-neighbor scaling |
| `tiny240` | Very small (240p) | Downscales to 240p, adds lo-fi audio when source has audio |
| `poster` | Posterize / 8-color dither | Reduces to 8 colors with Bayer dithering |
| `noir` | Grainy B&W / noir | Desaturates, adds film grain, lifts shadows |
| `crt` | CRT scanlines | Phosphor glow, scanlines, vignette, curvature |
| `trail` | Motion trails | Frame blending with echo/feedback for motion trails |

</details>

<details>
<summary><strong>Audio Effects (10)</strong></summary>

| ID | Label | Description |
|----|-------|-------------|
| `off` | Off (no effect) | No filter applied |
| `echo` | Echo | Delay with feedback and decay |
| `reverb` | Reverb hall | Large hall reverb via `aecho` chain |
| `radio` | Radio / telephone | Bandpass filter (300–3400 Hz) + compression |
| `nightcore` | Nightcore (speed up) | +25% tempo, pitch shifted up |
| `deep` | Deep / slowed down | -25% tempo, pitch shifted down |
| `bass` | Bass boost | Low-shelf EQ +12 dB below 150 Hz |
| `tremolo` | Tremolo | Amplitude modulation at 6 Hz |
| `crush` | Bitcrush | Reduces bit depth to 8-bit, downsample to 11 kHz |
| `reverse` | Reverse | Reverses audio completely |

> Audio effects apply in **both** Video (MP4) and Audio (MP3) modes.

</details>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ⚡ GPU Acceleration

Grabtify can use your NVIDIA GPU's hardware encoder (`h264_nvenc`) for
dramatically faster H.264 encoding — often 3–5× realtime on modern GPUs.

<details>
<summary><strong>Modes</strong></summary>

| Mode | Value | Behavior |
|------|-------|----------|
| **Auto** (default) | `auto` | Detects NVIDIA GPU on startup. Uses NVENC if available; silently falls back to CPU (libx264) if not. |
| **On** | `on` | Forces NVENC. If GPU becomes unavailable mid-job, shows a warning in the console and retries on CPU. |
| **Off** | `off` | Always uses CPU encoder (libx264). |

</details>

**How it works:**
- GPU detection runs once at panel load (cached for the session).
- The `gpu_encode` flag is sent with each job; the pipeline selects `-c:v h264_nvenc` vs `-c:v libx264`.
- GPU encoding uses CQ (constant quality) mapped from your CRF preset; keyframe interval (`-g`) is preserved.
- **Requirements:** NVIDIA GPU with NVENC support (Kepler / GTX 600 series or newer), up-to-date drivers.
- **Fallback:** If NVENC initialization fails, the job logs "GPU encoding failed — retrying with CPU" and continues transparently.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🔄 Binary Auto-Updates

Grabtify includes an in-app updater for its bundled command-line tools:
**yt-dlp**, **ffmpeg** / **ffprobe**, and **deno**.

<details>
<summary><strong>How it works</strong></summary>

1. Open **Settings → System check** and click **Check for updates**.
2. The panel queries:
   - yt-dlp: GitHub latest release tag
   - deno: GitHub latest release tag
   - ffmpeg: Gyan.dev release version endpoint
3. For each tool with a newer version available, you see:
   - Current version (from `--version` output)
   - Latest version
   - "Update now" / "Later" buttons
4. Confirming **Update now** triggers a UAC prompt (Windows only).
5. The updater downloads the new binaries (same sources as `install.bat`),
   extracts if zipped, and atomically replaces files in `bin\win\` via
   an elevated PowerShell copy.
6. Progress shows: *downloading → extracting → applying → updated*.
7. On success, the System check chips refresh to "up to date".

</details>

**Notes:**
- Updates run **only on Windows** (macOS/Linux users manage tools via package managers).
- A running job blocks the update — finish or cancel first.
- The check respects a 24-hour snooze; click **Check again** to force.
- Tools found on your system `PATH` (not bundled) show "on PATH — update manually" and are skipped.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ⚙ Settings

Open the gear icon. Settings persist across sessions in
`%APPDATA%\Grabtify\settings.json`:

- **General** — interface language (English / Português (Brasil))
- **Video** — trim timing (during download vs during encode), encode quality,
  automatic encoding, always-encode-to-MP4, **Video effect**, **GPU acceleration (Auto/On/Off)**
- **Audio** — **Audio effect**
- **Storage** — where downloads are saved (default `Documents\Grabtify`)
- **System check** — live status of Resolve binding, yt-dlp, ffmpeg, deno, GPU
- **Updates** — **Check for updates** button, version comparison, update logs

> **Video effect** and **Audio effect** are *per-session* — they reset to "Off"
> when you close the panel, so each job starts clean.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🛠 Troubleshooting

**The panel never appears in Workspace → Workflow Integrations.** You are on
the free DaVinci Resolve. Workflow Integration plugins are a Studio-only
feature; Grabtify requires the paid **Resolve Studio** (≥ 19.0.2).

**The Resolve status stays red / "Resolve not ready".** The panel was opened
outside Resolve (double-clicking `main.js` will never work), or Resolve
Studio isn't running with a project open, or `WorkflowIntegration.node` is
missing next to `main.js`. Re-run `install.bat` after making sure Resolve is
installed; if the script could not find the `.node` file, grab it from
**Help → Documentation → Developer** ("Workflow Integration Plugins" package)
and copy it into `com.grabtify.plugin`.

**The yt-dlp / ffmpeg / deno chips are red.** The installer downloads them into
`bin\win\`. Antivirus sometimes quarantines freshly downloaded command-line
tools — add an exclusion for the plugin folder, re-run `install.bat`, or
install yt-dlp and ffmpeg yourself and let the plugin pick them up from your
`PATH`.

**The panel opens but a job fails right after "Encoded: …".** That is the
Resolve handoff (`importAndInsert`). Copy the job console log — it states
whether the import or the timeline insert failed.

**Duplicate plugin in the menu.** An older copy may linger. Delete
`C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow
Integration Plugins\com.grabtify.plugin` and re-run `install.bat`.

**"GPU encoding failed — retrying with CPU" appears in the log.** Your NVIDIA
GPU may be busy, drivers outdated, or NVENC session limit reached. The job
continues on CPU automatically. In Settings, try switching GPU acceleration
to "Off" to silence the fallback.

**An effect is selected but the output looks unchanged.** Some effects (e.g.,
VHS, pixel, tiny240) degrade audio only when the source *has* audio. If the
input is silent, the audio portion of the effect is skipped. Video filters
always apply.

**Update check shows "The update prompt was cancelled or timed out".** The UAC
elevation prompt has a 2-minute timeout. Accept it promptly, or re-run the
update check. Ensure you have administrator rights.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🔒 Privacy & Legal

- Everything runs locally. No account, no telemetry, no analytics, no
  third-party servers — the only outbound requests are yt-dlp hitting the
  site you asked it to download from, and the **update checker** querying
  GitHub (yt-dlp, deno) and Gyan.dev (ffmpeg) for latest version numbers.
- Fetch only videos you own or are licensed to download. Most platforms'
  terms restrict downloading, and this tool does not bypass DRM.
- The bundled CLI tools are third-party open-source software:
  **yt-dlp** (Unlicense, <https://github.com/yt-dlp/yt-dlp>) and
  **FFmpeg** (LGPL/GPL, <https://ffmpeg.org>). Their binaries are downloaded
  from their official distributions at install/update time.
- **Deno** (MIT, <https://deno.land>) is downloaded from the official
  denoland/deno GitHub releases.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## ☕ Support

Found a bug or want a feature? Open an issue. If this saves you time,
[buy me a coffee](https://ko-fi.com/pedrogott) — it keeps the project going.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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