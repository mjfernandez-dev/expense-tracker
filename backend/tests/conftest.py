"""
Fixtures compartidos para todos los tests.
Usa SQLite en memoria compartida para aislar los tests de la DB de desarrollo.
"""
import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-32chars!!")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app, limiter

# URI con cache compartido: todas las conexiones ven la misma DB en memoria
TEST_DATABASE_URL = "sqlite:///file:testdb?mode=memory&cache=shared&uri=true"

@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Resetea el rate limiter entre tests para que no interfieran."""
    limiter._storage.reset()
    yield

@pytest.fixture(scope="session")
def engine_fixture():
    _engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False, "uri": True},
    )
    Base.metadata.create_all(bind=_engine)
    yield _engine
    Base.metadata.drop_all(bind=_engine)

@pytest.fixture(scope="function")
def db_session(engine_fixture):
    connection = engine_fixture.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def registered_user(client) -> dict:
    """Crea y devuelve credenciales de un usuario registrado."""
    payload = {"username": "testuser", "email": "test@example.com", "password": "TestPass123!"}
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 200, r.text
    return payload

@pytest.fixture
def logged_in_client(client, registered_user):
    """TestClient ya autenticado (cookie httponly seteada)."""
    r = client.post("/auth/login", data={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200, r.text
    return client

@pytest.fixture
def user_category_id(logged_in_client) -> int:
    """Crea una categoría personalizada y devuelve su ID."""
    r = logged_in_client.post("/user-categories/", json={
        "nombre": "Test Categoria",
        "descripcion": "Para tests",
        "color": "#FF0000",
        "icon": "test",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]
