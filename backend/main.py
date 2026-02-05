# FastAPI es el framework web que maneja las peticiones HTTP
from fastapi import FastAPI, Depends, HTTPException, status
# SQLAlchemy Session para interactuar con la base de datos
from sqlalchemy.orm import Session
# Importamos typing para tipar listas
from typing import List
from datetime import timedelta

# Para el formulario de login
from fastapi.security import OAuth2PasswordRequestForm

# CONEXIÓN: Importamos configuración de BD desde database.py
from database import engine, get_db, Base
# CONEXIÓN: Importamos los modelos (tablas) desde models.py
import models
# CONEXIÓN: Importamos los schemas (validación) desde schemas.py
import schemas
# CONEXIÓN: Importamos utilidades de autenticación
from auth import (
    get_password_hash,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    get_user_by_username,
    get_user_by_email,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
# CORS Middleware para permitir peticiones desde el frontend
from fastapi.middleware.cors import CORSMiddleware


# Crear todas las tablas en la base de datos si no existen
# Lee los modelos (Category, Expense) y ejecuta CREATE TABLE automáticamente
Base.metadata.create_all(bind=engine)

# Crear la aplicación FastAPI
app = FastAPI(title="Expense Tracker API")

# CONFIGURACIÓN CORS: Permite peticiones desde el frontend
# Sin esto, el navegador bloquea las llamadas HTTP por seguridad
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # URL del frontend
    allow_credentials=True,
    allow_methods=["*"],  # Permite GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],  # Permite todos los headers
)

# ============== ENDPOINTS DE AUTENTICACIÓN ==============

# REGISTRAR usuario - POST /auth/register
@app.post("/auth/register", response_model=schemas.UserRead)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Verificar si el username ya existe
    if get_user_by_username(db, user.username):
        raise HTTPException(
            status_code=400,
            detail="El nombre de usuario ya está registrado"
        )
    # Verificar si el email ya existe
    if get_user_by_email(db, user.email):
        raise HTTPException(
            status_code=400,
            detail="El email ya está registrado"
        )

    # Crear el usuario con password hasheado
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# LOGIN - POST /auth/login
@app.post("/auth/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


# OBTENER usuario actual - GET /auth/me
@app.get("/auth/me", response_model=schemas.UserRead)
def get_me(current_user: models.User = Depends(get_current_active_user)):
    return current_user


# ============== ENDPOINTS DE CATEGORÍAS ==============

# CREAR categoría - POST /categories/
# Recibe: CategoryCreate (nombre)
# Devuelve: CategoryRead (id, nombre, es_predeterminada)
@app.post("/categories/", response_model=schemas.CategoryRead)
def create_category(
    category: schemas.CategoryCreate,  # Datos validados por Pydantic
    db: Session = Depends(get_db)  # Inyección de dependencia: obtiene sesión de BD
):
    # Crear instancia del modelo Category (SQLAlchemy)
    db_category = models.Category(
        nombre=category.nombre,
        es_predeterminada=False  # Las que crea el usuario no son predeterminadas
    )
    # Agregar a la sesión y guardar en BD
    db.add(db_category)
    db.commit()  # Ejecuta INSERT INTO categories...
    db.refresh(db_category)  # Actualiza el objeto con el ID generado
    return db_category  # FastAPI lo convierte a JSON usando CategoryRead


# LISTAR todas las categorías - GET /categories/
# Devuelve: Lista de CategoryRead
@app.get("/categories/", response_model=List[schemas.CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    # Consulta SQL: SELECT * FROM categories
    categories = db.query(models.Category).all()
    return categories

# ELIMINAR categoría - DELETE /categories/{category_id}
@app.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    # Buscar la categoría
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # VALIDACIÓN: Verificar si hay gastos usando esta categoría
    # No permitir eliminar categorías con gastos asociados (integridad referencial)
    gastos_count = db.query(models.Expense).filter(
        models.Expense.categoria_id == category_id
    ).count()
    
    if gastos_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"No se puede eliminar. Hay {gastos_count} gasto(s) usando esta categoría"
        )
    
    # Eliminar categoría
    db.delete(category)
    db.commit()
    
    return {"message": "Categoría eliminada correctamente"}


# ACTUALIZAR categoría - PUT /categories/{category_id}
@app.put("/categories/{category_id}", response_model=schemas.CategoryRead)
def update_category(
    category_id: int,
    category_update: schemas.CategoryCreate,  # Solo recibe el nombre
    db: Session = Depends(get_db)
):
    # Buscar la categoría existente
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()
    
    if not db_category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # VALIDACIÓN: Verificar que el nuevo nombre no exista ya
    existing = db.query(models.Category).filter(
        models.Category.nombre == category_update.nombre,
        models.Category.id != category_id  # Excepto la misma categoría
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    
    # Actualizar nombre
    db_category.nombre = category_update.nombre
    
    db.commit()
    db.refresh(db_category)
    
    return db_category
# ============== ENDPOINTS DE GASTOS (PROTEGIDOS) ==============

# CREAR gasto - POST /expenses/
@app.post("/expenses/", response_model=schemas.ExpenseRead)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # VALIDACIÓN: Verificar que la categoría existe
    category_exists = db.query(models.Category).filter(
        models.Category.id == expense.categoria_id
    ).first()

    if not category_exists:
        raise HTTPException(status_code=404, detail="Categoría no existe")

    # Crear el gasto asociado al usuario actual
    db_expense = models.Expense(
        **expense.model_dump(),
        user_id=current_user.id
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense


# ELIMINAR gasto - DELETE /expenses/{expense_id}
@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Buscar el gasto del usuario actual
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == current_user.id
    ).first()

    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(expense)
    db.commit()

    return {"message": "Gasto eliminado correctamente"}


# ACTUALIZAR gasto - PUT /expenses/{expense_id}
@app.put("/expenses/{expense_id}", response_model=schemas.ExpenseRead)
def update_expense(
    expense_id: int,
    expense_update: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Buscar el gasto del usuario actual
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == current_user.id
    ).first()

    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    # Verificar que la categoría existe
    category_exists = db.query(models.Category).filter(
        models.Category.id == expense_update.categoria_id
    ).first()

    if not category_exists:
        raise HTTPException(status_code=404, detail="Categoría no existe")

    # ACTUALIZAR campos del gasto existente
    db_expense.importe = expense_update.importe
    db_expense.fecha = expense_update.fecha
    db_expense.descripcion = expense_update.descripcion
    db_expense.nota = expense_update.nota
    db_expense.categoria_id = expense_update.categoria_id

    db.commit()
    db.refresh(db_expense)

    return db_expense


# LISTAR gastos del usuario - GET /expenses/
@app.get("/expenses/", response_model=List[schemas.ExpenseRead])
def list_expenses(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Solo devuelve los gastos del usuario actual
    expenses = db.query(models.Expense).filter(
        models.Expense.user_id == current_user.id
    ).all()
    return expenses


# OBTENER un gasto por ID - GET /expenses/{expense_id}
@app.get("/expenses/{expense_id}", response_model=schemas.ExpenseRead)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    # Solo busca en los gastos del usuario actual
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == current_user.id
    ).first()

    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    return expense


# Endpoint raíz para verificar que la API funciona
@app.get("/")
def root():
    return {"message": "API de Gastos funcionando correctamente"}