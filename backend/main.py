# FastAPI es el framework web que maneja las peticiones HTTP
from fastapi import FastAPI, Depends, HTTPException, status
# SQLAlchemy Session para interactuar con la base de datos
from sqlalchemy.orm import Session, joinedload
# Importamos typing para tipar listas
from typing import List
from datetime import datetime, timedelta
import math
from uuid import uuid4
import hmac
import hashlib

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
    verify_password,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    get_user_by_username,
    get_user_by_email,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
# CORS Middleware para permitir peticiones desde el frontend
from fastapi.middleware.cors import CORSMiddleware
# Mercado Pago SDK y configuración
import mercadopago
from fastapi import Request
import config
from email_service import send_password_reset_email


# Crear todas las tablas en la base de datos si no existen
# Lee los modelos (Category, Expense) y ejecuta CREATE TABLE automáticamente
Base.metadata.create_all(bind=engine)

# ⚠️ NOTA: Las migraciones de esquema ahora se manejan con Alembic (ver carpeta alembic/).
# Las migraciones manuales de columnas se han eliminado.
# Para agregar una columna nueva:
#   1. Actualizar el modelo en models.py
#   2. Ejecutar: alembic revision --autogenerate -m "Add new column"
#   3. Revisar la migración generada
#   4. Ejecutar: alembic upgrade head

# Crear la aplicación FastAPI
app = FastAPI(title="Expense Tracker API")

# CONFIGURACIÓN CORS: Permite peticiones desde el frontend
# Sin esto, el navegador bloquea las llamadas HTTP por seguridad
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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


# SOLICITAR restablecimiento de contraseña - POST /auth/forgot-password
@app.post("/auth/forgot-password")
async def forgot_password(
    payload: schemas.PasswordResetRequest,
    db: Session = Depends(get_db),
):
    """
    Solicita restablecimiento de contraseña.
    
    Seguridad:
    - Responde con el mismo mensaje independientemente de si el email existe
    - El token se envía por email, NO en la respuesta API
    - El token tiene expiración de 1 hora
    """
    # Buscar usuario por email (pero siempre respondemos 200 por seguridad)
    user = get_user_by_email(db, payload.email)

    # Mensaje genérico para no filtrar si el email existe o no
    message = "Si el email existe, se ha enviado un enlace para restablecer la contraseña"

    if not user:
        return {"message": message}

    # Generar token único y fecha de expiración (1 hora)
    token_str = uuid4().hex
    expires_at = datetime.utcnow() + timedelta(hours=1)

    reset_token = models.PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    # ✅ SEGURO: Enviar por email en background, NO en respuesta API
    try:
        await send_password_reset_email(
            email=user.email,
            username=user.username,
            reset_token=token_str,
            expires_in_hours=1,
        )
    except Exception as e:
        # Log pero no fallar la solicitud
        print(f"⚠️ Error enviando email a {user.email}: {str(e)}")

    # NO devolver el token en la respuesta
    return {"message": message}


# RESTABLECER contraseña usando token - POST /auth/reset-password
@app.post("/auth/reset-password")
def reset_password(
    payload: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    token = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == payload.token)
        .first()
    )

    if not token or token.used or token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de restablecimiento no es válido o ha expirado",
        )

    user = db.query(models.User).filter(models.User.id == token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El token de restablecimiento no es válido o ha expirado",
        )

    # Actualizar contraseña
    user.hashed_password = get_password_hash(payload.new_password)
    token.used = True

    db.commit()

    return {"message": "Contraseña restablecida correctamente"}


# CAMBIAR contraseña (usuario autenticado) - POST /auth/change-password
@app.post("/auth/change-password")
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Verificar contraseña actual
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )

    # Actualizar contraseña
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    db.refresh(current_user)

    return {"message": "Contraseña actualizada correctamente"}


# ACTUALIZAR datos de pago - PUT /auth/payment-info
@app.put("/auth/payment-info", response_model=schemas.UserRead)
def update_payment_info(
    payload: schemas.PaymentInfoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    current_user.alias_bancario = payload.alias_bancario
    current_user.cvu = payload.cvu
    db.commit()
    db.refresh(current_user)
    return current_user


# ============== ENDPOINTS DE CATEGORÍAS DEL SISTEMA ==============

# LISTAR categorías del sistema (predeterminadas) - GET /categories/
# Estas son de solo lectura
@app.get("/categories/", response_model=List[schemas.CategoryRead])
def list_system_categories(db: Session = Depends(get_db)):
    """
    Devuelve todas las categorías del sistema (predeterminadas).
    No requiere autenticación - son públicas.
    """
    return db.query(models.Category).filter(
        models.Category.es_predeterminada == True
    ).all()


# ============== ENDPOINTS DE CATEGORÍAS PERSONALIZADAS DEL USUARIO ==============

# CREAR categoría personalizada - POST /user-categories/
@app.post("/user-categories/", response_model=schemas.UserCategoryRead)
def create_user_category(
    category: schemas.UserCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Crea una categoría personalizada para el usuario actual.
    
    Seguridad:
    - Requiere autenticación
    - La categoría se vincula al usuario actual
    - Nombres únicos por usuario (múltiples usuarios pueden tener 'Comida')
    """
    # Validar que no existe una categoría con el mismo nombre para este usuario
    existing = db.query(models.UserCategory).filter(
        models.UserCategory.user_id == current_user.id,
        models.UserCategory.nombre == category.nombre,
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Ya tienes una categoría con este nombre"
        )
    
    # Crear nueva categoría personalizada
    db_category = models.UserCategory(
        user_id=current_user.id,
        nombre=category.nombre,
        descripcion=category.descripcion,
        color=category.color,
        icon=category.icon,
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


# LISTAR categorías personalizadas - GET /user-categories/
@app.get("/user-categories/", response_model=List[schemas.UserCategoryRead])
def list_user_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Devuelve todas las categorías personalizadas del usuario actual.
    Requiere autenticación.
    """
    return db.query(models.UserCategory).filter(
        models.UserCategory.user_id == current_user.id
    ).order_by(models.UserCategory.created_at.desc()).all()


# OBTENER una categoría personalizada - GET /user-categories/{category_id}
@app.get("/user-categories/{category_id}", response_model=schemas.UserCategoryRead)
def get_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Obtiene una categoría personalizada específica del usuario.
    """
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,  # ✅ Validar propiedad
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    return category


# ACTUALIZAR categoría personalizada - PUT /user-categories/{category_id}
@app.put("/user-categories/{category_id}", response_model=schemas.UserCategoryRead)
def update_user_category(
    category_id: int,
    category_update: schemas.UserCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Actualiza una categoría personalizada del usuario.
    """
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,  # ✅ Validar propiedad
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Si se intenta cambiar el nombre, validar unicidad
    if category_update.nombre and category_update.nombre != category.nombre:
        existing = db.query(models.UserCategory).filter(
            models.UserCategory.user_id == current_user.id,
            models.UserCategory.nombre == category_update.nombre,
            models.UserCategory.id != category_id,
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Ya tienes una categoría con este nombre"
            )
        category.nombre = category_update.nombre
    
    # Actualizar otros campos si se proporcionan
    if category_update.descripcion is not None:
        category.descripcion = category_update.descripcion
    if category_update.color is not None:
        category.color = category_update.color
    if category_update.icon is not None:
        category.icon = category_update.icon
    
    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)
    return category


# ELIMINAR categoría personalizada - DELETE /user-categories/{category_id}
@app.delete("/user-categories/{category_id}", status_code=204)
def delete_user_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """
    Elimina una categoría personalizada del usuario.
    No permite eliminar si hay gastos asociados.
    """
    category = db.query(models.UserCategory).filter(
        models.UserCategory.id == category_id,
        models.UserCategory.user_id == current_user.id,  # ✅ Validar propiedad
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Validar que no haya gastos usando esta categoría
    gastos_count = db.query(models.Expense).filter(
        models.Expense.user_category_id == category_id
    ).count()
    
    if gastos_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar. Hay {gastos_count} gasto(s) usando esta categoría. "
                   "Asigna esos gastos a otra categoría primero."
        )
    
    db.delete(category)
    db.commit()
    
    return None

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


# ============== ENDPOINTS DE CONTACTOS (PROTEGIDOS) ==============

# CREAR contacto - POST /contacts/
@app.post("/contacts/", response_model=schemas.ContactRead)
def create_contact(
    contact: schemas.ContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = models.Contact(
        owner_id=current_user.id,
        nombre=contact.nombre,
        alias_bancario=contact.alias_bancario,
        cvu=contact.cvu,
        linked_user_id=contact.linked_user_id,
    )
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


# LISTAR contactos del usuario - GET /contacts/
@app.get("/contacts/", response_model=List[schemas.ContactRead])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    contacts = db.query(models.Contact).filter(
        models.Contact.owner_id == current_user.id
    ).order_by(models.Contact.nombre).all()
    return contacts


# ACTUALIZAR contacto - PUT /contacts/{contact_id}
@app.put("/contacts/{contact_id}", response_model=schemas.ContactRead)
def update_contact(
    contact_id: int,
    contact_update: schemas.ContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    db_contact.nombre = contact_update.nombre
    db_contact.alias_bancario = contact_update.alias_bancario
    db_contact.cvu = contact_update.cvu
    db_contact.linked_user_id = contact_update.linked_user_id

    db.commit()
    db.refresh(db_contact)
    return db_contact


# ELIMINAR contacto - DELETE /contacts/{contact_id}
@app.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    # Verificar si el contacto está en algún grupo activo
    member_count = db.query(models.SplitGroupMember).join(models.SplitGroup).filter(
        models.SplitGroupMember.contact_id == contact_id,
        models.SplitGroup.is_active == True,
    ).count()

    if member_count > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar. El contacto es miembro de un grupo activo",
        )

    db.delete(db_contact)
    db.commit()
    return {"message": "Contacto eliminado correctamente"}


# ============== ENDPOINTS DE GRUPOS DIVIDIDOS (PROTEGIDOS) ==============

# CREAR grupo - POST /split-groups/
@app.post("/split-groups/", response_model=schemas.SplitGroupRead)
def create_split_group(
    group: schemas.SplitGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Validar que todos los contact_ids pertenecen al usuario
    if group.member_contact_ids:
        contacts = db.query(models.Contact).filter(
            models.Contact.id.in_(group.member_contact_ids),
            models.Contact.owner_id == current_user.id,
        ).all()
        if len(contacts) != len(group.member_contact_ids):
            raise HTTPException(status_code=400, detail="Uno o más contactos no son válidos")
    else:
        contacts = []

    # Crear el grupo
    db_group = models.SplitGroup(
        nombre=group.nombre,
        descripcion=group.descripcion,
        creator_id=current_user.id,
    )
    db.add(db_group)
    db.flush()

    # Agregar al creador como miembro
    creator_member = models.SplitGroupMember(
        group_id=db_group.id,
        contact_id=None,
        is_creator=True,
        display_name=current_user.username,
    )
    db.add(creator_member)

    # Agregar contactos como miembros
    for contact in contacts:
        member = models.SplitGroupMember(
            group_id=db_group.id,
            contact_id=contact.id,
            is_creator=False,
            display_name=contact.nombre,
        )
        db.add(member)

    db.commit()

    # Recargar con relaciones
    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroup.id == db_group.id).first()

    return db_group


# LISTAR grupos del usuario - GET /split-groups/
@app.get("/split-groups/", response_model=List[schemas.SplitGroupRead])
def list_split_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    groups = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.creator_id == current_user.id,
    ).order_by(models.SplitGroup.is_active.desc(), models.SplitGroup.created_at.desc()).all()

    # Deduplicar resultados que joinedload puede producir
    seen = set()
    unique_groups = []
    for g in groups:
        if g.id not in seen:
            seen.add(g.id)
            unique_groups.append(g)

    return unique_groups


# OBTENER detalle de grupo - GET /split-groups/{group_id}
@app.get("/split-groups/{group_id}", response_model=schemas.SplitGroupRead)
def get_split_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    return group


# ACTUALIZAR grupo - PUT /split-groups/{group_id}
@app.put("/split-groups/{group_id}", response_model=schemas.SplitGroupRead)
def update_split_group(
    group_id: int,
    group_update: schemas.SplitGroupBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.nombre = group_update.nombre
    db_group.descripcion = group_update.descripcion
    db.commit()

    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroup.id == group_id).first()

    return db_group


# ELIMINAR grupo (soft-delete) - DELETE /split-groups/{group_id}
@app.delete("/split-groups/{group_id}")
def delete_split_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.is_active = False
    db.commit()
    return {"message": "Grupo eliminado correctamente"}


# CERRAR/REABRIR grupo - PUT /split-groups/{group_id}/toggle-active
@app.put("/split-groups/{group_id}/toggle-active", response_model=schemas.SplitGroupRead)
def toggle_group_active(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.members).joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_group.is_active = not db_group.is_active
    db.commit()
    db.refresh(db_group)
    return db_group


# AGREGAR miembro a grupo - POST /split-groups/{group_id}/members
@app.post("/split-groups/{group_id}/members", response_model=schemas.SplitGroupMemberRead)
def add_group_member(
    group_id: int,
    payload: schemas.AddMemberRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    # Validar que el contacto pertenece al usuario
    contact = db.query(models.Contact).filter(
        models.Contact.id == payload.contact_id,
        models.Contact.owner_id == current_user.id,
    ).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    # Verificar que el contacto no sea ya miembro
    existing = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.group_id == group_id,
        models.SplitGroupMember.contact_id == payload.contact_id,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="El contacto ya es miembro del grupo")

    member = models.SplitGroupMember(
        group_id=group_id,
        contact_id=contact.id,
        is_creator=False,
        display_name=contact.nombre,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


# QUITAR miembro de grupo - DELETE /split-groups/{group_id}/members/{member_id}
@app.delete("/split-groups/{group_id}/members/{member_id}")
def remove_group_member(
    group_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if member.is_creator:
        raise HTTPException(status_code=400, detail="No se puede eliminar al creador del grupo")

    # Verificar si participó en gastos
    participation_count = db.query(models.SplitExpenseParticipant).filter(
        models.SplitExpenseParticipant.member_id == member_id,
    ).count()

    if participation_count > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar. El miembro participó en gastos del grupo",
        )

    db.delete(member)
    db.commit()
    return {"message": "Miembro eliminado del grupo"}


# AGREGAR miembro rapido (crea contacto + miembro) - POST /split-groups/{group_id}/members/quick
@app.post("/split-groups/{group_id}/members/quick", response_model=schemas.SplitGroupMemberRead)
def quick_add_group_member(
    group_id: int,
    payload: schemas.QuickAddMemberRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    # Crear contacto automaticamente
    db_contact = models.Contact(
        owner_id=current_user.id,
        nombre=payload.nombre,
        alias_bancario=payload.alias_bancario,
        cvu=payload.cvu,
    )
    db.add(db_contact)
    db.flush()

    # Verificar que no exista ya un miembro con ese contacto
    existing = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.group_id == group_id,
        models.SplitGroupMember.contact_id == db_contact.id,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="El contacto ya es miembro del grupo")

    member = models.SplitGroupMember(
        group_id=group_id,
        contact_id=db_contact.id,
        is_creator=False,
        display_name=payload.nombre,
    )
    db.add(member)
    db.commit()

    # Recargar con relacion de contacto
    member = db.query(models.SplitGroupMember).options(
        joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitGroupMember.id == member.id).first()

    return member


# ============== ENDPOINTS DE GASTOS DIVIDIDOS (PROTEGIDOS) ==============

# CREAR gasto dividido - POST /split-groups/{group_id}/expenses
@app.post("/split-groups/{group_id}/expenses", response_model=schemas.SplitExpenseRead)
def create_split_expense(
    group_id: int,
    expense: schemas.SplitExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    # Validar que paid_by es miembro del grupo
    payer = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == expense.paid_by_member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not payer:
        raise HTTPException(status_code=400, detail="El pagador no es miembro del grupo")

    # Validar que todos los participantes son miembros del grupo
    if not expense.participant_member_ids:
        raise HTTPException(status_code=400, detail="Debe haber al menos un participante")

    participants = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id.in_(expense.participant_member_ids),
        models.SplitGroupMember.group_id == group_id,
    ).all()

    if len(participants) != len(expense.participant_member_ids):
        raise HTTPException(status_code=400, detail="Uno o más participantes no son válidos")

    # Calcular monto por persona (division igual, sin centavos perdidos)
    n = len(participants)
    share_base = math.floor(expense.importe * 100 / n) / 100
    remainder = round(expense.importe - share_base * n, 2)

    # Crear el gasto
    db_expense = models.SplitExpense(
        group_id=group_id,
        descripcion=expense.descripcion,
        importe=expense.importe,
        paid_by_member_id=expense.paid_by_member_id,
        fecha=expense.fecha or datetime.now(),
    )
    db.add(db_expense)
    db.flush()

    # Crear participaciones (el primer participante absorbe el resto del redondeo)
    for i, participant in enumerate(participants):
        amount = share_base + (remainder if i == 0 else 0)
        db_participant = models.SplitExpenseParticipant(
            expense_id=db_expense.id,
            member_id=participant.id,
            share_amount=amount,
        )
        db.add(db_participant)

    db.commit()

    # Recargar con relaciones
    db_expense = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitExpense.id == db_expense.id).first()

    return db_expense


# LISTAR gastos del grupo - GET /split-groups/{group_id}/expenses
@app.get("/split-groups/{group_id}/expenses", response_model=List[schemas.SplitExpenseRead])
def list_split_expenses(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    expenses = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member),
    ).filter(
        models.SplitExpense.group_id == group_id,
    ).order_by(models.SplitExpense.fecha.desc()).all()

    # Deduplicar
    seen = set()
    unique = []
    for e in expenses:
        if e.id not in seen:
            seen.add(e.id)
            unique.append(e)

    return unique


# ACTUALIZAR gasto dividido - PUT /split-groups/{group_id}/expenses/{expense_id}
@app.put("/split-groups/{group_id}/expenses/{expense_id}", response_model=schemas.SplitExpenseRead)
def update_split_expense(
    group_id: int,
    expense_id: int,
    expense_update: schemas.SplitExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_expense = db.query(models.SplitExpense).filter(
        models.SplitExpense.id == expense_id,
        models.SplitExpense.group_id == group_id,
    ).first()

    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    # Validar pagador
    payer = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == expense_update.paid_by_member_id,
        models.SplitGroupMember.group_id == group_id,
    ).first()

    if not payer:
        raise HTTPException(status_code=400, detail="El pagador no es miembro del grupo")

    # Validar participantes
    if not expense_update.participant_member_ids:
        raise HTTPException(status_code=400, detail="Debe haber al menos un participante")

    participants = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id.in_(expense_update.participant_member_ids),
        models.SplitGroupMember.group_id == group_id,
    ).all()

    if len(participants) != len(expense_update.participant_member_ids):
        raise HTTPException(status_code=400, detail="Uno o más participantes no son válidos")

    n = len(participants)
    share_base = math.floor(expense_update.importe * 100 / n) / 100
    remainder = round(expense_update.importe - share_base * n, 2)

    # Actualizar campos
    db_expense.descripcion = expense_update.descripcion
    db_expense.importe = expense_update.importe
    db_expense.paid_by_member_id = expense_update.paid_by_member_id
    db_expense.fecha = expense_update.fecha or db_expense.fecha

    # Reemplazar participaciones
    db.query(models.SplitExpenseParticipant).filter(
        models.SplitExpenseParticipant.expense_id == expense_id,
    ).delete()

    for i, participant in enumerate(participants):
        amount = share_base + (remainder if i == 0 else 0)
        db_participant = models.SplitExpenseParticipant(
            expense_id=expense_id,
            member_id=participant.id,
            share_amount=amount,
        )
        db.add(db_participant)

    db.commit()

    db_expense = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.paid_by).joinedload(models.SplitGroupMember.contact),
        joinedload(models.SplitExpense.participants).joinedload(models.SplitExpenseParticipant.member).joinedload(models.SplitGroupMember.contact),
    ).filter(models.SplitExpense.id == expense_id).first()

    return db_expense


# ELIMINAR gasto dividido - DELETE /split-groups/{group_id}/expenses/{expense_id}
@app.delete("/split-groups/{group_id}/expenses/{expense_id}")
def delete_split_expense(
    group_id: int,
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
        models.SplitGroup.is_active == True,
    ).first()

    if not db_group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    db_expense = db.query(models.SplitExpense).filter(
        models.SplitExpense.id == expense_id,
        models.SplitExpense.group_id == group_id,
    ).first()

    if not db_expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(db_expense)
    db.commit()
    return {"message": "Gasto eliminado correctamente"}


# ============== ENDPOINT DE BALANCES ==============

# OBTENER balances del grupo - GET /split-groups/{group_id}/balances
@app.get("/split-groups/{group_id}/balances", response_model=schemas.GroupBalanceSummary)
def get_group_balances(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    group = db.query(models.SplitGroup).options(
        joinedload(models.SplitGroup.creator),
    ).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()

    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    members = db.query(models.SplitGroupMember).options(
        joinedload(models.SplitGroupMember.contact),
    ).filter(
        models.SplitGroupMember.group_id == group_id,
    ).all()

    expenses = db.query(models.SplitExpense).options(
        joinedload(models.SplitExpense.participants),
    ).filter(
        models.SplitExpense.group_id == group_id,
    ).all()

    # Deduplicar expenses (joinedload puede producir duplicados)
    seen_expenses = set()
    unique_expenses = []
    for e in expenses:
        if e.id not in seen_expenses:
            seen_expenses.add(e.id)
            unique_expenses.append(e)
    expenses = unique_expenses

    # Calcular balances individuales
    total_paid = {m.id: 0.0 for m in members}
    total_share = {m.id: 0.0 for m in members}

    for expense in expenses:
        total_paid[expense.paid_by_member_id] += expense.importe
        for p in expense.participants:
            total_share[p.member_id] += p.share_amount

    balances = []
    member_map = {m.id: m for m in members}

    for member in members:
        net = total_paid[member.id] - total_share[member.id]
        balances.append(schemas.MemberBalance(
            member_id=member.id,
            display_name=member.display_name,
            total_paid=round(total_paid[member.id], 2),
            total_share=round(total_share[member.id], 2),
            net_balance=round(net, 2),
            contact=member.contact,
        ))

    # Simplificar deudas (algoritmo greedy)
    creditors = []
    debtors = []

    for b in balances:
        if b.net_balance > 0.01:
            creditors.append([b.member_id, b.net_balance])
        elif b.net_balance < -0.01:
            debtors.append([b.member_id, -b.net_balance])

    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    transfers = []
    i, j = 0, 0

    while i < len(creditors) and j < len(debtors):
        creditor_id, credit_amount = creditors[i]
        debtor_id, debt_amount = debtors[j]
        settle_amount = min(credit_amount, debt_amount)

        creditor_member = member_map[creditor_id]
        debtor_member = member_map[debtor_id]

        # Para contactos, usar datos del contacto. Para el creador, usar datos del User.
        if creditor_member.contact:
            to_alias = creditor_member.contact.alias_bancario
            to_cvu = creditor_member.contact.cvu
        elif creditor_member.is_creator:
            to_alias = group.creator.alias_bancario
            to_cvu = group.creator.cvu
        else:
            to_alias = None
            to_cvu = None

        transfers.append(schemas.DebtTransfer(
            from_member_id=debtor_id,
            from_display_name=debtor_member.display_name,
            to_member_id=creditor_id,
            to_display_name=creditor_member.display_name,
            amount=round(settle_amount, 2),
            to_alias_bancario=to_alias,
            to_cvu=to_cvu,
        ))

        creditors[i][1] -= settle_amount
        debtors[j][1] -= settle_amount

        if creditors[i][1] < 0.01:
            i += 1
        if debtors[j][1] < 0.01:
            j += 1

    # Enriquecer transfers con info de pagos existentes
    payments = db.query(models.Payment).filter(
        models.Payment.group_id == group_id,
        models.Payment.status.in_(["pending", "approved"]),
    ).all()

    for transfer in transfers:
        # Buscar pago que coincida con esta deuda (from->to, mismo monto)
        for payment in payments:
            if (payment.from_member_id == transfer.from_member_id
                and payment.to_member_id == transfer.to_member_id):
                if payment.status == "approved":
                    transfer.paid_amount = payment.amount
                    transfer.payment_status = "approved"
                    transfer.payment_id = payment.id
                    break
                elif payment.status == "pending" and not transfer.payment_status:
                    transfer.payment_status = "pending"
                    transfer.payment_id = payment.id

    total_expenses_amount = sum(e.importe for e in expenses)

    return schemas.GroupBalanceSummary(
        group_id=group_id,
        group_name=group.nombre,
        total_expenses=round(total_expenses_amount, 2),
        balances=balances,
        simplified_debts=transfers,
    )


# ============== ENDPOINTS DE PAGOS (MERCADO PAGO) ==============

# Inicializar SDK de Mercado Pago
def get_mp_sdk():
    if not config.MP_ACCESS_TOKEN:
        raise HTTPException(status_code=500, detail="Mercado Pago no está configurado. Falta MP_ACCESS_TOKEN.")
    return mercadopago.SDK(config.MP_ACCESS_TOKEN)


# CREAR preferencia de pago - POST /payments/create-preference
@app.post("/payments/create-preference", response_model=schemas.PaymentPreferenceResponse)
def create_payment_preference(
    payment_data: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Validar que el grupo existe y pertenece al usuario
    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == payment_data.group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    # Validar que los miembros existen en el grupo
    from_member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == payment_data.from_member_id,
        models.SplitGroupMember.group_id == payment_data.group_id,
    ).first()
    to_member = db.query(models.SplitGroupMember).filter(
        models.SplitGroupMember.id == payment_data.to_member_id,
        models.SplitGroupMember.group_id == payment_data.group_id,
    ).first()

    if not from_member or not to_member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado en el grupo")

    # Crear registro de pago en la BD
    db_payment = models.Payment(
        group_id=payment_data.group_id,
        from_member_id=payment_data.from_member_id,
        to_member_id=payment_data.to_member_id,
        amount=payment_data.amount,
        status="pending",
    )
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)

    # Crear preferencia en Mercado Pago
    sdk = get_mp_sdk()
    preference_data = {
        "items": [
            {
                "title": f"Pago de deuda - {group.nombre}",
                "description": f"{from_member.display_name} paga a {to_member.display_name}",
                "quantity": 1,
                "unit_price": payment_data.amount,
                "currency_id": "ARS",
            }
        ],
        "notification_url": f"{config.BACKEND_URL}/payments/webhook",
        "external_reference": f"payment_{db_payment.id}",
    }

    print(f"[MP] Creando preferencia para payment_id={db_payment.id}, monto={payment_data.amount}")
    try:
        preference_response = sdk.preference().create(preference_data)
        print(f"[MP] Respuesta status={preference_response['status']}")
    except Exception as e:
        print(f"[MP] ERROR al llamar a MP: {e}")
        db.delete(db_payment)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error de conexión con Mercado Pago: {str(e)}")

    if preference_response["status"] != 201:
        print(f"[MP] Error response: {preference_response}")
        db.delete(db_payment)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Error de Mercado Pago (status {preference_response['status']}): {preference_response.get('response', {})}"
        )

    preference = preference_response["response"]
    db_payment.mp_preference_id = preference["id"]
    db.commit()
    print(f"[MP] Preferencia creada OK: {preference['id']}")

    return schemas.PaymentPreferenceResponse(
        payment_id=db_payment.id,
        init_point=preference["init_point"],
    )


# WEBHOOK de Mercado Pago - POST /payments/webhook
# Este endpoint NO requiere autenticación JWT (es llamado por MP)
def _is_valid_mp_signature(request: Request, data_id: str) -> bool:
    # En producción exigimos firma; en desarrollo se permite omitirla para pruebas locales.
    if not config.MP_WEBHOOK_SECRET:
        return not config.IS_PRODUCTION

    x_signature = request.headers.get("x-signature", "")
    x_request_id = request.headers.get("x-request-id", "")
    if not x_signature or not x_request_id:
        return False

    signature_parts = {}
    for part in x_signature.split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            signature_parts[key.strip()] = value.strip()

    ts = signature_parts.get("ts")
    v1 = signature_parts.get("v1")
    if not ts or not v1:
        return False

    manifest = f"id:{data_id};request-id:{x_request_id};ts:{ts};"
    expected = hmac.new(
        config.MP_WEBHOOK_SECRET.encode("utf-8"),
        msg=manifest.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, v1)


@app.post("/payments/webhook")
async def mercadopago_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return {"status": "ok"}

    # MP envía notificaciones de tipo "payment"
    if body.get("type") != "payment":
        return {"status": "ok"}

    mp_payment_id = body.get("data", {}).get("id")
    if not mp_payment_id:
        return {"status": "ok"}

    if not _is_valid_mp_signature(request, str(mp_payment_id)):
        raise HTTPException(status_code=401, detail="Firma de webhook inválida")

    # Consultar el pago en Mercado Pago
    sdk = get_mp_sdk()
    payment_response = sdk.payment().get(mp_payment_id)

    if payment_response["status"] != 200:
        return {"status": "error", "message": "No se pudo consultar el pago"}

    mp_payment = payment_response["response"]
    external_reference = mp_payment.get("external_reference", "")
    mp_status = mp_payment.get("status", "")

    # Extraer payment_id del external_reference (formato: "payment_123")
    if not external_reference.startswith("payment_"):
        return {"status": "ok"}

    try:
        local_payment_id = int(external_reference.split("_")[1])
    except (IndexError, ValueError):
        return {"status": "ok"}

    # Actualizar el pago local
    db_payment = db.query(models.Payment).filter(
        models.Payment.id == local_payment_id,
    ).first()

    if not db_payment:
        return {"status": "ok"}

    db_payment.mp_payment_id = str(mp_payment_id)
    db_payment.status = mp_status
    db_payment.updated_at = datetime.now()
    db.commit()

    return {"status": "ok"}


# OBTENER pagos de un grupo - GET /payments/group/{group_id}
@app.get("/payments/group/{group_id}", response_model=List[schemas.PaymentRead])
def get_group_payments(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    # Validar que el grupo pertenece al usuario
    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    payments = db.query(models.Payment).filter(
        models.Payment.group_id == group_id,
    ).order_by(models.Payment.created_at.desc()).all()

    return payments


# CONSULTAR estado de un pago - GET /payments/{payment_id}/status
@app.get("/payments/{payment_id}/status", response_model=schemas.PaymentRead)
def get_payment_status(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    db_payment = db.query(models.Payment).filter(
        models.Payment.id == payment_id,
    ).first()

    if not db_payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    # Validar que el grupo pertenece al usuario
    group = db.query(models.SplitGroup).filter(
        models.SplitGroup.id == db_payment.group_id,
        models.SplitGroup.creator_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    # Si está pending, re-consultar a MP
    if db_payment.status == "pending" and db_payment.mp_preference_id:
        try:
            sdk = get_mp_sdk()
            # Buscar pagos por external_reference
            search_result = sdk.payment().search({
                "external_reference": f"payment_{payment_id}"
            })
            if search_result["status"] == 200:
                results = search_result["response"].get("results", [])
                if results:
                    latest = results[0]
                    db_payment.mp_payment_id = str(latest["id"])
                    db_payment.status = latest["status"]
                    db_payment.updated_at = datetime.now()
                    db.commit()
        except Exception:
            pass  # Si falla la consulta a MP, devolver el estado local

    return db_payment


# Endpoint raíz para verificar que la API funciona
@app.get("/")
def root():
    return {"message": "API de Gastos funcionando correctamente"}
