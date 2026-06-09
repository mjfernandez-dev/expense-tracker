# Importamos tipos de columnas y herramientas de SQLAlchemy
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
# CONEXIÓN: Importamos Base desde database.py (la clase padre de todos los modelos)
from database import Base
from encryption import EncryptedString
from services.ciclo_time_service import ahora_buenos_aires  # ← IMPORTAMOS FUNCIÓN BA


# MODELO: Tabla de usuarios
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=ahora_buenos_aires)
    alias_bancario = Column(EncryptedString, nullable=True)
    cvu = Column(EncryptedString, nullable=True)
    ahorro_objetivo_default = Column(Numeric(10, 2), nullable=True, default=None)
    porcentaje_ahorro_default = Column(Numeric(5, 2), nullable=False, default=Decimal('10.0'))

    # RELACIÓN 1-a-N: Un usuario tiene MUCHOS movimientos
    movimientos = relationship("Movimiento", back_populates="usuario")
    gastos_fijos = relationship("GastoFijo", back_populates="usuario")


# MODELO: Tabla de refresh tokens (para renovar access tokens sin re-login)
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)  # SHA256 del token raw
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    user = relationship("User")


# MODELO: Tabla de tokens para restablecer contraseña
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)

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
    created_at = Column(DateTime, default=ahora_buenos_aires)

    # RELACIÓN: Movimientos que usan esta categoría del sistema
    movimientos = relationship("Movimiento", back_populates="categoria")
    gastos_fijos = relationship("GastoFijo", back_populates="categoria")


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
    monto_default = Column(Numeric(10, 2), nullable=True, default=None)
    tiene_monto_fijo = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)
    updated_at = Column(DateTime, default=ahora_buenos_aires, onupdate=ahora_buenos_aires)
    
    # ✅ Unique constraint por usuario: permite mismo nombre en diferentes usuarios
    __table_args__ = (
        UniqueConstraint('user_id', 'nombre', name='uq_user_categoria_nombre'),
    )
    
    # RELACIONES
    usuario = relationship("User", backref="categorias_personalizadas")
    movimientos = relationship("Movimiento", back_populates="user_category")
    gastos_fijos = relationship("GastoFijo", back_populates="user_category")



# ============== PRESUPUESTO POR CICLO =============

# MODELO: Item de presupuesto para un ciclo específico
class PresupuestoItem(Base):
    __tablename__ = "presupuesto_items"

    id = Column(Integer, primary_key=True, index=True)
    ciclo_id = Column(Integer, ForeignKey("ciclos.id"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)
    monto_estimado = Column(Numeric(10, 2), nullable=False)
    confirmado = Column(Boolean, default=True, nullable=False)
    descripcion = Column(EncryptedString, nullable=True)
    estado = Column(String, default="pendiente", nullable=False)
    gasto_fijo_id = Column(Integer, ForeignKey("gastos_fijos.id"), nullable=True, index=True)

    # RELACIONES
    ciclo = relationship("Ciclo", back_populates="presupuesto_items")
    movimientos = relationship("Movimiento", back_populates="presupuesto_item")
    gasto_fijo = relationship("GastoFijo", back_populates="presupuesto_items")


# MODELO 2: Tabla de movimientos (gastos e ingresos)
class Movimiento(Base):
    __tablename__ = "movimientos"

    # COLUMNAS principales
    id = Column(Integer, primary_key=True, index=True)
    importe = Column(Numeric(10, 2), nullable=False)  # Monto del movimiento
    fecha = Column(DateTime, default=ahora_buenos_aires)  # Se asigna automáticamente la fecha actual
    descripcion = Column(EncryptedString, nullable=False)  # Obligatoria
    nota = Column(EncryptedString, nullable=True)  # Opcional (puede ser NULL)
    tipo = Column(String, default="gasto", nullable=False)  # "gasto" | "ingreso"
    created_at = Column(DateTime, default=ahora_buenos_aires)
    updated_at = Column(DateTime, default=ahora_buenos_aires, onupdate=ahora_buenos_aires)

    # CLAVES FORÁNEAS: Un movimiento puede estar asociado con:
    # - Una categoría del sistema (categoria_id) O
    # - Una categoría personalizada del usuario (user_category_id)
    # Al menos una DEBE estar definida
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)

    # CLAVE FORÁNEA: Un movimiento siempre pertenece a UN usuario
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # PRESUPUESTO: FK opcional a item del presupuesto del ciclo
    presupuesto_item_id = Column(Integer, ForeignKey("presupuesto_items.id"), nullable=True, index=True)
    # GASTO FIJO: FK opcional al gasto fijo recurrente
    gasto_fijo_id = Column(Integer, ForeignKey("gastos_fijos.id"), nullable=True, index=True)
    # CLASIFICACIÓN: "necesidad" | "deseo" | None (solo aplica a gastos)
    clasificacion = Column(String, nullable=True)

    # RELACIONES
    categoria = relationship("Category", back_populates="movimientos")  # Categoría del sistema
    user_category = relationship("UserCategory", back_populates="movimientos")  # Categoría personalizada
    usuario = relationship("User", back_populates="movimientos")
    presupuesto_item = relationship("PresupuestoItem", back_populates="movimientos")
    gasto_fijo = relationship("GastoFijo", back_populates="movimientos")

    # CICLO FINANCIERO: flag que indica si este ingreso inició un ciclo
    es_inicio_ciclo = Column(Boolean, default=False, nullable=False)
    # FLAG: indica si el movimiento fue generado automáticamente (ej. gastos fijos)
    is_auto_generated = Column(Boolean, default=False, nullable=False)
    # MEDIO DE PAGO: "efectivo" | "debito" | "credito" | "transferencia" | "otro"
    medio_pago = Column(String, nullable=True)

    def __init__(self, **kwargs):
        """Validar que al menos una categoría esté definida."""
        super().__init__(**kwargs)
        if self.categoria_id is None and self.user_category_id is None:
            raise ValueError("Un movimiento debe tener al menos una categoría (sistema o personalizada)")


# ============== MODELO PARA GASTOS FIJOS RECURRENTES ==============
class GastoFijo(Base):
    __tablename__ = "gastos_fijos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    descripcion = Column(EncryptedString, nullable=False)
    categoria_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    user_category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)
    dia_vencimiento = Column(Integer, nullable=True)
    dias_anticipacion = Column(Integer, nullable=True, default=2)

    # RELACIONES
    usuario = relationship("User", back_populates="gastos_fijos")
    categoria = relationship("Category", back_populates="gastos_fijos")
    user_category = relationship("UserCategory", back_populates="gastos_fijos")
    movimientos = relationship("Movimiento", back_populates="gasto_fijo")
    presupuesto_items = relationship("PresupuestoItem", back_populates="gasto_fijo")


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
    created_at = Column(DateTime, default=ahora_buenos_aires)

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
    created_at = Column(DateTime, default=ahora_buenos_aires)
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
    importe = Column(Numeric(10, 2), nullable=False)
    paid_by_member_id = Column(Integer, ForeignKey("split_group_members.id"), nullable=False)
    fecha = Column(DateTime, default=ahora_buenos_aires)
    created_at = Column(DateTime, default=ahora_buenos_aires)

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
    share_amount = Column(Numeric(10, 2), nullable=False)

    # RELACIONES
    expense = relationship("SplitExpense", back_populates="participants")
    member = relationship("SplitGroupMember", back_populates="expense_participations")


# ============== MÓDULO DAILY SOLVENCY ==============

# MODELO: Ciclo financiero (período entre cobros)
class Ciclo(Base):
    __tablename__ = "ciclos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Movimiento de ingreso que inició este ciclo (opcional, puede crearse manualmente)
    movimiento_origen_id = Column(Integer, ForeignKey("movimientos.id", ondelete="SET NULL"), nullable=True)
    fecha_inicio = Column(DateTime, nullable=False)  # Cuando se creó el ciclo
    fecha_fin = Column(DateTime, nullable=False)      # Hasta cuándo debe durar el dinero
    ahorro_objetivo = Column(Numeric(10, 2), default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    # RELACIONES
    usuario = relationship("User")
    movimiento_origen = relationship("Movimiento", foreign_keys=[movimiento_origen_id])
    presupuesto_items = relationship("PresupuestoItem", back_populates="ciclo", cascade="all, delete-orphan")


# ============== PUSH NOTIFICATIONS ==============

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    usuario = relationship("User")

# ============== INVERSIONES (FCI TRACKING) ==============

class Inversion(Base):
    """
    FCI investment tracking configuration.
    Each record represents a user's investment in a specific FCI.
    """
    __tablename__ = "inversiones"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nombre = Column(String, nullable=False)
    ticker = Column(String, nullable=True)
    cuotapartes = Column(Numeric(14, 4), nullable=True)
    monto_invertido = Column(Numeric(10, 2), nullable=True)
    fecha_inversion = Column(DateTime, nullable=True)
    notas = Column(EncryptedString, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)
    updated_at = Column(DateTime, default=ahora_buenos_aires, onupdate=ahora_buenos_aires)

    usuario = relationship("User", backref="inversiones")
    historial = relationship("HistorialInversion", back_populates="inversion", cascade="all, delete-orphan")


class HistorialInversion(Base):
    """
    Historical price snapshots for an FCI investment.
    One record per day per investment.
    """
    __tablename__ = "inversiones_historial"

    id = Column(Integer, primary_key=True, index=True)
    inversion_id = Column(Integer, ForeignKey("inversiones.id", ondelete="CASCADE"), nullable=False, index=True)
    fecha = Column(DateTime, nullable=False)
    valor_cuota = Column(Numeric(14, 6), nullable=False)
    fuente = Column(String, default="manual", nullable=False)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    __table_args__ = (
        UniqueConstraint("inversion_id", "fecha", name="uq_inversion_fecha"),
    )

    inversion = relationship("Inversion", back_populates="historial")
