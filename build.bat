@echo off
chcp 65001 >nul
title TP Automation - qayta qurish
cd /d "%~dp0"

rem --- Node.js topish (PATH'da bo'lmasa, odatiy joylardan) ---
where node >nul 2>nul && goto :node_ok
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul && goto :node_ok
echo [XATO] Node.js topilmadi. Kompyuterni qayta yuklang yoki nodejs.org dan o'rnating.
pause
exit /b 1
:node_ok

echo Loyiha qayta qurilmoqda (kod o'zgartirilgandan keyin)...
echo.
call npx prisma generate >nul 2>nul
call npm run build
if errorlevel 1 (
  echo.
  echo [XATO] Build muvaffaqiyatsiz tugadi.
) else (
  echo.
  echo Tayyor. Endi start.bat orqali qaytadan ishga tushiring.
)
echo.
pause
