@echo off
chcp 65001 >nul
title TP Automation CRM - ishga tushirish
cd /d "%~dp0"

echo ==================================================
echo    TP Automation CRM  -  ishga tushirilmoqda
echo ==================================================
echo.

rem --- Node.js topish (PATH'da bo'lmasa, odatiy joylardan) ---
where node >nul 2>nul && goto :node_ok
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%APPDATA%\npm\node.exe" set "PATH=%APPDATA%\npm;%PATH%"
where node >nul 2>nul && goto :node_ok
echo [XATO] Node.js topilmadi.
echo Agar Node.js'ni hozir o'rnatgan bo'lsangiz, kompyuterni QAYTA YUKLAB ko'ring.
echo Yoki https://nodejs.org saytidan o'rnating.
echo.
pause
exit /b 1
:node_ok
for /f "delims=" %%v in ('node -v') do echo Node.js topildi: %%v

rem --- Bog'liqliklar (birinchi marta) ---
if not exist "node_modules\" (
  echo [1/4] Kutubxonalar o'rnatilmoqda... birinchi marta, biroz vaqt oladi.
  call npm install
  if errorlevel 1 ( echo [XATO] npm install muvaffaqiyatsiz. & pause & exit /b 1 )
)

rem --- Baza klienti + migratsiya ---
echo [2/4] Baza tayyorlanmoqda...
call npx prisma generate >nul 2>nul
if not exist "prisma\dev.db" (
  echo     Yangi baza yaratilmoqda + namuna ma'lumotlar...
  call npx prisma migrate deploy
  call npm run db:seed
) else (
  call npx prisma migrate deploy >nul 2>nul
)

rem --- Build (har safar — ishonchli prod build kafolati) ---
echo [3/4] Loyiha tayyorlanmoqda... biroz kuting (10-30 soniya).
call npm run build
if errorlevel 1 ( echo [XATO] Build muvaffaqiyatsiz. & pause & exit /b 1 )

rem --- Server va Telegram bot (har biri alohida oynada) ---
echo [4/4] Server va Telegram bot ishga tushirilmoqda...
start "TP Server (port 3100)" cmd /k "cd /d "%~dp0" && call npm run start"
start "TP Telegram Bot" cmd /k "cd /d "%~dp0" && call npm run bot"

echo.
echo Tayyor!  Brauzer ochilmoqda:  http://localhost:3100
timeout /t 7 /nobreak >nul
start "" http://localhost:3100

echo.
echo --------------------------------------------------
echo  Ikkita yangi oyna ochildi:
echo    1) TP Server (port 3100)
echo    2) TP Telegram Bot
echo  Tizimni TO'XTATISH uchun o'sha ikki oynani yoping.
echo  Bu oynani bemalol yopishingiz mumkin.
echo --------------------------------------------------
echo.
pause
