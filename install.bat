@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  Grabtify - DaVinci Resolve Workflow Integration plugin
rem  One-click installer for end users.
rem
rem  What it does:
rem    1. Elevates to Administrator (writes to %PROGRAMDATA%)
rem    2. Mirrors the plugin files into Resolve's Workflow
rem       Integration Plugins folder
rem    3. Locates WorkflowIntegration.node in your Resolve
rem       installation and copies it next to main.js
rem    4. Downloads yt-dlp / ffmpeg / ffprobe / deno into bin\win\ if
rem       they are missing (first run only)
rem ============================================================

echo.
echo  Grabtify installer
echo  ------------------
echo.

rem ---- request administrator privileges ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  This installer writes to ProgramData, so it needs
    echo  administrator privileges. Accept the UAC prompt.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "SRC=%~dp0"
rem  %~dp0 ends with "\". Keep it quoted-safe: a path ending in
rem  backslash before the closing quote makes cmd eat the quote and
rem  corrupt the rest of the command line (e.g. robocopy "invalid
rem  parameter #3"). Strip the trailing backslash here.
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "PLUGIN_ID=com.grabtify.plugin"
set "INSTALL_ROOT=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
set "DEST=%INSTALL_ROOT%\%PLUGIN_ID%"

echo  Source : %SRC%
echo  Target : %DEST%
echo.

if not exist "%INSTALL_ROOT%" (
    echo  ERROR: Resolve's Workflow Integration folder was not found at:
    echo    %INSTALL_ROOT%
    echo  This is normal if DaVinci Resolve Studio is not installed yet.
    echo  Install DaVinci Resolve Studio ^>= 19.0.2 first, then run
    echo  install.bat again.
    echo.
    pause
    exit /b 1
)

if not exist "%SRC%\manifest.xml" (
    echo  ERROR: manifest.xml not found next to install.bat. Are you
    echo  running this from the extracted Grabtify folder?
    echo.
    pause
    exit /b 1
)

rem ---- make sure Resolve is closed. Plugin files are only loaded when
rem Resolve starts, and open files can block the copy. ----
set "RESOLVE_RUNNING="
tasklist /fi "imagename eq Resolve.exe" 2>nul | find /i "Resolve.exe" >nul
if not errorlevel 1 set "RESOLVE_RUNNING=1"
if defined RESOLVE_RUNNING (
    echo.
    echo  WARNING: DaVinci Resolve is running.
    echo  The plugin is only loaded when Resolve starts, and open files
    echo  can block the copy. It is strongly recommended to close Resolve
    echo  before installing.
    echo.
    set /p CONTINUE=Press Enter to wait for Resolve to close, or type s to continue anyway: 
    if /i "!CONTINUE!"=="s" (
        echo  Continuing anyway...
    ) else (
        echo  Waiting for Resolve to close...
        call :wait_resolve_closed
        echo  Resolve closed. Continuing.
    )
    echo.
)

rem ---- copy the plugin (binaries and .node are managed separately, so
rem the mirror never deletes a previously downloaded tool) ----
echo  Copying plugin files...
robocopy "%SRC%" "%DEST%" /MIR /XF install.bat uninstall.bat README.md LICENSE .gitignore *.zip *.exe WorkflowIntegration.node /XD .git /NFL /NDL /NJH /NJS /NP /FP /R:3 /W:2 > "%TEMP%\grabtify-robocopy.log" 2>&1
set "RC=%errorlevel%"
if %RC% geq 16 (
    echo  ERROR: could not copy the plugin. Close DaVinci Resolve and your
    echo  antivirus, then run install.bat again.
    echo  Details: %TEMP%\grabtify-robocopy.log
    pause
    exit /b 1
)
if %RC% geq 8 (
    echo  ERROR: some plugin files could not be copied. Close DaVinci Resolve
    echo  and your antivirus, then run install.bat again.
    echo  Details: %TEMP%\grabtify-robocopy.log
    pause
    exit /b 1
)

rem ---- WorkflowIntegration.node - BMD's native module. It ships inside
rem Resolve / with the "Workflow Integration Plugins" developer docs and
rem must sit next to main.js. Search this Resolve installation for it. ----
if exist "%DEST%\WorkflowIntegration.node" (
    echo  WorkflowIntegration.node: already present.
) else (
    set "NODE_FOUND="
    rem Prefer the module shipped with the Resolve SDK. It lives in the
    rem "Workflow Integration Plugins" developer examples.
    for /d %%D in ("%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations\Examples\*") do (
        if not defined NODE_FOUND if exist "%%D\WorkflowIntegration.node" set "NODE_FOUND=%%D\WorkflowIntegration.node"
    )
    rem Fallback: full recursive search across both Resolve roots.
    if not defined NODE_FOUND for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%ProgramFiles%\Blackmagic Design','%PROGRAMDATA%\Blackmagic Design' -Recurse -Filter WorkflowIntegration.node -File -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName"`) do set "NODE_FOUND=%%f"
    if not defined NODE_FOUND (
        call :warn_no_node
    ) else (
        if exist "!NODE_FOUND!" (
            copy /Y "!NODE_FOUND!" "%DEST%\WorkflowIntegration.node" >nul
            if errorlevel 1 (
                echo  WARNING: could not copy WorkflowIntegration.node.
                echo  Source: !NODE_FOUND!
                echo  Copy it manually into:
                echo    %DEST%
                echo.
            ) else (
                echo  WorkflowIntegration.node: copied from !NODE_FOUND!
            )
        ) else (
            call :warn_no_node
        )
    )
)

rem ---- tools: download what is missing (first run only) ----
set "MISSING="
for %%T in (yt-dlp.exe ffmpeg.exe ffprobe.exe deno.exe) do if not exist "%DEST%\bin\win\%%T" set "MISSING=1"
if defined MISSING (
    echo  Downloading command-line tools - first run only...
    call :ensure_tools "%DEST%"
    echo.
)

echo  Done.
echo  -----
echo  Now open DaVinci Resolve Studio and go to:
echo     Workspace - Workflow Integrations - Grabtify
echo.
pause
exit /b 0

rem ============================================================
rem  Subroutines
rem ============================================================

:wait_resolve_closed
tasklist /fi "imagename eq Resolve.exe" 2>nul | find /i "Resolve.exe" >nul
if not errorlevel 1 (
    ping -n 3 127.0.0.1 >nul
    goto wait_resolve_closed
)
exit /b 0

:warn_no_node
echo  WARNING: WorkflowIntegration.node was not found. The panel will
echo  open but report "Resolve not ready" until it is added.
echo  Get it: in Resolve, Help - Documentation - Developer, download
echo  the "Workflow Integration Plugins" package, and copy
echo  WorkflowIntegration.node into:
echo    %DEST%
echo.
exit /b 0

:ensure_tools
rem  %1 = installed plugin dir. Downloads yt-dlp, ffmpeg, ffprobe and
rem  deno into bin\win. A failed download is not fatal: the plugin will
rem  fall back to tools found on PATH.
set "TOOL_DIR=%~1\bin\win"
set "TMPZ=%TEMP%\grabtify-ffmpeg.zip"
set "TMPD=%TEMP%\grabtify-ffmpeg"
set "TMPZ2=%TEMP%\grabtify-deno.zip"
set "TMPD2=%TEMP%\grabtify-deno"

if not exist "%TOOL_DIR%\yt-dlp.exe" (
    echo    yt-dlp.exe...
    call :download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" "%TOOL_DIR%\yt-dlp.exe"
    if errorlevel 1 echo    yt-dlp download failed - the plugin will use PATH instead.
)

if not exist "%TOOL_DIR%\deno.exe" (
    echo    deno.exe - YouTube now requires a JS runtime for downloads...
    call :download "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" "%TMPZ2%"
    if errorlevel 1 (
        echo    deno download failed - some YouTube formats may be unavailable.
    ) else (
        if exist "%TMPD2%" rmdir /s /q "%TMPD2%"
        if not exist "%TMPD2%" mkdir "%TMPD2%"
        call :extract_zip "%TMPZ2%" "%TMPD2%"
        if exist "%TMPD2%\deno.exe" (
            copy /Y "%TMPD2%\deno.exe" "%TOOL_DIR%\deno.exe" >nul
        ) else (
            for /r "%TMPD2%" %%f in (deno.exe) do if exist "%%f" copy /Y "%%f" "%TOOL_DIR%\deno.exe" >nul
        )
        del "%TMPZ2%" >nul 2>&1
        if exist "%TMPD2%" rmdir /s /q "%TMPD2%"
        if not exist "%TOOL_DIR%\deno.exe" echo    extracted, but deno.exe was not found - some YouTube formats may be unavailable.
    )
)

if not exist "%TOOL_DIR%\ffmpeg.exe" if not exist "%TOOL_DIR%\ffprobe.exe" (
    echo    ffmpeg.exe + ffprobe.exe - downloading the essentials build, about 100MB...
    call :download "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" "%TMPZ%"
    if errorlevel 1 call :download "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" "%TMPZ%"
    if errorlevel 1 (
        echo    ffmpeg download failed - the plugin will use PATH instead.
    ) else (
        if exist "%TMPD%" rmdir /s /q "%TMPD%"
        if not exist "%TMPD%" mkdir "%TMPD%"
        call :extract_zip "%TMPZ%" "%TMPD%"
        for /r "%TMPD%" %%f in (ffmpeg.exe) do if exist "%%f" copy /Y "%%f" "%TOOL_DIR%\ffmpeg.exe" >nul
        for /r "%TMPD%" %%f in (ffprobe.exe) do if exist "%%f" copy /Y "%%f" "%TOOL_DIR%\ffprobe.exe" >nul
        del "%TMPZ%" >nul 2>&1
        if exist "%TMPD%" rmdir /s /q "%TMPD%"
        if not exist "%TOOL_DIR%\ffmpeg.exe" if not exist "%TOOL_DIR%\ffprobe.exe" (
            echo    extracted, but ffmpeg/ffprobe were not found - the plugin will use PATH instead.
        )
    )
)
exit /b 0

:extract_zip
rem  %1 = zip, %2 = destination dir. Uses tar.exe (built into
rem  Windows 10/11) when available - much faster than Expand-Archive.
set "EZ_ZIP=%~1"
set "EZ_DEST=%~2"
where tar.exe >nul 2>&1
if %errorlevel%==0 (
    tar.exe -xf "%EZ_ZIP%" -C "%EZ_DEST%"
    exit /b %errorlevel%
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%EZ_ZIP%' -DestinationPath '%EZ_DEST%' -Force"
exit /b %errorlevel%

:download
rem  %1 = url, %2 = output file. Prefers curl.exe; falls back to
rem  PowerShell Invoke-WebRequest. Retries up to 3 times and never
rem  hangs forever: curl gets connect/max timeouts, and the result is
rem  only accepted if the file really landed.
set "DL_URL=%~1"
set "DL_OUT=%~2"
set /a DL_TRY=0
:download_again
set /a DL_TRY+=1
where curl.exe >nul 2>&1
if %errorlevel%==0 (
    curl.exe -L --fail --progress-bar --connect-timeout 15 --max-time 300 -o "%DL_OUT%" "%DL_URL%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DL_URL%' -OutFile '%DL_OUT%' -UseBasicParsing"
)
if not errorlevel 1 if exist "%DL_OUT%" exit /b 0
if %DL_TRY% geq 3 goto download_gave_up
echo    ... connection stalled - retrying, attempt %DL_TRY% of 3...
if exist "%DL_OUT%" del "%DL_OUT%" >nul 2>&1
ping -n 4 127.0.0.1 >nul
goto download_again
:download_gave_up
if exist "%DL_OUT%" del "%DL_OUT%" >nul 2>&1
exit /b 1
