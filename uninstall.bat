@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  Grabtify - uninstaller
rem  Removes the plugin from Resolve's Workflow Integration
rem  Plugins folder. Downloaded clips and your settings in
rem  %APPDATA%\Grabtify are left untouched.
rem ============================================================

rem ---- console cosmetics: colors + box drawing (keeps this file ASCII) ----
call :boxinit

echo.
call :banner "Grabtify Uninstaller" "Removes Grabtify from DaVinci Resolve"
echo.

rem ---- request administrator privileges ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  %ESC%[%YEL%m!WARN!%ESC%[0m This uninstaller writes to ProgramData, so it needs
    echo  %ESC%[%YEL%m!WARN!%ESC%[0m administrator privileges. Accept the UAC prompt.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "DEST=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.grabtify.plugin"

echo.
echo %ESC%[%RED%m  WARNING:%ESC%[0m %ESC%[%WHT%mThis removes the plugin folder:%ESC%[0m
echo %ESC%[%WHT%m    %DEST%%ESC%[0m
echo %ESC%[%DIM%m  Your downloaded clips and saved settings are NOT removed.%ESC%[0m
echo.
set /p CONFIRM=%ESC%[%YEL%mType 'yes' to continue:%ESC%[0m 
if /i not "%CONFIRM%"=="yes" (
    echo.
    echo %ESC%[%YEL%m  Aborted.%ESC%[0m
    echo.
    pause
    exit /b 0
)

if not exist "%DEST%" (
    echo %ESC%[%YEL%m!WARN!%ESC%[0m Plugin folder not found - nothing to remove.
    echo.
    pause
    exit /b 0
)

rmdir /s /q "%DEST%"
echo.
echo %ESC%[%GRN%m  [OK] Done. The plugin has been removed from Resolve.%ESC%[0m
echo.
pause

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
