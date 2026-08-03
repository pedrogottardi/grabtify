@echo off
setlocal
cd /d "%~dp0"

rem ============================================================
rem  Grabtify - uninstaller
rem  Removes the plugin from Resolve's Workflow Integration
rem  Plugins folder. Downloaded clips and your settings in
rem  %APPDATA%\Grabtify are left untouched.
rem ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  This uninstaller writes to ProgramData, so it needs
    echo  administrator privileges. Accept the UAC prompt.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "DEST=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.grabtify.plugin"

echo.
echo  Grabtify uninstaller
echo  --------------------
echo  This removes the plugin folder:
echo    %DEST%
echo  Your downloaded clips and saved settings are NOT removed.
echo.
set /p CONFIRM=Type 'yes' to continue: 
if /i not "%CONFIRM%"=="yes" (
    echo  Aborted.
    echo.
    pause
    exit /b 0
)

if not exist "%DEST%" (
    echo  Plugin folder not found - nothing to remove.
    echo.
    pause
    exit /b 0
)

rmdir /s /q "%DEST%"
echo  Done. The plugin has been removed from Resolve.
echo.
pause
