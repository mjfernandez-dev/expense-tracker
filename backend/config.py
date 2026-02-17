import os
from dotenv import load_dotenv

load_dotenv()

def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

# App
APP_ENV = os.getenv("APP_ENV", "development")
IS_PRODUCTION = APP_ENV.strip().lower() in {"prod", "production"}
EXPOSE_RESET_TOKEN = _as_bool(os.getenv("EXPOSE_RESET_TOKEN"), default=False)

# Encriptación
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
if IS_PRODUCTION and not ENCRYPTION_KEY:
    raise RuntimeError("❌ ERROR: ENCRYPTION_KEY no está definida en producción.")

# Mercado Pago
MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")
MP_WEBHOOK_SECRET = os.getenv("MP_WEBHOOK_SECRET", "")

# URLs
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
