import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ✅ Configuración de base de datos flexible
# Lee DATABASE_URL de variables de entorno, con fallback a SQLite local
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DATABASE_URL = os.getenv("DATABASE_URL")

# Validar que DATABASE_URL esté definida en producción
if ENVIRONMENT == "production" and not DATABASE_URL:
    raise RuntimeError(
        "❌ ERROR: DATABASE_URL no está definida en producción.\n"
        "Define la variable de entorno: export DATABASE_URL='postgresql://user:pass@host/db'"
    )

# Usar SQLite en desarrollo si no se proporciona DATABASE_URL
if not DATABASE_URL:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./gastos.db"
else:
    SQLALCHEMY_DATABASE_URL = DATABASE_URL

# Argumentos específicos para SQLite (no aplican a PostgreSQL)
connect_args = {}
pool_config = {}

if "sqlite" in SQLALCHEMY_DATABASE_URL:
    connect_args = {"check_same_thread": False}
    # SQLite no soporta pool_size
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args=connect_args,
    )
else:
    # PostgreSQL soporta pool
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args=connect_args,
        pool_size=20,
        max_overflow=40,
    )

# Crear sesión para interactuar con la BD
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Clase base para los modelos
Base = declarative_base()

# Dependencia para obtener la sesión de BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()