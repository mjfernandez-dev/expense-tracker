"""
Tests para el módulo Wishlist (Lista de Deseos).

Cubre:
- Unit: _validate_transition matrix
- Integration: CRUD completo, Wish Farm limit, multi-tenant isolation,
  inline category creation+dedup, invalid status transitions
"""

# ============== UNIT TESTS: _validate_transition ==============

import pytest
from fastapi import HTTPException
from services.wishlist_service import _validate_transition


def test_valid_transitions():
    # draft
    _validate_transition('draft', 'en-progreso')  # no exception
    _validate_transition('draft', 'cancelado')
    # en-progreso
    _validate_transition('en-progreso', 'completado')
    _validate_transition('en-progreso', 'cancelado')


def test_invalid_transitions():
    with pytest.raises(HTTPException) as exc:
        _validate_transition('draft', 'completado')
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException):
        _validate_transition('completado', 'en-progreso')

    with pytest.raises(HTTPException):
        _validate_transition('cancelado', 'draft')

    with pytest.raises(HTTPException):
        _validate_transition('completado', 'cancelado')


# ============== HELPERS PARA TESTS DE INTEGRACIÓN ==============

def _wishlist_item(name: str = "Viaje soñado", cost: float = 2500.0, priority: str = "alta") -> dict:
    return {
        "name": name,
        "estimated_cost": cost,
        "priority": priority,
    }


def _registrar_y_logear(client, username: str, email: str) -> None:
    client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": username, "password": "TestPass123!"})


# ============== INTEGRATION TESTS: CREATE ==============

def test_create_wishlist_item(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json=_wishlist_item())
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Viaje soñado"
    assert data["estimated_cost"] == 2500.0
    assert data["priority"] == "alta"
    assert data["status"] == "draft"
    assert "id" in data
    assert "user_id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_wishlist_item_defaults_to_draft(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json=_wishlist_item())
    assert r.status_code == 201
    assert r.json()["status"] == "draft"


def test_create_wishlist_item_negative_cost(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Test", "estimated_cost": -100.0, "priority": "media"
    })
    assert r.status_code == 422


def test_create_wishlist_item_invalid_priority(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Test", "estimated_cost": 100.0, "priority": "urgente"
    })
    assert r.status_code == 422


def test_create_wishlist_item_with_category(logged_in_client, user_category_id):
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Viaje", "estimated_cost": 5000, "priority": "alta",
        "category_id": user_category_id,
    })
    assert r.status_code == 201
    assert r.json()["category_id"] == user_category_id


def test_create_wishlist_item_unauthorized(client):
    r = client.post("/api/wishlist/", json=_wishlist_item())
    assert r.status_code == 401


# ============== INTEGRATION TESTS: LIST / GET ==============

def test_list_wishlist_items(logged_in_client):
    # Crear 3 items
    for i in range(3):
        logged_in_client.post("/api/wishlist/", json=_wishlist_item(name=f"Item {i}"))
    r = logged_in_client.get("/api/wishlist/")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 3
    assert data["total"] == 3


def test_list_wishlist_pagination(logged_in_client):
    for i in range(5):
        logged_in_client.post("/api/wishlist/", json=_wishlist_item(name=f"I{i}"))
    r = logged_in_client.get("/api/wishlist/?limit=2&offset=0")
    data = r.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5


def test_list_wishlist_priority_sorted(logged_in_client):
    """alta first, then media, then baja, with created_at desc within same priority."""
    # Create in reverse priority order
    logged_in_client.post("/api/wishlist/", json=_wishlist_item(name="Baja", priority="baja"))
    logged_in_client.post("/api/wishlist/", json=_wishlist_item(name="Alta", priority="alta"))
    logged_in_client.post("/api/wishlist/", json=_wishlist_item(name="Media", priority="media"))

    r = logged_in_client.get("/api/wishlist/")
    items = r.json()["items"]
    assert len(items) == 3
    assert items[0]["priority"] == "alta"
    assert items[1]["priority"] == "media"
    assert items[2]["priority"] == "baja"


def test_get_single_wishlist_item(logged_in_client):
    create_r = logged_in_client.post("/api/wishlist/", json=_wishlist_item(name="MiItem"))
    item_id = create_r.json()["id"]

    r = logged_in_client.get(f"/api/wishlist/{item_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "MiItem"


def test_get_nonexistent_wishlist_item(logged_in_client):
    r = logged_in_client.get("/api/wishlist/99999")
    assert r.status_code == 404


# ============== INTEGRATION TESTS: UPDATE ==============

def test_update_wishlist_item(logged_in_client):
    create_r = logged_in_client.post("/api/wishlist/", json=_wishlist_item(name="Original", cost=1000))
    item_id = create_r.json()["id"]

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"name": "Actualizado", "estimated_cost": 750})
    assert r.status_code == 200
    assert r.json()["name"] == "Actualizado"
    assert r.json()["estimated_cost"] == 750.0


def test_update_wishlist_item_change_priority(logged_in_client):
    create_r = logged_in_client.post("/api/wishlist/", json=_wishlist_item(priority="baja"))
    item_id = create_r.json()["id"]

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"priority": "alta"})
    assert r.status_code == 200
    assert r.json()["priority"] == "alta"


# ============== INTEGRATION TESTS: DELETE ==============

def test_delete_wishlist_item(logged_in_client):
    create_r = logged_in_client.post("/api/wishlist/", json=_wishlist_item())
    item_id = create_r.json()["id"]

    r = logged_in_client.delete(f"/api/wishlist/{item_id}")
    assert r.status_code == 204

    # Verify it's gone
    r2 = logged_in_client.get(f"/api/wishlist/{item_id}")
    assert r2.status_code == 404


def test_delete_nonexistent_wishlist_item(logged_in_client):
    r = logged_in_client.delete("/api/wishlist/99999")
    assert r.status_code == 404


# ============== INTEGRATION TESTS: WISH FARM LIMIT ==============

def test_wish_farm_max_3_en_progreso(logged_in_client):
    # Crear 3 items en en-progreso
    for i in range(3):
        r = logged_in_client.post("/api/wishlist/", json={
            "name": f"En progreso {i}", "estimated_cost": 100, "priority": "media", "status": "en-progreso",
        })
        assert r.status_code == 201

    # 4to item como en-progreso debe fallar
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Cuarto", "estimated_cost": 100, "priority": "media", "status": "en-progreso",
    })
    assert r.status_code == 400
    assert "3 items" in r.json()["detail"]


def test_wish_farm_complete_frees_slot(logged_in_client):
    # Crear 3 en-progreso
    ids = []
    for i in range(3):
        r = logged_in_client.post("/api/wishlist/", json={
            "name": f"Progreso {i}", "estimated_cost": 100, "priority": "media", "status": "en-progreso",
        })
        ids.append(r.json()["id"])

    # Completar uno
    logged_in_client.patch(f"/api/wishlist/{ids[0]}", json={"status": "completado"})

    # Ahora debería poder crear uno nuevo como en-progreso
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Nuevo", "estimated_cost": 100, "priority": "media", "status": "en-progreso",
    })
    assert r.status_code == 201


def test_wish_farm_draft_does_not_count(logged_in_client):
    # Crear 3 en-progreso + muchos draft
    for i in range(3):
        logged_in_client.post("/api/wishlist/", json={
            "name": f"Progreso {i}", "estimated_cost": 100, "priority": "media", "status": "en-progreso",
        })
    for i in range(10):
        logged_in_client.post("/api/wishlist/", json={
            "name": f"Draft {i}", "estimated_cost": 100, "priority": "media",
        })

    # Pasar un draft a cancelado debe funcionar (draft no cuenta para el límite)
    r = logged_in_client.patch("/api/wishlist/1", json={"status": "cancelado"})
    assert r.status_code == 200


# ============== INTEGRATION TESTS: STATUS TRANSITIONS ==============

def test_status_transition_draft_to_en_progreso(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json=_wishlist_item())
    item_id = r.json()["id"]

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"status": "en-progreso"})
    assert r.status_code == 200
    assert r.json()["status"] == "en-progreso"


def test_status_transition_draft_to_completado_invalid(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json=_wishlist_item())
    item_id = r.json()["id"]

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"status": "completado"})
    assert r.status_code == 400


def test_status_transition_completado_to_anything_invalid(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Test", "estimated_cost": 100, "priority": "media", "status": "completado",
    })
    item_id = r.json()["id"]

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"status": "en-progreso"})
    assert r.status_code == 400

    r = logged_in_client.patch(f"/api/wishlist/{item_id}", json={"status": "draft"})
    assert r.status_code == 400


# ============== INTEGRATION TESTS: MULTI-TENANT ISOLATION ==============

def test_multi_tenant_cannot_read_others_item(client):
    _registrar_y_logear(client, "userA", "a@test.com")
    r = client.post("/api/wishlist/", json=_wishlist_item(name="ItemDeA"))
    item_id = r.json()["id"]

    # Login como userB
    client.post("/api/auth/register", json={
        "username": "userB", "email": "b@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB", "password": "TestPass123!"})

    r = client.get(f"/api/wishlist/{item_id}")
    assert r.status_code == 404


def test_multi_tenant_cannot_update_others_item(client):
    _registrar_y_logear(client, "userA", "a@test.com")
    r = client.post("/api/wishlist/", json=_wishlist_item(name="ItemDeA"))
    item_id = r.json()["id"]

    client.post("/api/auth/register", json={
        "username": "userB", "email": "b@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB", "password": "TestPass123!"})

    r = client.patch(f"/api/wishlist/{item_id}", json={"name": "Hackeado"})
    assert r.status_code == 404


def test_multi_tenant_cannot_delete_others_item(client):
    _registrar_y_logear(client, "userA", "a@test.com")
    r = client.post("/api/wishlist/", json=_wishlist_item(name="ItemDeA"))
    item_id = r.json()["id"]

    client.post("/api/auth/register", json={
        "username": "userB", "email": "b@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB", "password": "TestPass123!"})

    r = client.delete(f"/api/wishlist/{item_id}")
    assert r.status_code == 404


def test_multi_tenant_list_shows_own_items_only(client):
    _registrar_y_logear(client, "userA", "a@test.com")
    client.post("/api/wishlist/", json=_wishlist_item(name="ItemDeA"))

    client.post("/api/auth/register", json={
        "username": "userB", "email": "b@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB", "password": "TestPass123!"})
    client.post("/api/wishlist/", json=_wishlist_item(name="ItemDeB"))

    r = client.get("/api/wishlist/")
    items = r.json()["items"]
    names = [i["name"] for i in items]
    assert "ItemDeB" in names
    assert "ItemDeA" not in names


# ============== INTEGRATION TESTS: INLINE CATEGORY ==============

def test_inline_category_creation(logged_in_client):
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Nuevo con categoria",
        "estimated_cost": 1000,
        "priority": "media",
        "category_name": "Tecnología",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["category"] is not None
    assert data["category"]["nombre"] == "Tecnología"


def test_inline_category_dedup(logged_in_client):
    # Crear categoría primero
    cat_r = logged_in_client.post("/api/user-categories/", json={"nombre": "Viajes", "color": "#3b82f6"})
    cat_id = cat_r.json()["id"]

    # Usar inline category_name con el mismo nombre
    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Viaje", "estimated_cost": 5000, "priority": "alta",
        "category_name": "Viajes",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["category_id"] == cat_id


def test_inline_category_with_another_users_category(client):
    """userA crea categoria, userB no puede usarla via category_id."""
    _registrar_y_logear(client, "userA", "a@test.com")
    cat_r = client.post("/api/user-categories/", json={"nombre": "Secreta", "color": "#ff0000"})
    cat_id = cat_r.json()["id"]

    client.post("/api/auth/register", json={
        "username": "userB", "email": "b@test.com", "password": "TestPass123!",
    })
    client.post("/api/auth/login", json={"username": "userB", "password": "TestPass123!"})

    r = client.post("/api/wishlist/", json={
        "name": "Hack", "estimated_cost": 100, "priority": "media",
        "category_id": cat_id,
    })
    assert r.status_code == 404


# ============== INTEGRATION TESTS: CATEGORY IN LIST RESPONSE ==============

def test_list_includes_category_data(logged_in_client):
    cat_r = logged_in_client.post("/api/user-categories/", json={
        "nombre": "Viajes", "color": "#3b82f6",
    })
    cat_id = cat_r.json()["id"]

    r = logged_in_client.post("/api/wishlist/", json={
        "name": "Viaje", "estimated_cost": 5000, "priority": "alta",
        "category_id": cat_id,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["category"] is not None
    assert data["category"]["nombre"] == "Viajes"
    assert data["category"]["color"] == "#3b82f6"
