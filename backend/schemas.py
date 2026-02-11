# Pydantic valida que los datos recibidos/enviados por la API sean correctos
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


# ============== SCHEMAS PARA USER ==============

class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str  # Password en texto plano (se hasheará en el backend)


class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Schema para el token JWT
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# ============== SCHEMAS PARA RESET / CAMBIO DE PASSWORD ==============


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

# ============== SCHEMAS PARA CATEGORY ==============

# Schema BASE: Campos comunes entre crear y leer categorías
class CategoryBase(BaseModel):
    nombre: str  # Nombre de la categoría (obligatorio)

# Schema para CREAR una categoría (lo que recibe el endpoint POST)
# Hereda de CategoryBase y puede agregar campos adicionales si es necesario
class CategoryCreate(CategoryBase):
    pass  # Por ahora solo necesita 'nombre', lo hereda de CategoryBase

# Schema para LEER una categoría (lo que devuelve la API al cliente)
# Incluye campos que vienen de la BD como 'id' y 'es_predeterminada'
class CategoryRead(CategoryBase):
    id: int  # ID asignado por la base de datos
    es_predeterminada: bool  # Indica si es del sistema o creada por el usuario
    
    # CONFIGURACIÓN: Permite que Pydantic convierta objetos SQLAlchemy a JSON
    class Config:
        from_attributes = True  # Antes se llamaba 'orm_mode = True'


# ============== SCHEMAS PARA EXPENSE ==============

# Schema BASE: Campos comunes
class ExpenseBase(BaseModel):
    importe: float  # Monto del gasto
    fecha: datetime  # Fecha y hora del gasto
    descripcion: str  # Descripción obligatoria
    nota: Optional[str] = None  # Nota opcional (puede ser None)
    categoria_id: int  # ID de la categoría a la que pertenece

# Schema para CREAR un gasto (POST)
class ExpenseCreate(ExpenseBase):
    pass  # Hereda todos los campos de ExpenseBase

# Schema para LEER un gasto (GET)
# Incluye el ID y la categoría completa relacionada
class ExpenseRead(ExpenseBase):
    id: int  # ID asignado por la BD
    # RELACIÓN: Incluye la categoría completa, no solo el ID
    categoria: CategoryRead  # Objeto Category completo (con id, nombre, etc.)
    
    class Config:
        from_attributes = True  # Convierte modelos SQLAlchemy a JSON