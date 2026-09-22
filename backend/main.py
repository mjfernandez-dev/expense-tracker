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
from urllib.parse import urlparse
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, Base
import models
import config
from dependencies import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.scheduler_service import create_scheduler

# Routers
from routers import auth, categorias, movimientos, gastos_fijos, ciclos, push, gastos_programados, cron
from routers.categorias import categories_router

# Crear las tablas SOLO en desarrollo (APP_ENV distinto de production) para
# agilizar el setup local. En PRODUCCIÓN el esquema se gestiona con migraciones
# Alembic (carpeta alembic/): acá nunca se ejecuta create_all.
if not config.IS_PRODUCTION:
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar scheduler (solo tareas de mantenimiento)
    scheduler = create_scheduler()
    scheduler.start()

    yield

    scheduler.shutdown()


# Crear la aplicación FastAPI
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


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """Mitiga CSRF validando el header Origin en requests de escritura.

    En producción las cookies son SameSite=None, así que el navegador siempre
    envía el header Origin en requests que cambian estado. Una request es
    legítima si su Origin coincide con el host del request (same-origin) o está
    en ALLOWED_ORIGINS (cross-origin autorizado, típicamente localhost en
    desarrollo). Cualquier otro Origin se rechaza con 403. Clientes sin
    navegador (cron, curl, tests) no envían Origin y pasan sin problema.
    """

    _SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    @staticmethod
    def _es_mismo_origen(origin: str, request: Request) -> bool:
        """True si el Origin coincide con el host del request (same-origin)."""
        try:
            hostname = urlparse(origin).hostname
        except ValueError:
            return False
        if not hostname:
            return False
        request_host = request.headers.get("host", "").split(":")[0]
        return hostname.lower() == request_host.lower()

    async def dispatch(self, request: Request, call_next):
        if request.method not in self._SAFE_METHODS:
            origin = request.headers.get("origin")
            if origin and origin not in ALLOWED_ORIGINS and not self._es_mismo_origen(origin, request):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origen no permitido"},
                )
        return await call_next(request)


# Registrado DESPUÉS de RequestLoggingMiddleware para quedar como el middleware
# más externo: el check de Origin se ejecuta antes que cualquier handler.
app.add_middleware(OriginCheckMiddleware)

# API Router: agrupa todas las rutas bajo /api para Cloud Run
api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(categories_router)
api_router.include_router(categorias.router)
api_router.include_router(movimientos.router)
api_router.include_router(gastos_fijos.router)
api_router.include_router(ciclos.router)
api_router.include_router(gastos_programados.router)
api_router.include_router(push.router)
api_router.include_router(cron.router)

app.include_router(api_router)

# Health check para Cloud Run
@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}

# Servir frontend estático (SPA) — debe ir ÚLTIMO para no robar rutas de la API
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
