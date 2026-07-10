@echo off
title Antigravity Chess
echo ===================================================
echo   Antigravity Chess Launcher
echo   Starting local server and opening application window...
echo ===================================================
echo.
py "%~dp0main.py"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to run with 'py' command. Trying 'python' instead...
    python "%~dp0main.py"
)
if %errorlevel% neq 0 (
    echo.
    echo [CRITICAL ERROR] Python was not found on your system!
    echo Please make sure Python is installed and added to your system PATH.
    pause
)
