# FastAPI es el framework web que maneja las peticiones HTTP
from fastapi import FastAPI, Depends, HTTPException
# SQLAlchemy Session para interactuar con la base de datos
from sqlalchemy.orm import Session
# Importamos typing para tipar listas
from typing import List

# CONEXIÓN: Importamos configuración de BD desde database.py
from database import engine, get_db, Base
# CONEXIÓN: Importamos los modelos (tablas) desde models.py
import models
# CONEXIÓN: Importamos los schemas (validación) desde schemas.py
import schemas
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
# ============== ENDPOINTS DE GASTOS ==============

# CREAR gasto - POST /expenses/
@app.post("/expenses/", response_model=schemas.ExpenseRead)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db)
):
    # VALIDACIÓN: Verificar que la categoría existe
    category_exists = db.query(models.Category).filter(
        models.Category.id == expense.categoria_id
    ).first()
    
    if not category_exists:
        # HTTP 404: Categoría no encontrada
        raise HTTPException(status_code=404, detail="Categoría no existe")
    
    # Crear el gasto
    db_expense = models.Expense(**expense.dict())  # Desempaqueta todos los campos
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense


# ELIMINAR gasto - DELETE /expenses/{expense_id}
@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    # Buscar el gasto en la BD
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    
    # Eliminar de la BD
    db.delete(expense)
    db.commit()  # Ejecuta DELETE FROM expenses WHERE id = expense_id
    
    return {"message": "Gasto eliminado correctamente"}


# ACTUALIZAR gasto - PUT /expenses/{expense_id}
@app.put("/expenses/{expense_id}", response_model=schemas.ExpenseRead)
def update_expense(
    expense_id: int,
    expense_update: schemas.ExpenseCreate,  # Recibe los datos actualizados
    db: Session = Depends(get_db)
):
    # Buscar el gasto existente
    db_expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    
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
    
    # Guardar cambios
    db.commit()
    db.refresh(db_expense)  # Recarga el objeto con los datos actualizados
    
    return db_expense

# LISTAR todos los gastos - GET /expenses/
# Devuelve la lista con las categorías relacionadas incluidas
@app.get("/expenses/", response_model=List[schemas.ExpenseRead])
def list_expenses(db: Session = Depends(get_db)):
    # SELECT * FROM expenses (SQLAlchemy carga automáticamente las relaciones)
    expenses = db.query(models.Expense).all()
    return expenses


# OBTENER un gasto por ID - GET /expenses/{expense_id}
@app.get("/expenses/{expense_id}", response_model=schemas.ExpenseRead)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    # SELECT * FROM expenses WHERE id = expense_id
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    
    return expense


# Endpoint raíz para verificar que la API funciona
@app.get("/")
def root():
    return {"message": "API de Gastos funcionando correctamente"}