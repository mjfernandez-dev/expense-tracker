"""
Fixtures compartidos para todos los tests.
Usa SQLite en memoria compartida para aislar los tests de la DB de desarrollo.
"""
import os
from uuid import uuid4
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-32chars!!")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import main
from main import app, limiter


class _APIPrefixClient:
    """Wraps TestClient para auto-anteoner /api a paths que no lo tengan.

    Todas las rutas están registradas bajo /api en main.py, pero los tests
    heredados usan paths sin el prefijo. Este wrapper evita tener que modificar
    cada test file individualmente.
    """

    def __init__(self, client: TestClient):
        self._client = client

    def _api(self, path: str) -> str:
        if path.startswith("/api"):
            return path
        return f"/api{path}" if path.startswith("/") else f"/api/{path}"

    def __getattr__(self, name: str):
        return getattr(self._client, name)

    def request(self, method: str, url: str, **kwargs):
        return self._client.request(method, self._api(url), **kwargs)

    def get(self, url: str, **kwargs):
        return self._client.get(self._api(url), **kwargs)

    def post(self, url: str, **kwargs):
        return self._client.post(self._api(url), **kwargs)

    def put(self, url: str, **kwargs):
        return self._client.put(self._api(url), **kwargs)

    def patch(self, url: str, **kwargs):
        return self._client.patch(self._api(url), **kwargs)

    def delete(self, url: str, **kwargs):
        return self._client.delete(self._api(url), **kwargs)

    def options(self, url: str, **kwargs):
        return self._client.options(self._api(url), **kwargs)

    def head(self, url: str, **kwargs):
        return self._client.head(self._api(url), **kwargs)

# URI con cache compartido: todas las conexiones ven la misma DB en memoria
TEST_DATABASE_URL = f"sqlite:///file:testdb_{uuid4().hex}?mode=memory&cache=shared&uri=true"

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
    Base.metadata.drop_all(bind=_engine)
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
    class _DummyScheduler:
        def start(self):
            return None
        def shutdown(self):
            return None
    main.create_scheduler = lambda: _DummyScheduler()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield _APIPrefixClient(c)
    app.dependency_overrides.clear()

@pytest.fixture
def registered_user(client) -> dict:
    """Crea y devuelve credenciales de un usuario registrado."""
    payload = {"username": "testuser", "email": "test@example.com", "password": "TestPass123!"}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    return payload

@pytest.fixture
def logged_in_client(client, registered_user):
    """TestClient ya autenticado (cookie httponly seteada)."""
    r = client.post("/api/auth/login", json={
        "username": registered_user["username"],
        "password": registered_user["password"],
    })
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def second_logged_in_client(client):
    """TestClient aislado autenticado como un SEGUNDO usuario distinto.

    Usa su propia instancia de TestClient (cookie jar independiente) sobre el
    mismo app/DB de pruebas, para poder probar ownership multi-tenant sin
    pisar la sesión del primer usuario.
    """
    payload = {
        "username": "testuser2",
        "email": "test2@example.com",
        "password": "TestPass123!",
    }
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 200, r.text

    second = _APIPrefixClient(TestClient(app, raise_server_exceptions=False))
    r = second.post("/api/auth/login", json={
        "username": payload["username"],
        "password": payload["password"],
    })
    assert r.status_code == 200, r.text
    return second

@pytest.fixture
def user_category_id(logged_in_client) -> int:
    """Crea una categoría personalizada y devuelve su ID."""
    r = logged_in_client.post("/api/user-categories/", json={
        "nombre": "Test Categoria",
        "descripcion": "Para tests",
        "color": "#FF0000",
        "icon": "test",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]
