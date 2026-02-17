# Auditoría de Seguridad - Expense Tracker

## Enero de 2026 - Problemas Críticos Identificados

---

## 🔴 CRÍTICO 1: Token de Reset Expuesto en Respuesta HTTP

**Ubicación:** [main.py](main.py#L149-L153)

**Problema:**
```python
# ❌ INSEGURO
return {"message": message, "reset_token": token_str}  # Línea 152
```

El endpoint `/auth/forgot-password` devuelve el token únicamente en la respuesta HTTP:
- **Impacto:** Bypasea completamente el canal de email
- **Ataque:** Interceptar la respuesta HTTP (proxy, logs, etc.) = takeover de cuenta
- **Severidad:** CRÍTICA

**Evidencia:**
- El token se genera y se devuelve inmediatamente (línea 149-152)
- No hay envío real de email (comentario "solo para facilitar pruebas")
- Cualquier cliente con acceso a logs/proxies accede al token

**Recomendación:**
```python
# ✅ SEGURO
@app.post("/auth/forgot-password")
def forgot_password(
    payload: schemas.PasswordResetRequest,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, payload.email)
    message = "Si el email existe, se ha enviado un enlace para restablecer la contraseña"
    
    if not user:
        return {"message": message}  # NO devolver el token
    
    # Generar token
    token_str = uuid4().hex
    expires_at = datetime.utcnow() + timedelta(hours=1)
    reset_token = models.PasswordResetToken(...)
    db.add(reset_token)
    db.commit()
    
    # ENVIAR TOKEN POR EMAIL (implementar servicio de email)
    # await send_reset_email(user.email, token_str)
    
    return {"message": message}  # Solo retornar mensaje
```

---

## 🔴 CRÍTICO 2: SECRET_KEY Inseguro con Fallbacks Predecibles

**Ubicación:** [auth.py](auth.py#L17), [docker-compose.yml](docker-compose.yml#L17)

**Problema:**

```python
# auth.py - ❌ INSEGURO
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

# docker-compose.yml - ❌ INSEGURO
- SECRET_KEY=${SECRET_KEY:-dev-secret-key-for-local-testing}
```

**Impacto:**
- Si falta `SECRET_KEY` en variables de entorno → se usa valor predecible
- Cualquiera puede generar JWTs válidos conociendo `"dev-secret-key-change-in-production"`
- En Docker, si no está definida la variable → usa `"dev-secret-key-for-local-testing"`
- **Ataque:** Falsificar tokens para acceder como cualquier usuario

**Severidad:** CRÍTICA

**Evidencia:**
```bash
# Atacante genera token válido sin credenciales
from jose import jwt
token = jwt.encode(
    {"sub": "admin_user", "exp": datetime.utcnow() + timedelta(days=365)},
    "dev-secret-key-change-in-production",  # ← Predecible
    algorithm="HS256"
)
# Usa el token en Authorization header → acceso garantizado
```

**Recomendación:**

1. **Eliminar fallbacks:**
```python
# auth.py - ✅ SEGURO
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY no está definida. Define la variable de entorno."
    )
```

2. **Docker Compose:**
```yaml
backend:
  environment:
    - SECRET_KEY=${SECRET_KEY}  # Requerida, sin fallback
```

3. **Generar clave en producción:**
```bash
# Generar una clave segura (32 bytes)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Exportar en .env o secrets manager
export SECRET_KEY="tu-clave-de-32-caracteres-aleatoria"
```

---

## 🔴 CRÍTICO 3: CRUD de Categorías sin Autenticación

**Ubicación:** [main.py](main.py#L230), [main.py](main.py#L239), [main.py](main.py#L249), [main.py](main.py#L256), [main.py](main.py#L284)

**Problema:**

```python
# ❌ SIN AUTENTICACIÓN
@app.post("/categories/")
def create_category(
    category: schemas.CategoryCreate,
    db: Session = Depends(get_db)  # ← NO TIENE current_user
):
    db_category = models.Category(nombre=category.nombre, es_predeterminada=False)
    db.add(db_category)
    db.commit()
    return db_category

@app.get("/categories/")
def list_categories(db: Session = Depends(get_db)):  # ← SIN current_user
    return db.query(models.Category).all()

@app.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):  # ← SIN current_user
    ...

@app.put("/categories/{category_id}")
def update_category(category_id: int, ..., db: Session = Depends(get_db)):  # ← SIN current_user
    ...
```

**Impacto:**
- **Cualquier cliente anónimo** puede crear, editar, eliminar categorías
- No hay validación de identidad
- Combinado con el problema #4, es un vector de ataque grave

**Severidad:** CRÍTICA

**Recomendación:**

```python
# ✅ CON AUTENTICACIÓN
@app.post("/categories/", response_model=schemas.CategoryRead)
def create_category(
    category: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)  # ← REQUERIDO
):
    db_category = models.UserCategory(
        nombre=category.nombre,
        user_id=current_user.id,  # ← VINCULAR AL USUARIO
        es_predeterminada=False
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@app.get("/categories/", response_model=List[schemas.CategoryRead])
def list_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Solo devolver categorías del usuario actual
    return db.query(models.UserCategory).filter(
        models.UserCategory.user_id == current_user.id
    ).all()

@app.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id  # ← VALIDAR PROPIEDAD
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Resto del código...
```

---

## 🔴 CRÍTICO 4: Modelo de Categorías Global (sin multi-tenancy)

**Ubicación:** [models.py](models.py#L48)

**Problema:**

```python
# ❌ GLOBAL - COMPARTIDO ENTRE TODOS LOS USUARIOS
class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, unique=True)  # ← UNIQUE GLOBAL
    es_predeterminada = Column(Boolean, default=False)
    gastos = relationship("Expense", back_populates="categoria")
```

**Impacto:**
- **Un solo espacio de nombres** para categorías (todas los usuarios comparten)
- `unique=True` en `nombre` impide que usuario A y usuario B tengan ambos una categoría "Comida"
- Combinado con problema #3 (sin autenticación), usuario A puede borrar/editar categorías de usuario B
- **Interferencia entre usuarios** - modificación de datos ajenos

**Severidad:** CRÍTICA

**Evidencia:**
```sql
-- Si usuario A crea categoría "Comida"
INSERT INTO categories (nombre, es_predeterminada) VALUES ('Comida', 0);

-- Usuario B intenta crear "Comida" → ERROR (unique violation)
-- O si B puede editarla, modifica la de A
```

**Recomendación:**

```python
# ✅ POR USUARIO (Multi-tenancy)
class UserCategory(Base):
    __tablename__ = "user_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # ← VINCULAR AL USUARIO
    nombre = Column(String, nullable=False)
    es_predeterminada = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # RELACIONES
    usuario = relationship("User", backref="categorias_personalizadas")
    gastos = relationship("Expense", back_populates="categoria")
    
    # ✅ Unique por usuario, no global
    __table_args__ = (
        UniqueConstraint('user_id', 'nombre', name='uq_user_categoria_nombre'),
    )

class Expense(Base):
    __tablename__ = "expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    importe = Column(Float, nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    descripcion = Column(String, nullable=False)
    nota = Column(String, nullable=True)
    
    categoria_id = Column(Integer, ForeignKey("user_categories.id"), nullable=False)  # ← ACTUALIZAR FK
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    categoria = relationship("UserCategory", back_populates="gastos")
    usuario = relationship("User", back_populates="gastos")
```

---

## 🟠 ALTO 5: Migraciones Manuales en Runtime

**Ubicación:** [main.py](main.py#L37-L44)

**Problema:**

```python
# ❌ INSEGURO Y NO AUDITABLE
Base.metadata.create_all(bind=engine)  # Línea 37

from sqlalchemy import inspect, text
_inspector = inspect(engine)
_user_columns = [c['name'] for c in _inspector.get_columns('users')]
with engine.connect() as _conn:
    if 'alias_bancario' not in _user_columns:
        _conn.execute(text("ALTER TABLE users ADD COLUMN alias_bancario TEXT"))  # SQL crudo
        _conn.commit()
    if 'cvu' not in _user_columns:
        _conn.execute(text("ALTER TABLE users ADD COLUMN cvu TEXT"))  # SQL crudo
        _conn.commit()
```

**Impacto:**
- **No auditable:** No hay registro de qué cambios se hicieron y cuándo
- **No controlado:** Cambios de esquema se ejecutan automáticamente sin revisión
- **Inconsistente:** Función de startup no es lugar para migraciones
- **Productor-unfriendly:** Escalabilidad horizontal difícil
- **SQL injection risk:** Si los nombres de columnas no estuvieran hardcoded, esto sería vulnerable

**Severidad:** ALTO

**Recomendación:**
Usar Alembic (migration framework estándar de SQLAlchemy):

```bash
# Instalar
pip install alembic

# Inicializar
alembic init alembic

# Crear migración
alembic revision --autogenerate -m "Add alias_bancario and cvu columns"

# Ejecutar
alembic upgrade head
```

**Archivo:** `alembic/env.py` (configuración)
```python
from alembic import context
from sqlalchemy import engine_from_config, pool
from database import Base
import models

target_metadata = Base.metadata

def run_migrations_online() -> None:
    configuration = context.config.get_section(context.config.config_ini_section)
    configuration["sqlalchemy.url"] = os.getenv("DATABASE_URL", "sqlite:///./gastos.db")
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()
```

**main.py actualizado:**
```python
# ✅ SEGURO - Sin migraciones en runtime
# Solo se ejecuta una vez en setup, no en cada startup
app = FastAPI(title="Expense Tracker API")
```

---

## 🔴 CRÍTICO 6: SQLite para Producción

**Ubicación:** [database.py](database.py#L6)

**Problema:**

```python
# ❌ SOLO PARA DESARROLLO
SQLALCHEMY_DATABASE_URL = "sqlite:///./gastos.db"
```

**Limitaciones de SQLite en Producción:**

| Aspecto | SQLite | PostgreSQL/MySQL |
|--------|--------|-------------------|
| **Concurrencia** | Locks a nivel global (un writer a la vez) | Concurrencia real multi-usuario |
| **Escalabilidad** | Limita a ~5 usuarios simultáneos | Soporta miles de conexiones |
| **HA/Replicación** | No soporta | Replicación master-slave |
| **Backups** | Archivo local (difícil distribuir) | Snapshots, PITR (Point-in-Time Recovery) |
| **Auditoría** | Logs limitados | Auditoría completa de cambios |
| **Performance** | Degradación con tamaño | Indexación avanzada |
| **Separación de datos** | Un archivo para todo | Databases aisladas |

**Impacto:**
- Aplicación falla con 2+ usuarios escribiendo simultáneamente
- Imposible implementar backup/restore automático
- Pérdida de datos en crash de servidor
- Sin monitoreo/auditoría

**Severidad:** CRÍTICA (para producción)

**Recomendación:**

Usar PostgreSQL (open-source, production-ready):

```python
# ✅ PRODUCCIÓN
import os

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "production":
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL requerida en producción"
        )
else:
    # Desarrollo local
    DATABASE_URL = "sqlite:///./gastos_dev.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_size=20,  # Para PostgreSQL
    max_overflow=40,
)
```

**Docker Compose actualizado:**

```yaml
version: '3.8'

services:
  # Base de datos PostgreSQL
  postgres:
    image: postgres:15-alpine
    container_name: expense-postgres
    environment:
      POSTGRES_USER: ${DB_USER:-gastos_user}
      POSTGRES_PASSWORD: ${DB_PASSWORD}  # Requerida
      POSTGRES_DB: ${DB_NAME:-gastos_db}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-gastos_user}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: expense-backend
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=postgresql://${DB_USER:-gastos_user}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-gastos_db}
      - SECRET_KEY=${SECRET_KEY}
    ports:
      - "8000:8000"
    restart: unless-stopped

volumes:
  postgres-data:
```

---

## 📋 Plan de Remediación Recomendado

| Prioridad | Problema | Acciones | Timeline |
|-----------|----------|---------|----------|
| 🔴 INMEDIATA | Token en respuesta (#1) | Remover token de `/auth/forgot-password`, implementar email | Ahora |
| 🔴 INMEDIATA | SECRET_KEY fallback (#2) | Eliminar defaults, requerir env var | Ahora |
| 🔴 INMEDIATA | Sin autenticación categorías (#3) | Agregar `get_current_active_user` | Hoy |
| 🔴 INMEDIATA | Categorías global (#4) | Crear tabla `user_categories` con FK a users | Hoy |
| 🟠 URGENTE | Migraciones (#5) | Implementar Alembic | Esta semana |
| 🔴 URGENTE | SQLite producción (#6) | Migrarse a PostgreSQL | Esta week |

---

## 📌 Notas Adicionales

### Otras mejoras recomendadas (no críticas):
1. **Rate limiting** en endpoints de autenticación
2. **HTTPS obligatorio** en producción
3. **CORS más restrictivo** (especificar dominios exactos)
4. **Validación de complejidad de password**
5. **Logs de auditoría** para cambios sensibles
6. **2FA (Two-Factor Authentication)**
7. **Token refresh** (actual token es de 30 min, considerar refresh tokens)

---

**Documento creado:** 2026-02-17  
**Versión:** 1.0  
**Estado:** Críticas identificadas, en espera de remediación
