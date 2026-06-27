@echo off
title Economics Exam App Server
echo ==========================================
echo Starting Economics Exam App Server...
echo ==========================================
echo.
echo Opening browser to http://localhost:5000...
start "" "http://localhost:5000"
echo.
python app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start Python server.
    echo Please make sure python is installed and flask is installed.
    echo Run: pip install flask
    pause
)
