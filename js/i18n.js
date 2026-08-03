/* Grabtify — UI and job-message translations.
 *
 * Dual-mode like validation.js: CommonJS for the Electron main process and
 * node --test, plain <script> for the sandboxed renderer (window.GrabtifyI18n).
 * The selected language is kept in memory; main.js and app.js call
 * setLanguage() when settings load or change. Defaults to English so the
 * command-line tools and existing tests keep their expected output.
 */
"use strict";

(function () {
  const MESSAGES = {
    en: {
      "status.pastePrompt": "> paste a link, then [grabtify to timeline]",
      "status.fetchingTitle": "fetching title",
      "status.notReady": "Backend not ready yet — wait a moment.",
      "status.finishedOk": "Done.",
      "status.finishedFail": "Failed.",
      "status.bootFailed": "Boot failed: {0}",
      "status.couldNotStart": "Could not start: {0}",
      "status.checking": "checking…",
      "status.ready": "ready",
      "status.missing": "missing",

      "stage.fetch": "FETCH",
      "stage.encode": "ENCODE",

      "boot.loadingAria": "Loading",
      "boot.loading": "loading…",
      "boot.ready": "Grabtify ready.",
      "boot.toolsNote": "Tools are used from bin/ when present, otherwise from PATH.",
      "boot.jobStarted": "Job started {0}",
      "boot.cancelling": "Cancelling…",

      "form.videoLink": "Video link",
      "form.urlPh": "https://www.youtube.com/watch?v=…",
      "form.timePh": "0:00 or 0:00:00",
      "form.mode": "Mode",
      "form.inPoint": "In point",
      "form.outPoint": "Out point",
      "form.trim": "Trim clip",
      "form.optional": "(optional)",
      "form.clear": "clear",
      "form.clearTitle": "Clear the in/out points",
      "form.maxQuality": "Quality",
      "form.audioQuality": "Audio quality",
      "form.insertAt": "Insert clip at",
      "form.encodeNotice": "→ \"Encode to MP4\" will be turned on for this job",
      "form.grab": "Grabtify to timeline",
      "form.cancel": "Cancel",
      "form.openFolder": "Open folder",
      "form.language": "Language",

      "settings.title": "Settings",
      "settings.general": "General",
      "settings.video": "Video",
      "settings.storage": "Storage",
      "settings.system": "System check",
      "settings.trimTiming": "Trim timing",
      "settings.encodeQuality": "Encode quality",
      "settings.autoEncode": "Encode automatically",
      "settings.autoEncodeNote": "Converts unusual formats to H.264 MP4.",
      "settings.encodeToMp4": "Always encode to MP4",
      "settings.saveTo": "Save downloads to",
      "settings.browse": "Choose…",
      "settings.recheck": "Check again",
      "settings.checkUpdates": "Check for updates",
      "settings.toolsTitle": "Tools this panel drives",
      "settings.roleResolve": "DaVinci Resolve",
      "settings.roleYtdlp": "Downloader",
      "settings.roleFfmpeg": "Encoder",
      "settings.roleDeno": "JS runtime (YouTube)",
      "settings.summary": "Ready: {0} of {1}",
      "settings.support": "Support the project",
      "settings.kofi": "Buy me a coffee!",

      "updates.title": "Binary updates",
      "updates.sub": "Newer versions are available for the bundled tools.",
      "updates.note": "Updating replaces the tools in bin\\win. You will be asked to confirm once.",
      "updates.updateNow": "Update now",
      "updates.later": "Later",
      "updates.upToDate": "up to date",
      "updates.onPath": "on PATH — update manually",
      "updates.unknown": "version unknown",
      "updates.stateDownloading": "downloading {0}%",
      "updates.stateExtracting": "extracting…",
      "updates.stateApplying": "applying…",
      "updates.stateDone": "updated",
      "updates.stateFailed": "failed",
      "updates.noUpdate": "All bundled tools are up to date.",
      "updates.jobRunning": "A job is still running. Finish it before updating the tools.",
      "updates.elevateTimeout": "The update prompt was cancelled or timed out.",
      "updates.macManual": "In-app updates are supported on Windows only.",

      "console.jobLog": "Job log",

      "legal.text": "Fetch only videos you own or are licensed to download. " +
        "Most platforms' terms restrict downloading, and this tool does not bypass DRM.",

      "validation.urlError": "Enter a full http(s) link first.",
      "validation.timecodeError": "Timecodes look like 90, 1:30, or 1:02:03.",

      "opt.best": "Best available",
      "opt.q2160": "Up to 2160p",
      "opt.q1440": "Up to 1440p",
      "opt.q1080": "Up to 1080p",
      "opt.q720": "Up to 720p",
      "opt.a128": "128 kbps (smaller file)",
      "opt.a192": "192 kbps (recommended)",
      "opt.a320": "320 kbps (best quality)",
      "opt.video": "Video MP4",
      "opt.audio": "Audio MP3",
      "opt.playhead": "Insert at playhead",
      "opt.append": "Append to end of sequence",
      "opt.bin": "Project bin only",
      "opt.downloadTrim": "Fast copy cut (local)",
      "opt.ffmpegTrim": "During encode (slower, more precise)",
      "opt.crf18": "Good quality (CRF 18)",
      "opt.crf21": "Balanced (CRF 21)",
      "opt.crf23": "Fast (CRF 23)",

      "lang.en": "English",
      "lang.ptBR": "Português (Brasil)",

      "tools.failed": "Failed",
      "tools.noInfo": "no info",
      "tools.noTitle": "No title returned.",
      "tools.ytdlpFailed": "yt-dlp failed.",
      "tools.couldNotStart": "Could not start {0}: {1}",
      "tools.hintWin": "{0} was not bundled and is not on PATH. Reinstall " +
        "Grabtify or copy the missing binary into bin\\win\\.",
      "tools.hintMac": "This build has no macOS copy of {0}. Either install the " +
        "tools with Homebrew (brew install yt-dlp ffmpeg) and reopen the panel, " +
        "or rebuild Grabtify after filling bin/mac/.",

      "job.starting": "starting…",
      "job.cancelled": "Cancelled.",
      "job.contacting": "Contacting site…",
      "job.fetchingFrom": "Fetching from {0}…",
      "job.downloadTrim": "Cutting to {0}–{1} (fast copy, needs ffmpeg).",
      "job.cutToEnd": "end",
      "job.cutting": "Cutting…",
      "job.cuttingPct": "Cutting {0}%",
      "job.cutDone": "Cut complete — {0}",
      "job.alreadyDownloaded": "Already downloaded: {0}",
      "job.fetchingPct": "Fetching {0}%",
      "job.startYtdlp": "Could not start yt-dlp ({0}). {1}",
      "job.ytdlpExit": "yt-dlp exited with code {0}, see the log above.",
      "job.instagramHint": " Instagram support lives inside yt-dlp and Instagram " +
        "changes its site often, so this usually means the bundled yt-dlp is out " +
        "of date. Refresh it and try again. Some reels also require being logged " +
        "in, which this panel does not do.",
      "job.noOutput": "Download finished but the output file could not be " +
        "located. Files in the output folder: {0}",
      "job.folderMissing": "(folder missing)",
      "job.downloaded": "Downloaded: {0}",
      "job.encodingPct": "Encoding {0}%",
      "job.encoding": "Encoding…",
      "job.encodeClash": "A previous converted file is in use (probably open in " +
        "Resolve); writing a new file instead.",
      "job.encodeTrimStart": "Trimming at encode: start {0}s",
      "job.encodeTrimDur": ", duration {0}s",
      "job.encodingAudio": "Encoding {0} to MP3 {1}k",
      "job.encodingVideo": "Encoding {0} to H.264 CRF {1}",
      "job.startFfmpeg": "Could not start ffmpeg ({0}). {1}",
      "job.timestamps": "Please make sure the in/out timestamps are correct and " +
        "inside the video's length, then try again.",
      "job.ffmpegExit": "ffmpeg exited with code {0}, see the log above.",
      "job.encoded": "Encoded: {0}",
      "job.removedRaw": "Removed raw download.",
      "job.couldNotRemove": "Could not remove the raw download: {0}",
      "job.importing": "importing…",
      "job.handoff": "Handing off to Resolve…",
      "job.donePlayhead": "Done — clip inserted at the playhead.",
      "job.doneAppend": "Done — clip appended to the end of the sequence.",
      "job.doneBinNoseq": "Done — imported to the bin (no sequence was open).",
      "job.doneBin": "Done — clip imported to the \"{0}\" bin.",

      "resolve.notRunning": "Not running inside Resolve. Launch this plugin from " +
        "DaVinci Resolve Studio's Workspace → Workflow Integrations menu.",
      "resolve.connected": "Resolve Studio is connected.",
      "resolve.notResponding": "Resolve is not responding.",
      "resolve.missingModule": "WorkflowIntegration.node is missing. Reinstall " +
        "Grabtify or run deploy.bat after adding the module (see README).",
      "resolve.bindFailRunning": "Could not bind to DaVinci Resolve. Open the " +
        "plugin while Resolve Studio is running.",
      "resolve.bindFailRunning2": "Could not bind to DaVinci Resolve. Is Resolve " +
        "Studio running?",
      "resolve.noProjectManager": "Resolve returned no project manager.",
      "resolve.noProject": "No project is open in DaVinci Resolve.",
      "resolve.noTimeline": "No timeline is active. Open a timeline in the Edit " +
        "page and click anywhere inside it, then try again.",
      "resolve.noMediaPool": "Resolve returned no media pool.",
      "resolve.noRoot": "Resolve returned no media-pool root folder.",
      "resolve.createBinErr": "Could not create the \"{0}\" bin: {1}",
      "resolve.createBinRefused": "Could not create the \"{0}\" bin (Resolve refused).",
      "resolve.insertFailed": "Could not insert the clip into the timeline: {0}. " +
        "Is the target track locked?",
      "resolve.refused": "Resolve refused",
      "resolve.importRefused": "Resolve refused to import the file: {0}",
      "resolve.noItems": "Resolve did not return any imported items.",
      "resolve.fileNotFound": "File not found: {0}",
      "resolve.noPlayhead": "Could not read the playhead position — appending to " +
        "the end instead.",
      "resolve.playheadNoOp": "Resolve accepted the insert but placed nothing at " +
        "the playhead — appending to the end instead.",

      "internal.error": "Internal error: {0}",
      "main.jobRunning": "A job is already running.",
      "main.noOptions": "No job options received.",
      "main.chooseFolder": "Choose the Grabtify download folder",
      "main.openFolderErr": "Could not open the folder: {0}",
      "main.bindingFailed": "WorkflowIntegration binding failed. If you opened " +
        "this window directly, launch the plugin from DaVinci Resolve Studio's " +
        "Workspace → Workflow Integrations menu instead.",
    },

    "pt-BR": {
      "status.pastePrompt": "> cole um link, então [grabtify para a timeline]",
      "status.fetchingTitle": "buscando título",
      "status.notReady": "Backend ainda não está pronto — aguarde um momento.",
      "status.finishedOk": "Concluído.",
      "status.finishedFail": "Falhou.",
      "status.bootFailed": "Falha ao iniciar: {0}",
      "status.couldNotStart": "Não foi possível iniciar: {0}",
      "status.checking": "verificando…",
      "status.ready": "pronto",
      "status.missing": "faltando",

      "stage.fetch": "CAPTURAR",
      "stage.encode": "CODIFICAR",

      "boot.loadingAria": "Carregando",
      "boot.loading": "carregando…",
      "boot.ready": "Grabtify pronto.",
      "boot.toolsNote": "As ferramentas são usadas de bin/ quando presentes; caso contrário, do PATH.",
      "boot.jobStarted": "Trabalho iniciado {0}",
      "boot.cancelling": "Cancelando…",

      "form.videoLink": "Link do vídeo",
      "form.urlPh": "https://www.youtube.com/watch?v=…",
      "form.timePh": "0:00 ou 0:00:00",
      "form.mode": "Modo",
      "form.inPoint": "Ponto inicial",
      "form.outPoint": "Ponto final",
      "form.trim": "Recortar clipe",
      "form.optional": "(opcional)",
      "form.clear": "limpar",
      "form.clearTitle": "Limpar os pontos inicial/final",
      "form.maxQuality": "Qualidade",
      "form.audioQuality": "Qualidade do áudio",
      "form.insertAt": "Inserir clipe em",
      "form.encodeNotice": "→ \"Encode para MP4\" será ativado neste trabalho",
      "form.grab": "Grabtify para a timeline",
      "form.cancel": "Cancelar",
      "form.openFolder": "Abrir pasta",
      "form.language": "Idioma",

      "settings.title": "Configurações",
      "settings.general": "Geral",
      "settings.video": "Vídeo",
      "settings.storage": "Armazenamento",
      "settings.system": "Verificação do sistema",
      "settings.trimTiming": "Quando cortar",
      "settings.encodeQuality": "Qualidade de codificação",
      "settings.autoEncode": "Codificar automaticamente",
      "settings.autoEncodeNote": "Converte formatos incomuns para H.264 MP4.",
      "settings.encodeToMp4": "Sempre codificar para MP4",
      "settings.saveTo": "Salvar downloads em",
      "settings.browse": "Escolher…",
      "settings.recheck": "Verificar de novo",
      "settings.checkUpdates": "Verificar atualizações",
      "settings.toolsTitle": "Ferramentas usadas por este painel",
      "settings.roleResolve": "DaVinci Resolve",
      "settings.roleYtdlp": "Downloader",
      "settings.roleFfmpeg": "Codificador",
      "settings.roleDeno": "Runtime JS (YouTube)",
      "settings.summary": "Prontos: {0} de {1}",
      "settings.support": "Apoie o projeto",
      "settings.kofi": "Me pague um café!",

      "updates.title": "Atualizações de binários",
      "updates.sub": "Há versões mais novas disponíveis para as ferramentas incluídas.",
      "updates.note": "Atualizar substitui as ferramentas em bin\\win. Você confirmará uma vez.",
      "updates.updateNow": "Atualizar agora",
      "updates.later": "Depois",
      "updates.upToDate": "em dia",
      "updates.onPath": "no PATH — atualize manualmente",
      "updates.unknown": "versão desconhecida",
      "updates.stateDownloading": "baixando {0}%",
      "updates.stateExtracting": "extraindo…",
      "updates.stateApplying": "aplicando…",
      "updates.stateDone": "atualizado",
      "updates.stateFailed": "falhou",
      "updates.noUpdate": "Todas as ferramentas incluídas estão em dia.",
      "updates.jobRunning": "Ainda há um trabalho em execução. Termine-o antes de atualizar as ferramentas.",
      "updates.elevateTimeout": "O prompt de atualização foi cancelado ou expirou.",
      "updates.macManual": "A atualização dentro do plugin é suportada apenas no Windows.",

      "console.jobLog": "Log do trabalho",

      "legal.text": "Baixe apenas vídeos seus ou que você tem licença para baixar. " +
        "Os termos da maioria das plataformas restringem downloads, e esta " +
        "ferramenta não contorna DRM.",

      "validation.urlError": "Insira um link http(s) completo primeiro.",
      "validation.timecodeError": "Timecodes parecem com 90, 1:30 ou 1:02:03.",

      "opt.best": "Melhor disponível",
      "opt.q2160": "Até 2160p",
      "opt.q1440": "Até 1440p",
      "opt.q1080": "Até 1080p",
      "opt.q720": "Até 720p",
      "opt.a128": "128 kbps (arquivo menor)",
      "opt.a192": "192 kbps (recomendado)",
      "opt.a320": "320 kbps (melhor qualidade)",
      "opt.video": "Vídeo MP4",
      "opt.audio": "Áudio MP3",
      "opt.playhead": "Inserir no playhead",
      "opt.append": "Anexar ao final da sequência",
      "opt.bin": "Somente no bin do projeto",
      "opt.downloadTrim": "Corte rápido local",
      "opt.ffmpegTrim": "Durante a codificação (mais lento, mais preciso)",
      "opt.crf18": "Boa qualidade (CRF 18)",
      "opt.crf21": "Equilibrado (CRF 21)",
      "opt.crf23": "Rápido (CRF 23)",

      "lang.en": "English",
      "lang.ptBR": "Português (Brasil)",

      "tools.failed": "Falhou",
      "tools.noInfo": "sem informação",
      "tools.noTitle": "Nenhum título retornado.",
      "tools.ytdlpFailed": "yt-dlp falhou.",
      "tools.couldNotStart": "Não foi possível iniciar {0}: {1}",
      "tools.hintWin": "{0} não foi incluído e não está no PATH. Reinstale o " +
        "Grabtify ou copie o binário ausente para bin\\win\\.",
      "tools.hintMac": "Esta versão não tem uma cópia de {0} para macOS. Instale " +
        "as ferramentas com o Homebrew (brew install yt-dlp ffmpeg) e reabra o " +
        "painel, ou reconstrua o Grabtify depois de preencher bin/mac/.",

      "job.starting": "iniciando…",
      "job.cancelled": "Cancelado.",
      "job.contacting": "Contatando o site…",
      "job.fetchingFrom": "Buscando em {0}…",
      "job.downloadTrim": "Cortando até {0}–{1} (cópia rápida, precisa de ffmpeg).",
      "job.cutToEnd": "fim",
      "job.cutting": "Cortando…",
      "job.cuttingPct": "Cortando {0}%",
      "job.cutDone": "Corte concluído — {0}",
      "job.alreadyDownloaded": "Já baixado: {0}",
      "job.fetchingPct": "Buscando {0}%",
      "job.startYtdlp": "Não foi possível iniciar o yt-dlp ({0}). {1}",
      "job.ytdlpExit": "yt-dlp saiu com o código {0}; veja o log acima.",
      "job.instagramHint": " O suporte a Instagram vive dentro do yt-dlp e o " +
        "Instagram muda o site com frequência, então isso geralmente significa " +
        "que o yt-dlp incluído está desatualizado. Atualize-o e tente de novo. " +
        "Alguns reels também exigem login, o que este painel não faz.",
      "job.noOutput": "O download terminou, mas o arquivo de saída não pôde ser " +
        "localizado. Arquivos na pasta de saída: {0}",
      "job.folderMissing": "(pasta ausente)",
      "job.downloaded": "Baixado: {0}",
      "job.encodingPct": "Codificando {0}%",
      "job.encoding": "Codificando…",
      "job.encodeClash": "Um arquivo convertido anterior está em uso " +
        "(provavelmente aberto no Resolve); gravando um novo arquivo.",
      "job.encodeTrimStart": "Cortando na codificação: início {0}s",
      "job.encodeTrimDur": ", duração {0}s",
      "job.encodingAudio": "Codificando {0} para MP3 {1}k",
      "job.encodingVideo": "Codificando {0} para H.264 CRF {1}",
      "job.startFfmpeg": "Não foi possível iniciar o ffmpeg ({0}). {1}",
      "job.timestamps": "Confira se os timestamps de início/fim estão corretos " +
        "e dentro da duração do vídeo, e tente de novo.",
      "job.ffmpegExit": "ffmpeg saiu com o código {0}; veja o log acima.",
      "job.encoded": "Codificado: {0}",
      "job.removedRaw": "Download bruto removido.",
      "job.couldNotRemove": "Não foi possível remover o download bruto: {0}",
      "job.importing": "importando…",
      "job.handoff": "Entregando ao Resolve…",
      "job.donePlayhead": "Concluído — clipe inserido no playhead.",
      "job.doneAppend": "Concluído — clipe anexado ao final da sequência.",
      "job.doneBinNoseq": "Concluído — importado para o bin (nenhuma sequência aberta).",
      "job.doneBin": "Concluído — clipe importado para o bin \"{0}\".",

      "resolve.notRunning": "Não está rodando dentro do Resolve. Abra este plugin " +
        "pelo menu Workspace → Workflow Integrations do DaVinci Resolve Studio.",
      "resolve.connected": "Resolve Studio conectado.",
      "resolve.notResponding": "O Resolve não está respondendo.",
      "resolve.missingModule": "WorkflowIntegration.node está ausente. Reinstale " +
        "o Grabtify ou execute deploy.bat depois de adicionar o módulo (veja o README).",
      "resolve.bindFailRunning": "Não foi possível conectar ao DaVinci Resolve. " +
        "Abra o plugin com o Resolve Studio em execução.",
      "resolve.bindFailRunning2": "Não foi possível conectar ao DaVinci Resolve. " +
        "O Resolve Studio está aberto?",
      "resolve.noProjectManager": "O Resolve não retornou um gerenciador de projetos.",
      "resolve.noProject": "Nenhum projeto está aberto no DaVinci Resolve.",
      "resolve.noTimeline": "Nenhuma timeline ativa. Abra uma timeline na página " +
        "Edit e clique dentro dela, depois tente de novo.",
      "resolve.noMediaPool": "O Resolve não retornou um media pool.",
      "resolve.noRoot": "O Resolve não retornou a pasta raiz do media pool.",
      "resolve.createBinErr": "Não foi possível criar o bin \"{0}\": {1}",
      "resolve.createBinRefused": "Não foi possível criar o bin \"{0}\" (o Resolve recusou).",
      "resolve.insertFailed": "Não foi possível inserir o clipe na timeline: {0}. " +
        "A faixa de destino está bloqueada?",
      "resolve.refused": "o Resolve recusou",
      "resolve.importRefused": "O Resolve recusou importar o arquivo: {0}",
      "resolve.noItems": "O Resolve não retornou itens importados.",
      "resolve.fileNotFound": "Arquivo não encontrado: {0}",
      "resolve.noPlayhead": "Não foi possível ler a posição do playhead — " +
        "anexando ao final.",
      "resolve.playheadNoOp": "O Resolve aceitou a inserção, mas não colocou nada " +
        "no playhead — anexando ao final.",

      "internal.error": "Erro interno: {0}",
      "main.jobRunning": "Já existe um trabalho em execução.",
      "main.noOptions": "Nenhuma opção de trabalho recebida.",
      "main.chooseFolder": "Escolha a pasta de download do Grabtify",
      "main.openFolderErr": "Não foi possível abrir a pasta: {0}",
      "main.bindingFailed": "A vinculação do WorkflowIntegration falhou. Se você " +
        "abriu esta janela diretamente, abra o plugin pelo menu Workspace → " +
        "Workflow Integrations do DaVinci Resolve Studio.",
    },
  };

  const FALLBACK_LANG = "en";
  let currentLang = FALLBACK_LANG;

  function currentLanguage() {
    return currentLang;
  }

  function setLanguage(lang) {
    if (lang && MESSAGES[lang]) currentLang = lang;
  }

  function translate(lang, key, vars) {
    const table = MESSAGES[lang] || MESSAGES[FALLBACK_LANG] || {};
    let s = table[key] !== undefined ? table[key] : key;
    if (vars && typeof s === "string") {
      s = s.replace(/\{(\d+)\}/g, (m, i) => {
        return vars[i] !== undefined ? String(vars[i]) : m;
      });
    }
    return s;
  }

  function t(key, vars) {
    return translate(currentLang, key, vars);
  }

  const api = {
    MESSAGES: MESSAGES,
    currentLanguage: currentLanguage,
    setLanguage: setLanguage,
    translate: translate,
    t: t,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GrabtifyI18n = api;
})();
