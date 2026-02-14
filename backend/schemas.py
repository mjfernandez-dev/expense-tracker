# Pydantic valida que los datos recibidos/enviados por la API sean correctos
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional, List


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
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None

    class Config:
        from_attributes = True


class PaymentInfoUpdate(BaseModel):
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None


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


# ============== SCHEMAS PARA CONTACT ==============

class ContactBase(BaseModel):
    nombre: str
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None
    linked_user_id: Optional[int] = None


class ContactCreate(ContactBase):
    pass


class ContactRead(ContactBase):
    id: int
    owner_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============== SCHEMAS PARA SPLIT GROUP ==============

class SplitGroupMemberRead(BaseModel):
    id: int
    group_id: int
    contact_id: Optional[int] = None
    is_creator: bool
    display_name: str
    contact: Optional[ContactRead] = None

    class Config:
        from_attributes = True


class SplitGroupBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class SplitGroupCreate(SplitGroupBase):
    member_contact_ids: List[int] = []


class SplitGroupRead(SplitGroupBase):
    id: int
    creator_id: int
    is_active: bool
    created_at: datetime
    members: List[SplitGroupMemberRead] = []

    class Config:
        from_attributes = True


class AddMemberRequest(BaseModel):
    contact_id: int


class QuickAddMemberRequest(BaseModel):
    nombre: str
    alias_bancario: Optional[str] = None
    cvu: Optional[str] = None


# ============== SCHEMAS PARA SPLIT EXPENSE ==============

class SplitExpenseParticipantRead(BaseModel):
    id: int
    member_id: int
    share_amount: float
    member: SplitGroupMemberRead

    class Config:
        from_attributes = True


class SplitExpenseBase(BaseModel):
    descripcion: str
    importe: float
    paid_by_member_id: int
    fecha: Optional[datetime] = None

    @field_validator('importe')
    @classmethod
    def importe_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError('El importe debe ser mayor a 0')
        return v


class SplitExpenseCreate(SplitExpenseBase):
    participant_member_ids: List[int]


class SplitExpenseRead(SplitExpenseBase):
    id: int
    group_id: int
    created_at: datetime
    paid_by: SplitGroupMemberRead
    participants: List[SplitExpenseParticipantRead] = []

    class Config:
        from_attributes = True


# ============== SCHEMAS PARA BALANCES ==============

class MemberBalance(BaseModel):
    member_id: int
    display_name: str
    total_paid: float
    total_share: float
    net_balance: float
    contact: Optional[ContactRead] = None


class DebtTransfer(BaseModel):
    from_member_id: int
    from_display_name: str
    to_member_id: int
    to_display_name: str
    amount: float
    to_alias_bancario: Optional[str] = None
    to_cvu: Optional[str] = None


class GroupBalanceSummary(BaseModel):
    group_id: int
    group_name: str
    total_expenses: float
    balances: List[MemberBalance]
    simplified_debts: List[DebtTransfer]