@echo off
title Radar de Mercado
cd /d "%~dp0"
echo.
echo  Radar de Mercado
echo  Deixe esta janela aberta: fechar a janela desliga o app e a carteira de teste.
echo  O navegador abre em alguns segundos em http://localhost:3000
echo.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
npm run dev
pause
