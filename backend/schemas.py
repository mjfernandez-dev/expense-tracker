# Pydantic valida que los datos recibidos/enviados por la API sean correctos
from pydantic import BaseModel, EmailStr, field_validator, PlainSerializer, Field
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional, List
import re

# Tipo para montos de dinero: precisión Decimal internamente, serializa como float en JSON
MoneyDecimal = Annotated[Decimal, PlainSerializer(lambda x: float(x), return_type=float)]


def _validate_password_strength(password: str) -> str:
    """Validación reutilizable de fortaleza de contraseña."""
    if len(password) < 8:
        raise ValueError('La contraseña debe tener al menos 8 caracteres')
    if not re.search(r'[A-Z]', password):
        raise ValueError('La contraseña debe contener al menos una mayúscula')
    if not re.search(r'[a-z]', password):
        raise ValueError('La contraseña debe contener al menos una minúscula')
    if not re.search(r'[0-9]', password):
        raise ValueError('La contraseña debe contener al menos un número')
    return password


# ============== SCHEMAS PARA USER ==============

class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None
    ahorro_objetivo_default: Optional[MoneyDecimal] = None
    porcentaje_ahorro_default: float = 10.0

    class Config:
        from_attributes = True


class PaymentInfoUpdate(BaseModel):
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None


class UserPreferencesUpdate(BaseModel):
    ahorro_objetivo_default: Optional[MoneyDecimal] = None
    porcentaje_ahorro_default: Optional[float] = None

    @field_validator("ahorro_objetivo_default")
    @classmethod
    def non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("El ahorro objetivo no puede ser negativo")
        return v

    @field_validator("porcentaje_ahorro_default")
    @classmethod
    def porcentaje_valido(cls, v):
        if v is not None and not (0 <= v <= 100):
            raise ValueError("El porcentaje de ahorro debe estar entre 0 y 100")
        return v


# Schema para el token JWT
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# ============== SCHEMAS PARA RESET / CAMBIO DE PASSWORD ==============


class PasswordResetRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=100)
    password: str = Field(..., max_length=128)


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)

# ============== SCHEMAS PARA CATEGORY ==============

# Schema BASE: Categorías del sistema (predeterminadas)
class CategoryBase(BaseModel):
    nombre: str  # Nombre de la categoría (obligatorio)
    descripcion: Optional[str] = None

# Schema para CREAR una categoría del sistema (solo admin)
class CategoryCreate(CategoryBase):
    pass

# Schema para LEER una categoría del sistema
class CategoryRead(CategoryBase):
    id: int
    es_predeterminada: bool
    
    class Config:
        from_attributes = True


# ============== SCHEMAS PARA USER CATEGORY (Categorías personalizadas) ==============

# Schema BASE: Categorías personalizadas del usuario
class UserCategoryBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    color: str = "#6366f1"  # Color hexadecimal por defecto
    icon: Optional[str] = None
    monto_default: Optional[MoneyDecimal] = None
    tiene_monto_fijo: bool = False

# Schema para CREAR una categoría personalizada
class UserCategoryCreate(UserCategoryBase):
    pass

# Schema para ACTUALIZAR una categoría personalizada
class UserCategoryUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    monto_default: Optional[MoneyDecimal] = None
    tiene_monto_fijo: Optional[bool] = None

# Schema para LEER una categoría personalizada
class UserCategoryRead(UserCategoryBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True



# ============== SCHEMAS PARA MOVIMIENTO ==============

# Schema BASE: Campos comunes
class MovimientoBase(BaseModel):
    importe: MoneyDecimal  # Monto del movimiento
    fecha: datetime  # Fecha y hora del movimiento
    descripcion: str  # Descripción obligatoria
    nota: Optional[str] = None  # Nota opcional (puede ser None)
    tipo: str = "gasto"  # "gasto" | "ingreso"
    categoria_id: Optional[int] = None  # ID de categoría del sistema
    user_category_id: Optional[int] = None  # ID de categoría personalizada
    es_inicio_ciclo: bool = False  # Si True, este ingreso inició un ciclo financiero
    is_auto_generated: bool = False  # Indica si el movimiento fue generado automáticamente
    medio_pago: Optional[str] = None  # "efectivo" | "debito" | "credito" | "transferencia" | "otro"
    presupuesto_item_id: Optional[int] = None  # Vincula un gasto real a un item del presupuesto
    clasificacion: Optional[str] = None  # "necesidad" | "deseo" | None (solo aplica a gastos)

# Schema para CREAR un movimiento (POST)
class MovimientoCreate(MovimientoBase):
    es_fijo: bool = False  # Si True, crea automáticamente un template de GastoFijo

# Schema para LEER un movimiento (GET)
# Incluye el ID y la categoría completa relacionada
class MovimientoRead(MovimientoBase):
    id: int  # ID asignado por la BD
    user_id: int  # Usuario propietario
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    presupuesto_item_id: Optional[int] = None  # FK a item de presupuesto
    gasto_fijo_id: Optional[int] = None  # FK a template de gasto fijo (si aplica)
    # RELACIÓN: Incluye la categoría completa, no solo el ID
    categoria: Optional[CategoryRead] = None  # Categoría del sistema (si está definida)
    user_category: Optional[UserCategoryRead] = None  # Categoría personalizada (si está definida)

    class Config:
        from_attributes = True  # Convierte modelos SQLAlchemy a JSON


# ============== SCHEMAS PARA CATEGORÍAS — MOVIMIENTOS AFECTADOS ==============

class MovimientoAfectado(BaseModel):
    id: int
    descripcion: str
    fecha: datetime
    importe: MoneyDecimal
    tipo: str

    class Config:
        from_attributes = True


class ReasignarMovimientosBody(BaseModel):
    nueva_categoria_id: int


# ============== SCHEMAS PARA GASTO FIJO ==============

class GastoFijoRead(BaseModel):
    id: int
    user_id: int
    descripcion: str
    categoria_id: Optional[int] = None
    user_category_id: Optional[int] = None
    activo: bool
    created_at: datetime
    categoria: Optional[CategoryRead] = None
    user_category: Optional[UserCategoryRead] = None
    max_importe: Optional[MoneyDecimal] = None    # Máximo histórico (calculado en endpoint)
    ultimo_importe: Optional[MoneyDecimal] = None  # Importe del último mes (calculado en endpoint)
    total_meses: int = 0                   # Cantidad de meses registrados
    dia_vencimiento: Optional[int] = None
    dias_anticipacion: Optional[int] = 2

    class Config:
        from_attributes = True


class GastoFijoUpdate(BaseModel):
    activo: bool
    dia_vencimiento: Optional[int] = Field(None, ge=1, le=31)
    dias_anticipacion: Optional[int] = Field(None, ge=0, le=28)


# ============== SCHEMAS PARA PRESUPUESTO POR CICLO =============

class PresupuestoItemCreate(BaseModel):
    categoria_id: Optional[int] = None
    user_category_id: Optional[int] = None
    monto_estimado: MoneyDecimal
    confirmado: bool = True
    descripcion: Optional[str] = None


class PresupuestoItemBulk(BaseModel):
    items: List[PresupuestoItemCreate]


class PresupuestoItemRead(BaseModel):
    id: int
    ciclo_id: int
    categoria_id: Optional[int] = None
    user_category_id: Optional[int] = None
    monto_estimado: MoneyDecimal
    monto_ejecutado: MoneyDecimal = Decimal('0')
    monto_pendiente: MoneyDecimal = Decimal('0')
    confirmado: bool
    descripcion: Optional[str] = None
    estado: str

    class Config:
        from_attributes = True


class GastoFijoCompromiso(BaseModel):
    """Un gasto fijo comprometido dentro del resumen del ciclo."""
    id: int
    gasto_fijo_id: Optional[int] = None
    descripcion: str
    monto_confirmado: MoneyDecimal
    monto_ejecutado: MoneyDecimal = Decimal("0")
    monto_pendiente: MoneyDecimal = Decimal("0")
    estado: str = "comprometido"


class GastoFijoConfirmItem(BaseModel):
    """Item individual para confirmar un gasto fijo en un ciclo."""
    gasto_fijo_id: Optional[int] = None
    monto_confirmado: MoneyDecimal
    confirmado: bool = True
    descripcion_override: Optional[str] = None


class GastoFijoConfirmBulk(BaseModel):
    """Lista de gastos fijos a confirmar en un ciclo."""
    items: List[GastoFijoConfirmItem]


class CicloCreate(BaseModel):
    movimiento_origen_id: Optional[int] = None
    fecha_fin: datetime
    ahorro_objetivo: MoneyDecimal = Decimal('0')


class CicloUpdate(BaseModel):
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    ahorro_objetivo: Optional[MoneyDecimal] = None


class CicloResumen(BaseModel):
    ciclo_id: int
    fecha_inicio: datetime
    fecha_fin: datetime
    dias_restantes: int
    total_ingresos: MoneyDecimal
    ahorro_objetivo: MoneyDecimal
    gastos_fijos_confirmados: MoneyDecimal
    gastos_fijos_pendientes: MoneyDecimal
    gastos_fijos_efectivizados: MoneyDecimal
    saldo_disponible_total: MoneyDecimal
    total_gastos: MoneyDecimal
    gastos_no_planificados: MoneyDecimal
    saldo_disponible_actual: MoneyDecimal
    daily_cap: MoneyDecimal
    gasto_hoy: MoneyDecimal
    daily_cap_porcentaje_usado: float
    semaforo: str
    presupuesto_items: List[PresupuestoItemRead] = []
    gastos_fijos: List[GastoFijoCompromiso] = []


class CicloRead(BaseModel):
    id: int
    user_id: int
    movimiento_origen_id: Optional[int] = None
    fecha_inicio: datetime
    fecha_fin: datetime
    ahorro_objetivo: MoneyDecimal
    activo: bool
    created_at: datetime
    resumen: Optional[CicloResumen] = None

    class Config:
        from_attributes = True


# ============== SCHEMAS PARA PUSH NOTIFICATIONS ==============

class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushSubscribeResponse(BaseModel):
    id: int
    message: str


# ============== SCHEMAS PARA INVERSIONES ==============

class InversionCreate(BaseModel):
    nombre: str
    ticker: Optional[str] = None
    cuotapartes: Optional[MoneyDecimal] = None
    monto_invertido: Optional[MoneyDecimal] = None
    fecha_inversion: Optional[datetime] = None
    notas: Optional[str] = None


class InversionUpdate(BaseModel):
    nombre: Optional[str] = None
    ticker: Optional[str] = None
    cuotapartes: Optional[MoneyDecimal] = None
    monto_invertido: Optional[MoneyDecimal] = None
    fecha_inversion: Optional[datetime] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None


class InversionRead(BaseModel):
    id: int
    user_id: int
    nombre: str
    ticker: Optional[str] = None
    cuotapartes: Optional[MoneyDecimal] = None
    monto_invertido: Optional[MoneyDecimal] = None
    fecha_inversion: Optional[datetime] = None
    notas: Optional[str] = None
    activo: bool
    created_at: datetime
    updated_at: datetime
    valor_actual: Optional[MoneyDecimal] = None
    rendimiento_pct: Optional[float] = None
    ganancia_perdida: Optional[MoneyDecimal] = None
    ultimo_valor_cuota: Optional[MoneyDecimal] = None
    ultima_actualizacion: Optional[datetime] = None

    class Config:
        from_attributes = True


class HistorialCreate(BaseModel):
    fecha: datetime
    valor_cuota: MoneyDecimal
    fuente: str = "manual"


class HistorialRead(BaseModel):
    id: int
    inversion_id: int
    fecha: datetime
    valor_cuota: MoneyDecimal
    fuente: str
    created_at: datetime

    class Config:
        from_attributes = True


class InversionDetailRead(InversionRead):
    historial: List[HistorialRead] = []

