from cryptography.fernet import Fernet
from sqlalchemy import String, TypeDecorator
import config


def get_fernet():
    key = config.ENCRYPTION_KEY
    if not key:
        raise ValueError("ENCRYPTION_KEY no configurada en .env")
    return Fernet(key.encode() if isinstance(key, str) else key)


class EncryptedString(TypeDecorator):
    """Columna que encripta/desencripta transparentemente con Fernet."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        f = get_fernet()
        return f.encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        f = get_fernet()
        return f.decrypt(value.encode()).decode()
