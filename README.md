# FinanzaApp

PWA de gestión de gastos personales y grupales (estilo Splitwise para Argentina).

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.10 · FastAPI 0.115 · SQLAlchemy 2.0 · SQLite (dev) / PostgreSQL (prod) |
| Frontend | React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · Axios |
| Deploy | Docker Compose · Nginx · Let's Encrypt (SSL) |

## Funcionalidades

- Auth completo (registro, login, reset de contraseña por email, JWT 30 min)
- CRUD de movimientos (gastos e ingresos) con categorías del sistema y personalizadas
- Grupos de gastos compartidos con cálculo automático de deudas
- Contactos con información bancaria encriptada (alias, CVU)
- Integración Mercado Pago (preferencia de pago, webhook, consulta de estado)
- Datos sensibles encriptados con Fernet (descripciones, notas, contactos)

## Instalación local

### Requisitos
- Python 3.10+
- Node.js 20+
- npm

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac
pip install -r requirements.txt

# Variables mínimas para dev
export SECRET_KEY=dev-secret-key-change-in-production
python -m uvicorn main:app --port 8000
```

### Frontend
```bash
cd frontend
npm install
# Crear frontend/.env.local con:
# VITE_API_URL=http://localhost:8000
npm run dev
```

### Tests
```bash
cd backend
SECRET_KEY=test-key python -m pytest tests/ -v
```

## API Endpoints

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registrar usuario |
| POST | `/auth/login` | Iniciar sesión (devuelve cookie httponly) |
| POST | `/auth/logout` | Cerrar sesión |
| GET | `/auth/me` | Usuario actual |
| POST | `/auth/forgot-password` | Solicitar reset de contraseña |
| POST | `/auth/reset-password` | Resetear contraseña con token |
| POST | `/auth/change-password` | Cambiar contraseña (autenticado) |

### Movimientos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/movimientos/` | Listar movimientos del usuario |
| POST | `/movimientos/` | Crear movimiento |
| PUT | `/movimientos/{id}` | Actualizar movimiento |
| DELETE | `/movimientos/{id}` | Eliminar movimiento |

### Categorías
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/categories/` | Listar categorías del sistema |
| GET | `/user-categories/` | Listar categorías personalizadas |
| POST | `/user-categories/` | Crear categoría personalizada |
| PUT | `/user-categories/{id}` | Actualizar categoría personalizada |
| DELETE | `/user-categories/{id}` | Eliminar categoría personalizada |

### Grupos (split)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/grupos/` | Listar grupos |
| POST | `/grupos/` | Crear grupo |
| GET | `/grupos/{id}` | Detalle del grupo |
| POST | `/grupos/{id}/gastos` | Agregar gasto al grupo |
| GET | `/grupos/{id}/deudas` | Calcular deudas del grupo |

### Contactos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/contacts/` | Listar contactos |
| POST | `/contacts/` | Crear contacto |
| PUT | `/contacts/{id}` | Actualizar contacto |
| DELETE | `/contacts/{id}` | Eliminar contacto |

### Pagos (Mercado Pago)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/payments/create-preference` | Crear preferencia de pago |
| POST | `/payments/webhook` | Webhook de Mercado Pago |
| GET | `/payments/{id}/status` | Consultar estado del pago |

### Sistema
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/docs` | Swagger UI (solo en desarrollo) |
| GET | `/health` | Healthcheck |

## Deploy con Docker

```bash
cp .env.example .env
# Editar .env con secretos reales
docker compose up -d
```

## Variables de entorno requeridas en producción

| Variable | Descripción |
|----------|-------------|
| `SECRET_KEY` | Clave JWT (mínimo 32 chars aleatorios) |
| `ENCRYPTION_KEY` | Clave Fernet base64 para datos sensibles |
| `DATABASE_URL` | URL de PostgreSQL |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciales de email |
| `MP_ACCESS_TOKEN` | Token de Mercado Pago |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos (separados por coma) |

Ver `.env.example` para la lista completa con documentación.
