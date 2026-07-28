"""
Servicio de envío de emails para autenticación y notificaciones.
Soporta SMTP real (producción) y modo desarrollo (consola).
"""

import logging
import os
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import quote

import aiosmtplib
import jinja2

logger = logging.getLogger(__name__)

# Configuración
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@finanzaapp.local")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Template engine
template_loader = jinja2.FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates"))
template_env = jinja2.Environment(loader=template_loader, autoescape=True)


async def _send_email(
    to_email: str,
    subject: str,
    template_name: str,
    context: dict,
    text_body: str,
) -> bool:
    """
    Core de envío de emails. En development printea a consola,
    en producción envía por SMTP con STARTTLS.

    Args:
        to_email: Email destino
        subject: Asunto del mensaje
        template_name: Nombre del template HTML (ej: "password_reset.html")
        context: Variables para renderizar el template
        text_body: Versión texto plano (fallback para clientes sin HTML)

    Returns:
        True si se envió correctamente, False si falló
    """
    try:
        template = template_env.get_template(template_name)
        html_content = template.render(**context)

        if ENVIRONMENT == "development":
            logger.info(
                "[DEV] Email a %s | Asunto: %s | Template: %s",
                to_email, subject, template_name,
            )
            return True

        # Modo producción: SMTP real
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            logger.error(
                "Configuración SMTP incompleta. Define SMTP_HOST, SMTP_USER, SMTP_PASSWORD"
            )
            return False

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = SENDER_EMAIL
        message["To"] = to_email

        message.attach(MIMEText(text_body, "plain"))
        message.attach(MIMEText(html_content, "html"))

        async with aiosmtplib.SMTP(
            hostname=SMTP_HOST, port=SMTP_PORT, start_tls=True,
        ) as smtp:
            await smtp.login(SMTP_USER, SMTP_PASSWORD)
            await smtp.send_message(message)

        logger.info("Email enviado a %s: %s", to_email, subject)
        return True

    except Exception as e:
        logger.exception("Error enviando email a %s: %s", to_email, e)
        return False


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
    reset_url = f"{FRONTEND_URL}/reset-password?token={quote(reset_token)}"

    context = {
        "username": username,
        "reset_url": reset_url,
        "expires_in_hours": expires_in_hours,
        "current_year": datetime.now().year,
    }

    text_body = f"""
Hola {username},

Recibiste esta solicitud para restablecer tu contraseña.
Haz clic en el enlace abajo para crear una nueva contraseña.

{reset_url}

Este enlace expirará en {expires_in_hours} hora(s).

Si no solicitaste un reset de contraseña, ignora este email.

---
FinanzaApp
    """.strip()

    return await _send_email(
        to_email=email,
        subject="Restablece tu contraseña - FinanzaApp",
        template_name="password_reset.html",
        context=context,
        text_body=text_body,
    )


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

    text_body = f"""
Hola {username},

Tu código de verificación es: {code}

Este código expirará en {expires_in_minutes} minutos.

Si no solicitaste este código, ignora este email.

---
FinanzaApp
    """.strip()

    return await _send_email(
        to_email=email,
        subject="Tu código de verificación - FinanzaApp",
        template_name="two_factor_code.html",
        context=context,
        text_body=text_body,
    )


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
    context = {
        "username": username,
        "app_url": FRONTEND_URL,
        "current_year": datetime.now().year,
    }

    text_body = f"""
¡Bienvenido {username}!

Tu cuenta en FinanzaApp ha sido creada exitosamente.

Accede a la aplicación aquí: {FRONTEND_URL}

---
FinanzaApp
    """.strip()

    return await _send_email(
        to_email=email,
        subject="¡Bienvenido a FinanzaApp!",
        template_name="welcome.html",
        context=context,
        text_body=text_body,
    )
