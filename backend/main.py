# Cargar variables de entorno desde .env antes de cualquier import local
from dotenv import load_dotenv
load_dotenv()

import logging
import json
import time
import os

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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from database import engine, get_db, Base
import models
import config
from dependencies import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.scheduler_service import create_scheduler, ejecutar_generacion_mensual

# Routers
from routers import auth, categorias, movimientos, contactos
from routers import split_groups, split_expenses, balances, payments, gastos_fijos

# Crear todas las tablas en la base de datos si no existen
# ⚠️ Las migraciones de esquema se manejan con Alembic (ver carpeta alembic/).
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Al arrancar: ejecutar generación como catch-up (idempotente)
    db = next(get_db())
    try:
        ejecutar_generacion_mensual(db)
    finally:
        db.close()

    # Iniciar scheduler (día 1 de cada mes a las 00:01)
    scheduler = create_scheduler()
    scheduler.start()

    yield

    scheduler.shutdown()


# Crear la aplicación FastAPI
if config.IS_PRODUCTION:
    app = FastAPI(title="Expense Tracker API", docs_url=None, redoc_url=None, lifespan=lifespan)
else:
    app = FastAPI(title="Expense Tracker API", lifespan=lifespan)

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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

# Registrar routers
app.include_router(auth.router)
app.include_router(categorias.router)
app.include_router(movimientos.router)
app.include_router(contactos.router)
app.include_router(split_groups.router)
app.include_router(split_expenses.router)
app.include_router(balances.router)
app.include_router(payments.router)
app.include_router(gastos_fijos.router)


@app.get("/")
def root():
    return {"message": "API de Gastos funcionando correctamente"}
