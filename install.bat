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

rem ---- console cosmetics: colors + box drawing (keeps this file ASCII) ----
call :boxinit

echo.
call :banner "Grabtify Installer" "DaVinci Resolve Workflow Integration - one-click install"
echo.

rem ---- request administrator privileges ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  %ESC%[%YEL%m!WARN!%ESC%[0m This installer writes to ProgramData, so it needs
    echo  %ESC%[%YEL%m!WARN!%ESC%[0m administrator privileges. Accept the UAC prompt.
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

echo.
echo %ESC%[%CYN%m[1/4]%ESC%[0m %ESC%[%WHT%mPre-flight checks%ESC%[0m
echo %ESC%[%CYN%m  Source :%ESC%[0m %ESC%[%WHT%m%SRC%%ESC%[0m
echo %ESC%[%CYN%m  Target :%ESC%[0m %ESC%[%WHT%m%DEST%%ESC%[0m
echo.

if not exist "%INSTALL_ROOT%" (
    echo %ESC%[%YEL%m!WARN!%ESC%[0m Workflow Integration folder not found. Creating it...
    mkdir "%INSTALL_ROOT%" 2>nul
    if not exist "%INSTALL_ROOT%" (
        echo %ESC%[%RED%m[x]%ESC%[0m ERROR: could not create Workflow Integration folder at:
        echo    %ESC%[%WHT%m%INSTALL_ROOT%%ESC%[0m
        echo %ESC%[%DIM%m  Run install.bat as Administrator.%ESC%[0m
        echo.
        pause
        exit /b 1
    )
    echo %ESC%[%GRN%m[OK]%ESC%[0m Created: %INSTALL_ROOT%
)

if not exist "%SRC%\Grabtify\manifest.xml" (
    echo %ESC%[%RED%m[x]%ESC%[0m ERROR: manifest.xml not found inside the Grabtify folder. Are you
    echo %ESC%[%DIM%m  running this from the extracted Grabtify folder?%ESC%[0m
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
    echo %ESC%[%YEL%m!WARN!%ESC%[0m WARNING: DaVinci Resolve is running.
    echo %ESC%[%DIM%m  The plugin is only loaded when Resolve starts, and open files%ESC%[0m
    echo %ESC%[%DIM%m  can block the copy. It is strongly recommended to close Resolve%ESC%[0m
    echo %ESC%[%DIM%m  before installing.%ESC%[0m
    echo.
    set /p CONTINUE=%ESC%[%YEL%m!WARN!%ESC%[0m Press Enter to wait for Resolve to close, or type s to continue anyway: 
    if /i "!CONTINUE!"=="s" (
        echo %ESC%[%YEL%m  Continuing anyway...%ESC%[0m
    ) else (
        echo %ESC%[%DIM%m  Waiting for Resolve to close...%ESC%[0m
        call :wait_resolve_closed
        echo %ESC%[%GRN%m  Resolve closed. Continuing.%ESC%[0m
    )
    echo.
)

rem ---- copy the plugin (binaries and .node are managed separately, so
rem the mirror never deletes a previously downloaded tool) ----
echo %ESC%[%CYN%m[2/4]%ESC%[0m %ESC%[%WHT%mCopying plugin files...%ESC%[0m
robocopy "%SRC%\Grabtify" "%DEST%" /MIR /XF install.bat uninstall.bat README.md LICENSE .gitignore *.zip *.exe WorkflowIntegration.node /XD .git dev /NFL /NDL /NJH /NJS /NP /FP /R:3 /W:2 > "%TEMP%\grabtify-robocopy.log" 2>&1
set "RC=%errorlevel%"
if %RC% geq 16 (
    echo %ESC%[%RED%m[x]%ESC%[0m ERROR: could not copy the plugin. Close DaVinci Resolve and your
    echo %ESC%[%DIM%m     antivirus, then run install.bat again.%ESC%[0m
    echo %ESC%[%DIM%m     Details: %TEMP%\grabtify-robocopy.log%ESC%[0m
    pause
    exit /b 1
)
if %RC% geq 8 (
    echo %ESC%[%RED%m[x]%ESC%[0m ERROR: some plugin files could not be copied. Close DaVinci Resolve
    echo %ESC%[%DIM%m     and your antivirus, then run install.bat again.%ESC%[0m
    echo %ESC%[%DIM%m     Details: %TEMP%\grabtify-robocopy.log%ESC%[0m
    pause
    exit /b 1
)
echo %ESC%[%GRN%m[OK]%ESC%[0m Plugin files copied.

rem ---- WorkflowIntegration.node - BMD's native module. It ships inside
rem Resolve / with the "Workflow Integration Plugins" developer docs and
rem must sit next to main.js. Search this Resolve installation for it. ----
echo.
echo %ESC%[%CYN%m[3/4]%ESC%[0m %ESC%[%WHT%mWorkflowIntegration.node and command-line tools%ESC%[0m
if exist "%DEST%\WorkflowIntegration.node" (
    echo %ESC%[%GRN%m[OK]%ESC%[0m WorkflowIntegration.node: already present.
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
                echo %ESC%[%YEL%m!WARN!%ESC%[0m WARNING: could not copy WorkflowIntegration.node.
                echo %ESC%[%DIM%m    Source: !NODE_FOUND!%ESC%[0m
                echo %ESC%[%DIM%m    Copy it manually into:%ESC%[0m
                echo %ESC%[%WHT%m    %DEST%%ESC%[0m
                echo.
            ) else (
                echo %ESC%[%GRN%m[OK]%ESC%[0m WorkflowIntegration.node: copied from !NODE_FOUND!
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
    echo.
    echo %ESC%[%WHT%m  Downloading command-line tools - first run only...%ESC%[0m
    call :ensure_tools "%DEST%"
    echo.
)

echo.
echo %ESC%[%CYN%m%BX8%%ESC%[0m
echo %ESC%[%GRN%m  [OK] Done.%ESC%[0m
echo %ESC%[%WHT%m  Now open DaVinci Resolve Studio and go to:%ESC%[0m
echo %ESC%[%WHT%m  Workspace - Workflow Integrations - Grabtify%ESC%[0m
echo %ESC%[%CYN%m%BX8%%ESC%[0m
echo.
pause
exit /b 0

rem ============================================================
rem  Subroutines
rem ============================================================

:boxinit
rem  Generates the ESC character and the box-drawing glyphs at runtime,
rem  so this file stays pure ASCII (no UTF-8 bytes, no chcp). The glyphs
rem  (lines 0x2500..0x2518) exist in the OEM codepages cp437/cp850.
for /f %%A in ('echo prompt $E ^| cmd') do set "ESC=%%A"
set "WARN=[^!]" & set "WHT=1;37" & set "BLU=34" & set "CYN=36" & set "GRN=32" & set "YEL=33" & set "RED=31" & set "DIM=90"
set "BOXN=0"
for /f "delims=" %%C in ('powershell -NoProfile -Command "0x2500,0x2550,0x2502,0x250C,0x2510,0x2514,0x2518 | ForEach-Object { [char]$_ }; [string][char]0x2550*60; [string][char]0x2500*60"') do (
    set /a BOXN+=1
    for %%i in (!BOXN!) do set "BX%%i=%%C"
)
if not defined BX1 (
    set "BX1=-" & set "BX2==" & set "BX3=|" & set "BX4=+" & set "BX5=+" & set "BX6=+" & set "BX7=+"
    set "BX8=" & set "BX9="
    for /l %%i in (1,1,60) do set "BX8=!BX8!=!" & set "BX9=!BX9!-"
)
exit /b 0

:banner
rem  %1 = title, %2 = tagline. Prints a double-rule header.
set "BAN_TITLE=%~1"
set "BAN_TAG=%~2"
echo %ESC%[%CYN%m%BX8%%ESC%[0m
echo %ESC%[%WHT%m  %BAN_TITLE%%ESC%[0m
echo %ESC%[%DIM%m  %BAN_TAG%%ESC%[0m
echo %ESC%[%CYN%m%BX8%%ESC%[0m
exit /b 0

:wait_resolve_closed
tasklist /fi "imagename eq Resolve.exe" 2>nul | find /i "Resolve.exe" >nul
if not errorlevel 1 (
    ping -n 3 127.0.0.1 >nul
    goto wait_resolve_closed
)
exit /b 0

:warn_no_node
echo %ESC%[%YEL%m!WARN!%ESC%[0m WARNING: WorkflowIntegration.node was not found. The panel will
echo %ESC%[%YEL%m!WARN!%ESC%[0m open but report "Resolve not ready" until it is added.
echo %ESC%[%DIM%m  Get it: in Resolve, Help - Documentation - Developer, download%ESC%[0m
echo %ESC%[%DIM%m  the "Workflow Integration Plugins" package, and copy%ESC%[0m
echo %ESC%[%DIM%m  WorkflowIntegration.node into:%ESC%[0m
echo %ESC%[%WHT%m    %DEST%%ESC%[0m
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
    rem gyan.dev itself is slow (~150 KB/s), so fetch the current version and
    rem pull the same essentials build from gyan's GitHub mirror (CDN, ~11 MB/s).
    set "FF_VER="
    for /f "delims=" %%v in ('powershell -NoProfile -Command "(New-Object Net.WebClient).DownloadString('https://www.gyan.dev/ffmpeg/builds/release-version').Trim()" 2^>nul') do set "FF_VER=%%v"
    if defined FF_VER call :download "https://github.com/GyanD/codexffmpeg/releases/download/!FF_VER!/ffmpeg-!FF_VER!-essentials_build.zip" "%TMPZ%"
    if defined FF_VER if errorlevel 1 call :download "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" "%TMPZ%"
    if not defined FF_VER call :download "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" "%TMPZ%"
    if errorlevel 1 call :download "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" "%TMPZ%"
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
    curl.exe -L --fail -C - --progress-bar --connect-timeout 15 --max-time 300 -o "%DL_OUT%" "%DL_URL%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DL_URL%' -OutFile '%DL_OUT%' -UseBasicParsing"
)
if not errorlevel 1 if exist "%DL_OUT%" exit /b 0
if %DL_TRY% geq 3 goto download_gave_up
    echo    ... connection stalled - retrying, attempt %DL_TRY% of 3...
    ping -n 4 127.0.0.1 >nul
goto download_again
:download_gave_up
if exist "%DL_OUT%" del "%DL_OUT%" >nul 2>&1
exit /b 1
