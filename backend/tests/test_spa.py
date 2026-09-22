"""
Tests del fallback SPA (SPAStaticFiles).

El frontend usa BrowserRouter: un F5 en una ruta profunda (p. ej. /presupuesto)
llega al servidor como un GET a ese path. El mount estático debe servir
index.html en esos casos y NO devolver 404. Las rutas /api/* inexistentes deben
seguir devolviendo 404 (no caen al SPA).
"""
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from main import SPAStaticFiles


@pytest.fixture
def spa_app(tmp_path):
    (tmp_path / "index.html").write_text("<html><body>FinanzaApp SPA</body></html>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('app')", encoding="utf-8")

    app = FastAPI()
    app.mount("/", SPAStaticFiles(directory=str(tmp_path), html=True), name="frontend")
    return TestClient(app)


def test_ruta_profunda_sirve_index_html(spa_app):
    r = spa_app.get("/presupuesto")
    assert r.status_code == 200
    assert "FinanzaApp SPA" in r.text


def test_raiz_sirve_index_html(spa_app):
    r = spa_app.get("/")
    assert r.status_code == 200
    assert "FinanzaApp SPA" in r.text


def test_asset_existente_se_sirve(spa_app):
    r = spa_app.get("/assets/app.js")
    assert r.status_code == 200
    assert "console.log" in r.text