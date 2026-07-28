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


# ============== WISHLIST (LISTA DE DESEOS) ==============

class WishlistItem(Base):
    """Item de wishlist con wish farm y prioridades."""
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(EncryptedString, nullable=False)
    estimated_cost = Column(Numeric(10, 2), nullable=False)
    monto_ahorrado = Column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    priority = Column(String, nullable=False, default="media")
    status = Column(String, nullable=False, default="draft")
    category_id = Column(Integer, ForeignKey("user_categories.id"), nullable=True)
    notes = Column(EncryptedString, nullable=True)
    created_at = Column(DateTime, default=ahora_buenos_aires)
    updated_at = Column(DateTime, default=ahora_buenos_aires, onupdate=ahora_buenos_aires)

    usuario = relationship("User", backref="wishlist_items")
    category = relationship("UserCategory", backref="wishlist_items")
    contributions = relationship("GoalContribution", back_populates="goal", cascade="all, delete-orphan")


# ============== GOAL CONTRIBUTIONS ==============

class GoalContribution(Base):
    """Track per-source money movements to/from a wishlist goal."""
    __tablename__ = "goal_contributions"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("wishlist_items.id"), nullable=False, index=True)
    ciclo_id = Column(Integer, ForeignKey("ciclos.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)  # positive=contribute, negative=withdraw
    source_type = Column(String, nullable=False)  # "disponible" | "presupuesto"
    presupuesto_item_id = Column(Integer, ForeignKey("presupuesto_items.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    goal = relationship("WishlistItem", back_populates="contributions")
    ciclo = relationship("Ciclo", backref="goal_contributions")
    presupuesto_item = relationship("PresupuestoItem", backref="goal_contributions")


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
