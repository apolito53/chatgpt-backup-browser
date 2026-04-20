@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
start "" wscript.exe "%ROOT_DIR%\START_BROWSER.vbs"

endlocal
