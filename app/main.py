import asyncio
import random
from pathlib import Path
import mimetypes
from typing import Optional, List

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from .audio import AudioAnalyzer


app = FastAPI()
analyzer = AudioAnalyzer()


@app.on_event("startup")
def on_startup():
    try:
        analyzer.start()
        print("AudioAnalyzer iniciado.")
    except Exception as e:
        print("Erro ao iniciar áudio:", e)


@app.on_event("shutdown")
def on_shutdown():
    try:
        analyzer.stop()
        print("AudioAnalyzer finalizado.")
    except Exception as e:
        print("Erro ao finalizar áudio:", e)


# (Montagem do frontend será adicionada ao final para não sombrear rotas dinâmicas)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            low, mid, high = analyzer.get_levels()
            await websocket.send_json({"low": low, "mid": mid, "high": high})
            await asyncio.sleep(1 / 30)  # ~30 FPS
    except Exception:
        # Cliente desconectou
        pass


# ====== Imagens locais (pasta) ======
IMAGE_DIR: Optional[Path] = None
IMAGE_FILES: List[Path] = []
SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


class SetDirBody(BaseModel):
    path: str


def scan_images(dir_path: Path) -> List[Path]:
    if not dir_path.exists() or not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Pasta inválida")
    files = []
    for p in dir_path.rglob("*"):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXT:
            files.append(p)
    if not files:
        raise HTTPException(status_code=404, detail="Nenhuma imagem encontrada na pasta")
    return files


@app.post("/images/set_dir")
def set_images_dir(body: SetDirBody):
    global IMAGE_DIR, IMAGE_FILES
    IMAGE_DIR = Path(body.path)
    IMAGE_FILES = scan_images(IMAGE_DIR)
    return {"count": len(IMAGE_FILES), "dir": str(IMAGE_DIR)}


def choose_random_image() -> Path:
    if not IMAGE_FILES:
        raise HTTPException(status_code=404, detail="Lista de imagens vazia. Defina a pasta primeiro.")
    return random.choice(IMAGE_FILES)


@app.get("/images/random")
def get_random_image():
    img = choose_random_image()
    mime, _ = mimetypes.guess_type(str(img))
    if mime is None:
        mime = "image/jpeg"
    return FileResponse(path=str(img), media_type=mime)


@app.get("/images/random_meta")
def get_random_image_meta():
    img = choose_random_image()
    return JSONResponse({"filename": img.name, "path": str(img), "url": "/images/random"})

# ====== Logo vetorial (arquivo único) ======
LOGO_PATH: Optional[Path] = None
SUPPORTED_LOGO_EXT = {".svg", ".png", ".jpg", ".jpeg"}


class SetLogoBody(BaseModel):
    path: str


@app.post("/logo/path")
def set_logo_path(body: SetLogoBody):
    global LOGO_PATH
    p = Path(body.path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=400, detail="Arquivo de logo inválido")
    if p.suffix.lower() not in SUPPORTED_LOGO_EXT:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use .svg, .png, .jpg")
    LOGO_PATH = p
    return {"path": str(LOGO_PATH)}


@app.get("/logo")
def get_logo_file():
    if LOGO_PATH is None:
        raise HTTPException(status_code=404, detail="Logo não definido")
    mime, _ = mimetypes.guess_type(str(LOGO_PATH))
    if mime is None:
        # SVG e imagens comuns
        ext = LOGO_PATH.suffix.lower()
        if ext == ".svg":
            mime = "image/svg+xml"
        else:
            mime = "image/png"
    return FileResponse(path=str(LOGO_PATH), media_type=mime)

# Servir arquivos estáticos do frontend por último, para não capturar rotas dinâmicas
app.mount("/", StaticFiles(directory="web", html=True), name="static")