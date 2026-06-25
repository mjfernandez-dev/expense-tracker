# STAGE 1: Build frontend (React SPA)
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Cache npm deps
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ .
# Same-origin API: frontend calls /api/*, FastAPI sirve bajo /api
ENV VITE_API_URL=/api
RUN npm run build

# STAGE 2: Backend Python + frontend estático
FROM python:3.11-slim

WORKDIR /app

# Dependencias Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend
COPY backend/ .

# Frontend compilado desde stage 1
COPY --from=frontend-builder /build/dist /app/static

# Cloud Run asigna el puerto dinámicamente vía $PORT
EXPOSE 8080
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
