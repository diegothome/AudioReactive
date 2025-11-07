# AudioReactive

Aplicação web audio‑reativa com backend FastAPI e frontend HTML/JS para visualização de espectro (Grave/Médio/Agudo) e controle de fundo (imagens locais ou vídeo do YouTube). O projeto inclui uma página principal de visualização e uma página de controle remoto que se comunica via `BroadcastChannel`.

## Visão Geral
- Backend em `FastAPI` expõe:
  - WebSocket (`/ws`) que transmite níveis de áudio (grave/médio/agudo) a ~30 FPS via `AudioAnalyzer`.
  - Endpoints para imagens locais: definir pasta e obter imagem aleatória.
  - Endpoints para logo: definir arquivo e servir o logo (SVG/PNG/JPG).
  - Servidor de arquivos estáticos montado em `/` (pasta `web`).
- Frontend (`web/index.html`) renderiza:
  - Espectro com barras para `Grave`, `Médio` e `Agudo`.
  - Fundo com estrelas (opcional), imagens locais aleatórias ou vídeo do YouTube.
  - Controles de sensibilidade, paleta, brilho, intensidade do fundo, troca automática, logo (tamanho/visibilidade/opacidade).
  - Botões `🎤` (ativar microfone) e `🗗` (abrir controles) com auto‑ocultação por inatividade.
- Página de controle (`web/control.html`) com UI em Bootstrap que envia comandos ao app principal via `BroadcastChannel` (`ar-controls`).

## Recursos
- Visualização em tempo real (WebAudio) com fallback para dados do servidor via WebSocket se o microfone não puder ser usado.
- HUD com três bandas: `Grave`, `Médio`, `Agudo`.
- Fundo:
  - `Imagens da pasta`: seleção aleatória por API e troca automática configurável.
  - `Vídeo YouTube`: embutido com `autoplay=1`, `mute=1`, `loop=1`. Reutiliza o mesmo vídeo sem reiniciar quando o ID não muda.
- Controle remoto: `control.html` envia comandos de UI (tipo de espectro, paleta, sensibilidade, fundo, brilho, intensidade, pasta de imagens, logo, etc.).
- Logo sobreposto: caminho local (SVG/PNG/JPG), tamanho e opacidade ajustáveis.

## Requisitos
- Python 3.10+
- Sistema com dispositivo de áudio (Windows tem suporte imediato para `sounddevice`; em Linux/macOS pode requerer configuração adicional).
- Dependências (arquivo `requirements.txt`):
  - `fastapi==0.115.3`
  - `uvicorn[standard]==0.30.0`
  - `sounddevice==0.4.6`
  - `numpy==1.26.4`

## Instalação
1. Criar e ativar um ambiente virtual (opcional, recomendado):
   - Windows PowerShell:
     - `python -m venv .venv`
     - `.\.venv\Scripts\Activate.ps1`
2. Instalar dependências:
   - `pip install -r requirements.txt`

## Execução
- Iniciar o servidor em modo desenvolvimento (com auto‑reload):
  - `uvicorn app.main:app --reload`
- Abrir a visualização principal:
  - `http://127.0.0.1:8000/`
- Abrir a página de controle (em outra aba/monitor):
  - `http://127.0.0.1:8000/control.html`

## Uso
- Microfone:
  - Clique em `🎤` para conceder permissão e iniciar a captura. Se falhar, o app usa os níveis enviados pelo servidor via WebSocket (`/ws`).
- Fundo:
  - Selecione entre `Imagens da Pasta` ou `Vídeo YouTube`.
  - Em `Imagens da Pasta`, informe o caminho da pasta local e clique em `Usar pasta`. Depois ative `Troca automática` e ajuste `Intervalo (s)` se desejar.
  - Em `Vídeo YouTube`, cole a URL (p. ex.: `https://www.youtube.com/watch?v=...`) e clique `Usar YouTube`. O app extrai o ID do vídeo e padroniza a URL de embed. Se o ID não muda, o vídeo atual é reaproveitado (não reinicia). O brilho é ajustado pelo controle `Brilho Vídeo/Imagem`.
- Espaço/estrelas: ative/desative `Fundo Espaço`.
- Logo: defina o caminho (SVG/PNG/JPG), use `Usar Logo`, e controle visibilidade, tamanho e opacidade.
- Controles remotos: abra `control.html` (botão `🗗` ou URL direta). As ações são transmitidas via `BroadcastChannel` (`ar-controls`).

## Endpoints (backend)
- WebSocket: `GET ws://<host>/ws` — níveis `{ low, mid, high }` a ~30 FPS.
- Imagens:
  - `POST /images/set_dir` — body `{ path: "C:\\Users\\...\\Pictures" }`
  - `GET /images/random` — retorna arquivo de imagem (aleatório da pasta definida).
  - `GET /images/random_meta` — retorna metadados `{ filename, path, url }`.
- Logo:
  - `POST /logo/path` — body `{ path: "C:\\Users\\...\\logo.svg" }`
  - `GET /logo` — retorna o arquivo do logo com o MIME adequado.

## Observações e Limitações
- Navegadores modernos exigem gesto do usuário para `autoplay` de vídeos com áudio; por isso o embed usa `mute=1` para garantir reprodução automática.
- Ao colar URLs de YouTube, o sistema padroniza para o formato de embed e ignora parâmetros adicionais; se desejar preservar parâmetros específicos (ex.: `t=` para início), abra uma issue.
- Em Windows, Git pode exibir avisos de fim de linha (LF→CRLF); o repositório usa normalização automática via `.gitattributes`.

## Desenvolvimento
- Frontend: `web/index.html`, `web/client.js`, `web/styles.css`.
- Controles: `web/control.html`, `web/control.js`.
- Backend: `app/main.py` (FastAPI), `app/audio.py` (análise de áudio), `requirements.txt`.

## Contribuição
Contribuições são bem‑vindas! Abra issues e PRs com melhorias, correções e novas ideias.