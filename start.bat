@echo off
title Pagani Digital — Serveur
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     PAGANI DIGITAL — Démarrage           ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Libérer le port 3001 si déjà occupé
echo  [1/3] Vérification du port 3001...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo  Port 3001 occupé par PID %%a — arrêt en cours...
  taskkill /PID %%a /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

cd /d "%~dp0server"

:: Vérifier node_modules
if not exist "node_modules" (
  echo  [2/3] Installation des dépendances...
  call npm install
  echo.
)

echo  [2/3] Démarrage du serveur...
echo.
echo  ════════════════════════════════════════════
echo  Ouvrez votre navigateur sur :
echo  http://localhost:3001
echo.
echo  !! NE PAS ouvrir les .html directement !!
echo.
echo  Identifiants admin :
echo  Email    : demo@paganidigital.com
echo  Password : ChangeMe2025!
echo  ════════════════════════════════════════════
echo.

:: Ouvrir le navigateur après 3 secondes
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3001"

:: Démarrer le serveur (bloque ici — Ctrl+C pour arrêter)
node index.js

pause
