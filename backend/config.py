import os
from dotenv import load_dotenv

load_dotenv()

# Mercado Pago
MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")

# URLs
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
