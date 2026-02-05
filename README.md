# 💰 Expense Tracker

Aplicación web progresiva (PWA) para registrar y gestionar gastos personales.

## 🚀 Tecnologías

### Backend
- **Python 3.10+**
- **FastAPI** - Framework web moderno
- **SQLAlchemy** - ORM para base de datos
- **SQLite** - Base de datos local
- **Pydantic** - Validación de datos

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool
- **Tailwind CSS** - Framework de estilos
- **Axios** - Cliente HTTP

### PWA
- **Service Worker** - Funcionamiento offline
- **Web App Manifest** - Instalable en dispositivos

## 📋 Funcionalidades

- ✅ Crear, editar y eliminar gastos
- ✅ Gestionar categorías personalizadas
- ✅ Interfaz moderna y responsive
- ✅ Funciona offline (interfaz básica)
- ✅ Relaciones entre gastos y categorías
- ✅ Validación frontend y backend

## 🛠️ Instalación y Uso

### Requisitos
- Python 3.10+
- Node.js 18+
- npm

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
pip install fastapi uvicorn sqlalchemy pydantic
uvicorn main:app --reload
```

El backend correrá en: http://127.0.0.1:8000

### Frontend
```bash
cd frontend
npm install
npm run dev
```

El frontend correrá en: http://localhost:5173

## 📁 Estructura del Proyecto
```
expense-tracker/
├── backend/
│   ├── main.py          # Endpoints de la API
│   ├── database.py      # Configuración de BD
│   ├── models.py        # Modelos SQLAlchemy
│   └── schemas.py       # Schemas Pydantic
├── frontend/
│   ├── src/
│   │   ├── components/  # Componentes React
│   │   ├── services/    # Llamadas a API
│   │   └── types/       # Tipos TypeScript
│   └── public/
│       ├── sw.js        # Service Worker
│       └── manifest.json
└── README.md
```

## 🔄 API Endpoints

### Gastos
- `GET /expenses/` - Listar todos
- `GET /expenses/{id}` - Obtener uno
- `POST /expenses/` - Crear
- `PUT /expenses/{id}` - Actualizar
- `DELETE /expenses/{id}` - Eliminar

### Categorías
- `GET /categories/` - Listar todas
- `POST /categories/` - Crear
- `PUT /categories/{id}` - Actualizar
- `DELETE /categories/{id}` - Eliminar

## 📱 PWA

La aplicación puede instalarse en dispositivos móviles y de escritorio. El Service Worker permite que la interfaz funcione offline (los datos requieren conexión).

## 🤝 Contribuciones

Este es un proyecto de aprendizaje. Pull requests son bienvenidos.

## 📄 Licencia

MIT