"""
Servicio de envío de emails para autenticación y notificaciones.
Soporta SMTP real (producción) y modo desarrollo (consola).
"""

import os
from typing import Optional
from datetime import datetime
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import jinja2

# Configuración
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@gastos.local")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Template engine
template_loader = jinja2.FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates"))
template_env = jinja2.Environment(loader=template_loader, autoescape=True)


async def send_password_reset_email(
    email: str,
    username: str,
    reset_token: str,
    expires_in_hours: int = 1,
) -> bool:
    """
    Envía email de restablecimiento de contraseña.
    
    Args:
        email: Email del usuario
        username: Nombre de usuario
        reset_token: Token único para resetear contraseña
        expires_in_hours: Horas de validez del token
    
    Returns:
        True si se envió correctamente, False si falló
    """
    
    # URL del enlace de reset
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
    # Datos para el template
    context = {
        "username": username,
        "reset_url": reset_url,
        "expires_in_hours": expires_in_hours,
        "current_year": datetime.now().year,
    }
    
    try:
        # Renderizar template HTML
        template = template_env.get_template("password_reset.html")
        html_content = template.render(**context)
        
        # Template de texto plano (fallback)
        text_content = f"""
Hola {username},

Recibiste esta solicitud para restablecer tu contraseña. 
Haz clic en el enlace abajo para crear una nueva contraseña.

{reset_url}

Este enlace expirará en {expires_in_hours} hora(s).

Si no solicitaste un reset de contraseña, ignora este email.

---
Expense Tracker
        """
        
        if ENVIRONMENT == "development":
            # Modo desarrollo: imprimir en consola
            print("\n" + "=" * 60)
            print(f"📧 [DEV] Email de reset de contraseña para: {email}")
            print("=" * 60)
            print(f"Usuario: {username}")
            print(f"Token: {reset_token}")
            print(f"URL: {reset_url}")
            print(f"Expira en: {expires_in_hours} hora(s)")
            print("=" * 60 + "\n")
            return True
        
        # Modo producción: SMTP real
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            print(
                "❌ Configuración SMTP incompleta. Define: "
                "SMTP_HOST, SMTP_USER, SMTP_PASSWORD"
            )
            return False
        
        # Crear mensaje
        message = MIMEMultipart("alternative")
        message["Subject"] = "Restablece tu contraseña - Expense Tracker"
        message["From"] = SENDER_EMAIL
        message["To"] = email
        
        # Adjuntar versiones
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        message.attach(part1)
        message.attach(part2)
        
        # Enviar
        async with aiosmtplib.SMTP(hostname=SMTP_HOST, port=SMTP_PORT) as smtp:
            await smtp.login(SMTP_USER, SMTP_PASSWORD)
            await smtp.send_message(message)
        
        print(f"✅ Email de reset enviado a {email}")
        return True
        
    except Exception as e:
        print(f"❌ Error enviando email a {email}: {str(e)}")
        return False


async def send_two_factor_code(
    email: str,
    username: str,
    code: str,
    expires_in_minutes: int = 10,
) -> bool:
    """
    Envía código de autenticación de dos factores.
    Útil para implementación futura.
    
    Args:
        email: Email del usuario
        username: Nombre de usuario
        code: Código de 6 dígitos
        expires_in_minutes: Minutos de validez del código
    
    Returns:
        True si se envió correctamente
    """
    
    context = {
        "username": username,
        "code": code,
        "expires_in_minutes": expires_in_minutes,
        "current_year": datetime.now().year,
    }
    
    try:
        template = template_env.get_template("two_factor_code.html")
        html_content = template.render(**context)
        
        text_content = f"""
Hola {username},

Tu código de verificación es: {code}

Este código expirará en {expires_in_minutes} minutos.

Si no solicitaste este código, ignora este email.

---
Expense Tracker
        """
        
        if ENVIRONMENT == "development":
            print("\n" + "=" * 60)
            print(f"📧 [DEV] Código 2FA para: {email}")
            print("=" * 60)
            print(f"Usuario: {username}")
            print(f"Código: {code}")
            print(f"Expira en: {expires_in_minutes} minutos")
            print("=" * 60 + "\n")
            return True
        
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            return False
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Tu código de verificación - Expense Tracker"
        message["From"] = SENDER_EMAIL
        message["To"] = email
        
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        message.attach(part1)
        message.attach(part2)
        
        async with aiosmtplib.SMTP(hostname=SMTP_HOST, port=SMTP_PORT) as smtp:
            await smtp.login(SMTP_USER, SMTP_PASSWORD)
            await smtp.send_message(message)
        
        print(f"✅ Código 2FA enviado a {email}")
        return True
        
    except Exception as e:
        print(f"❌ Error enviando código 2FA a {email}: {str(e)}")
        return False


async def send_welcome_email(
    email: str,
    username: str,
) -> bool:
    """
    Envía email de bienvenida cuando se registra un usuario.
    
    Args:
        email: Email del nuevo usuario
        username: Nombre de usuario
    
    Returns:
        True si se envió correctamente
    """
    
    app_url = FRONTEND_URL
    
    context = {
        "username": username,
        "app_url": app_url,
        "current_year": datetime.now().year,
    }
    
    try:
        template = template_env.get_template("welcome.html")
        html_content = template.render(**context)
        
        text_content = f"""
¡Bienvenido {username}!

Tu cuenta en Expense Tracker ha sido creada exitosamente.

Accede a la aplicación aquí: {app_url}

---
Expense Tracker
        """
        
        if ENVIRONMENT == "development":
            print("\n" + "=" * 60)
            print(f"📧 [DEV] Email de bienvenida para: {email}")
            print("=" * 60)
            print(f"Usuario: {username}")
            print(f"URL: {app_url}")
            print("=" * 60 + "\n")
            return True
        
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            return False
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "¡Bienvenido a Expense Tracker!"
        message["From"] = SENDER_EMAIL
        message["To"] = email
        
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        message.attach(part1)
        message.attach(part2)
        
        async with aiosmtplib.SMTP(hostname=SMTP_HOST, port=SMTP_PORT) as smtp:
            await smtp.login(SMTP_USER, SMTP_PASSWORD)
            await smtp.send_message(message)
        
        print(f"✅ Email de bienvenida enviado a {email}")
        return True
        
    except Exception as e:
        print(f"❌ Error enviando email de bienvenida a {email}: {str(e)}")
        return False
