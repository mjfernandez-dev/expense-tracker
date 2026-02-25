# Importamos tipos de columnas y herramientas de SQLAlchemy
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
# CONEXIÓN: Importamos Base desde database.py (la clase padre de todos los modelos)
from database import Base
from datetime import datetime
from encryption import EncryptedString


# MODELO: Tabla de usuarios
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    alias_bancario = Column(EncryptedString, nullable=True)
    cvu = Column(EncryptedString, nullable=True)

    # RELACIÓN 1-a-N: Un usuario tiene MUCHOS movimientos
    movimientos = relationship("Movimiento", back_populates="usuario")


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


# MODELO 1: Tabla de categorías del sistema (predeterminadas)
class Category(Base):
    """
    Categorías predeterminadas del sistema (ej: 'Comida', 'Transporte', etc).
    Estas son de solo lectura para los usuarios.
    """
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, unique=True, index=True)  # Único global
    descripcion = Column(String, nullable=True)
    es_predeterminada = Column(Boolean, default=True)  # Siempre True para este modelo
    created_at = Column(DateTime, default=datetime.now)
    
    # RELACIÓN: Movimientos que usan esta categoría del sistema
    movimientos = relationship("Movimiento", back_populates="categoria")


# MODELO: Tabla de categorías personalizadas del usuario (MULTI-TENANCY)
class UserCategory(Base):
    """
    Categorías personalizadas creadas por cada usuario.
    Cada usuario puede tener sus propias categorías.
    No interfieren con las de otros usuarios.
    """
    __tablename__ = "user_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # Vincular al usuario
    nombre = Column(String, nullable=False)  # NO es unique global
    descripcion = Column(String, nullable=True)
    color = Column(String, default="#6366f1", nullable=False)  # Color para UI (hex)
    icon = Column(String, nullable=True)  # Ícono para UI (emoji o nombre)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # ✅ Unique constraint por usuario: permite mismo nombre en diferentes usuarios
    __table_args__ = (
        UniqueConstraint('user_id', 'nombre', name='uq_user_categoria_nombre'),
    )
    
    # RELACIONES
    usuario = relationship("User", backref="categorias_personalizadas")
    movimientos = relationship("Movimiento", back_populates="user_category")



# MODELO: Gastos fijos recurrentes (template mensual)
class GastoFijo(Base):
    __tablename__ = "gastos_fijos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    descripcion = Column(EncryptedString, nullable=False)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    # RELACIONES
    usuario = relationship("User")
    categoria = relationship("Category")
    user_category = relationship("UserCategory")
    instancias = relationship("Movimiento", back_populates="gasto_fijo")


# MODELO 2: Tabla de movimientos (gastos e ingresos)
class Movimiento(Base):
    __tablename__ = "movimientos"

    # COLUMNAS principales
    id = Column(Integer, primary_key=True, index=True)
    importe = Column(Float, nullable=False)  # Monto del movimiento
    fecha = Column(DateTime, default=datetime.now)  # Se asigna automáticamente la fecha actual
    descripcion = Column(EncryptedString, nullable=False)  # Obligatoria
    nota = Column(EncryptedString, nullable=True)  # Opcional (puede ser NULL)
    tipo = Column(String, default="gasto", nullable=False)  # "gasto" | "ingreso"
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # CLAVES FORÁNEAS: Un movimiento puede estar asociado con:
    # - Una categoría del sistema (categoria_id) O
    # - Una categoría personalizada del usuario (user_category_id)
    # Al menos una DEBE estar definida
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)

    # CLAVE FORÁNEA: Un movimiento siempre pertenece a UN usuario
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # GASTO FIJO: FK opcional al template (si fue generado automáticamente)
    gasto_fijo_id = Column(Integer, ForeignKey("gastos_fijos.id"), nullable=True, index=True)
    is_auto_generated = Column(Boolean, default=False, nullable=False)

    # RELACIONES
    categoria = relationship("Category", back_populates="movimientos")  # Categoría del sistema
    user_category = relationship("UserCategory", back_populates="movimientos")  # Categoría personalizada
    usuario = relationship("User", back_populates="movimientos")
    gasto_fijo = relationship("GastoFijo", back_populates="instancias")

    def __init__(self, **kwargs):
        """Validar que al menos una categoría esté definida."""
        super().__init__(**kwargs)
        if self.categoria_id is None and self.user_category_id is None:
            raise ValueError("Un movimiento debe tener al menos una categoría (sistema o personalizada)")



# ============== MODELOS PARA DIVIDIR GASTOS ==============

# MODELO: Contactos/amigos del usuario
class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    nombre = Column(EncryptedString, nullable=False)
    alias_bancario = Column(EncryptedString, nullable=True)
    cvu = Column(EncryptedString, nullable=True)
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
    display_name = Column(EncryptedString, nullable=False)

    # RELACIONES
    group = relationship("SplitGroup", back_populates="members")
    contact = relationship("Contact")
    expense_participations = relationship("SplitExpenseParticipant", back_populates="member")


# MODELO: Gasto dentro de un grupo dividido
class SplitExpense(Base):
    __tablename__ = "split_expenses"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("split_groups.id"), nullable=False)
    descripcion = Column(EncryptedString, nullable=False)
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


# ============== MODELO PARA PAGOS MERCADO PAGO ==============

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("split_groups.id"), nullable=False)
    from_member_id = Column(Integer, ForeignKey("split_group_members.id"), nullable=False)
    to_member_id = Column(Integer, ForeignKey("split_group_members.id"), nullable=False)
    amount = Column(Float, nullable=False)

    # Mercado Pago
    mp_preference_id = Column(String, nullable=True)
    mp_payment_id = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending, approved, rejected, cancelled

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # RELACIONES
    group = relationship("SplitGroup")
    from_member = relationship("SplitGroupMember", foreign_keys=[from_member_id])
    to_member = relationship("SplitGroupMember", foreign_keys=[to_member_id])