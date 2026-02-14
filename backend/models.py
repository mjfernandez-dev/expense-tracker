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
    alias_bancario = Column(String, nullable=True)
    cvu = Column(String, nullable=True)

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


# ============== MODELOS PARA DIVIDIR GASTOS ==============

# MODELO: Contactos/amigos del usuario
class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    nombre = Column(String, nullable=False)
    alias_bancario = Column(String, nullable=True)
    cvu = Column(String, nullable=True)
    linked_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    # RELACIONES
    owner = relationship("User", foreign_keys=[owner_id], backref="contacts")
    linked_user = relationship("User", foreign_keys=[linked_user_id])


# MODELO: Grupo para dividir gastos
class SplitGroup(Base):
    __tablename__ = "split_groups"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    descripcion = Column(String, nullable=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    is_active = Column(Boolean, default=True)

    # RELACIONES
    creator = relationship("User", backref="split_groups_created")
    members = relationship("SplitGroupMember", back_populates="group", cascade="all, delete-orphan")
    expenses = relationship("SplitExpense", back_populates="group", cascade="all, delete-orphan")


# MODELO: Miembro de un grupo (puede ser el creador o un contacto)
class SplitGroupMember(Base):
    __tablename__ = "split_group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("split_groups.id"), nullable=False)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    is_creator = Column(Boolean, default=False)
    display_name = Column(String, nullable=False)

    # RELACIONES
    group = relationship("SplitGroup", back_populates="members")
    contact = relationship("Contact")
    expense_participations = relationship("SplitExpenseParticipant", back_populates="member")


# MODELO: Gasto dentro de un grupo dividido
class SplitExpense(Base):
    __tablename__ = "split_expenses"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("split_groups.id"), nullable=False)
    descripcion = Column(String, nullable=False)
    importe = Column(Float, nullable=False)
    paid_by_member_id = Column(Integer, ForeignKey("split_group_members.id"), nullable=False)
    fecha = Column(DateTime, default=datetime.now)
    created_at = Column(DateTime, default=datetime.now)

    # RELACIONES
    group = relationship("SplitGroup", back_populates="expenses")
    paid_by = relationship("SplitGroupMember", foreign_keys=[paid_by_member_id])
    participants = relationship("SplitExpenseParticipant", back_populates="expense", cascade="all, delete-orphan")


# MODELO: Participante en un gasto dividido (quién comparte el gasto)
class SplitExpenseParticipant(Base):
    __tablename__ = "split_expense_participants"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("split_expenses.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("split_group_members.id"), nullable=False)
    share_amount = Column(Float, nullable=False)

    # RELACIONES
    expense = relationship("SplitExpense", back_populates="participants")
    member = relationship("SplitGroupMember", back_populates="expense_participations")