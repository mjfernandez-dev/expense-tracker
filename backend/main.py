# Cargar variables de entorno desde .env antes de cualquier import local
from dotenv import load_dotenv
load_dotenv()

import logging
import json
import time
import os

from fastapi.staticfiles import StaticFiles

# Logging estructurado (JSON) para producción, legible para desarrollo
class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)
        return json.dumps(log, ensure_ascii=False)

_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger("finanzaapp")

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, Base
import models
import config
from dependencies import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.scheduler_service import create_scheduler

# Routers
from routers import auth, categorias, movimientos, gastos_fijos, ciclos, push, wishlist
from routers.categorias import categories_router

# Crear todas las tablas en la base de datos si no existen
# ⚠️ Las migraciones de esquema se manejan con Alembic (ver carpeta alembic/).
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar scheduler (solo tareas de mantenimiento)
    scheduler = create_scheduler()
    scheduler.start()

    yield

    scheduler.shutdown()


# Crear la aplicaci?n FastAPI
if config.IS_PRODUCTION:
    app = FastAPI(title="FinanzaApp API", docs_url=None, redoc_url=None, lifespan=lifespan)
else:
    app = FastAPI(title="FinanzaApp API", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
ALLOWED_ORIGINS = [
    o.strip() for o in
    os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type"],
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(level, "%s %s → %d (%dms)", request.method, request.url.path, response.status_code, duration_ms)
        return response


app.add_middleware(RequestLoggingMiddleware)

# API Router: agrupa todas las rutas bajo /api para Cloud Run
api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(categories_router)
api_router.include_router(categorias.router)
api_router.include_router(movimientos.router)
api_router.include_router(gastos_fijos.router)
api_router.include_router(ciclos.router)
api_router.include_router(push.router)
api_router.include_router(wishlist.router)

app.include_router(api_router)

# Health check para Cloud Run
@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}

# Servir frontend estático (SPA) — debe ir ÚLTIMO para no robar rutas de la API
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
