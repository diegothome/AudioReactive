@echo off
setlocal enabledelayedexpansion

REM ==============================================
REM  AudioReactive - Launcher (Windows .bat)
REM  Inicia o servidor FastAPI e abre no navegador
REM ==============================================

REM Diretório do script
set "ROOT=%~dp0"
cd /d "%ROOT%"

title AudioReactive - Dev Server

REM (Opcional) Ativar ambiente virtual se existir
if exist ".venv\Scripts\activate.bat" (
  call ".venv\Scripts\activate.bat"
)

REM Garantir dependências (se uvicorn não estiver disponível)
where uvicorn >nul 2>nul
if errorlevel 1 (
  echo [INFO] Instalando dependencias do projeto...
  if exist "requirements.txt" (
    pip install -r requirements.txt
  ) else (
    echo [WARN] requirements.txt nao encontrado. Prosseguindo mesmo assim.
  )
)

REM Configurações do servidor
set "HOST=127.0.0.1"
set "PORT=8000"

REM Iniciar servidor em uma nova janela (com auto-reload) usando Python
start "AudioReactive Server" cmd /c "python -m uvicorn app.main:app --host %HOST% --port %PORT% --reload"

REM Aguardar um pouco e abrir páginas
timeout /t 2 /nobreak >nul
start "" "http://%HOST%:%PORT%/"
start "" "http://%HOST%:%PORT%/control.html"

echo Servidor iniciado em http://%HOST%:%PORT%/
echo As abas do navegador foram abertas. Acompanhe os logs na janela do servidor.

endlocal