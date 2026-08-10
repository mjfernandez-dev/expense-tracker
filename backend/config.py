import os
from dotenv import load_dotenv

load_dotenv()

# App
APP_ENV = os.getenv("APP_ENV", "development")
IS_PRODUCTION = APP_ENV.strip().lower() in {"prod", "production"}

# Encriptación
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
if IS_PRODUCTION and not ENCRYPTION_KEY:
    raise RuntimeError("❌ ERROR: ENCRYPTION_KEY no está definida en producción.")
