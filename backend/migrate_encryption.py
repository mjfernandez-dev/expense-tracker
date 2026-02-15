"""
Script de migración one-time: encripta datos existentes sin encriptar.
Ejecutar una sola vez: python migrate_encryption.py
"""
from sqlalchemy import text
from database import engine
from encryption import get_fernet


def migrate():
    f = get_fernet()

    tables_fields = [
        ("users", ["alias_bancario", "cvu"]),
        ("contacts", ["nombre", "alias_bancario", "cvu"]),
        ("expenses", ["descripcion", "nota"]),
        ("split_expenses", ["descripcion"]),
        ("split_group_members", ["display_name"]),
    ]

    with engine.connect() as conn:
        for table, fields in tables_fields:
            rows = conn.execute(
                text(f"SELECT id, {', '.join(fields)} FROM {table}")
            ).fetchall()

            encrypted_count = 0
            for row in rows:
                row_id = row[0]
                updates = {}
                for i, field in enumerate(fields):
                    value = row[i + 1]
                    if value is not None:
                        # Fernet tokens empiezan con 'gAAAAA' - skip si ya esta encriptado
                        if not value.startswith("gAAAAA"):
                            updates[field] = f.encrypt(value.encode()).decode()

                if updates:
                    set_clause = ", ".join(f"{k} = :val_{k}" for k in updates)
                    params = {f"val_{k}": v for k, v in updates.items()}
                    params["id"] = row_id
                    conn.execute(
                        text(f"UPDATE {table} SET {set_clause} WHERE id = :id"),
                        params,
                    )
                    encrypted_count += 1

            conn.commit()
            print(f"  {table}: {encrypted_count}/{len(rows)} registros encriptados")

    print("\nMigracion completada.")


if __name__ == "__main__":
    migrate()
