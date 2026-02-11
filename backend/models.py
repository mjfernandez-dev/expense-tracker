# Importamos tipos de columnas y herramientas de SQLAlchemy
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
# CONEXIÓN: Importamos Base desde database.py (la clase padre de todos los modelos)
from database import Base
from datetime import datetime


# MODELO: Tabla de usuarios
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    # RELACIÓN 1-a-N: Un usuario tiene MUCHOS gastos
    gastos = relationship("Expense", back_populates="usuario")


# MODELO: Tabla de tokens para restablecer contraseña
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

    # RELACIÓN N-a-1: Muchos tokens pertenecen a UN usuario
    user = relationship("User")


# MODELO 1: Tabla de categorías
class Category(Base):
    # Nombre real de la tabla en la base de datos
    __tablename__ = "categories"
    
    # COLUMNAS: Definen la estructura de la tabla
    id = Column(Integer, primary_key=True, index=True)  # Identificador único autoincremental
    nombre = Column(String, nullable=False, unique=True)  # Nombre único, no puede ser NULL
    es_predeterminada = Column(Boolean, default=False)  # True si es del sistema, False si la creó el usuario
    
    # RELACIÓN 1-a-N: Una categoría tiene MUCHOS gastos
    # "Expense" es el nombre de la clase relacionada (definida abajo)
    # back_populates="categoria" conecta bidireccionalmente con el campo 'categoria' de Expense
    gastos = relationship("Expense", back_populates="categoria")


# MODELO 2: Tabla de gastos
class Expense(Base):
    __tablename__ = "expenses"

    # COLUMNAS principales
    id = Column(Integer, primary_key=True, index=True)
    importe = Column(Float, nullable=False)  # Monto del gasto
    fecha = Column(DateTime, default=datetime.now)  # Se asigna automáticamente la fecha actual
    descripcion = Column(String, nullable=False)  # Obligatoria
    nota = Column(String, nullable=True)  # Opcional (puede ser NULL)

    # CLAVE FORÁNEA: Conecta este gasto con una categoría
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=False)

    # CLAVE FORÁNEA: Conecta este gasto con un usuario
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # RELACIÓN N-a-1: Muchos gastos pertenecen a UNA categoría
    categoria = relationship("Category", back_populates="gastos")

    # RELACIÓN N-a-1: Muchos gastos pertenecen a UN usuario
    usuario = relationship("User", back_populates="gastos")