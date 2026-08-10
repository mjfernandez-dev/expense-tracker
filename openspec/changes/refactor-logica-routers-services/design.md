# Design: Refactor Routers→Services + Dead-Code Pod

## Technical Approach

Move orchestration verbatim from `routers/movimientos.py` (`create_movimiento`, `update_movimiento`, `_validate_categoria`) and `routers/categorias.py` (`update_user_category`) into existing service modules, so routers become thin `Depends`-wiring delegators (REQ-RS-02/03). The dead `gasto_fijo_id` local disappears (REQ-RS-06); `es_fijo` and the GastoFijo creation path move unchanged (REQ-RS-04/07). Committed in two work units: poda (already applied) then refactor, per the confirmed decision.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Service signature takes `user_id: int` vs full `User` ORM object | int decouples service from auth dependency; router keeps `Depends(get_current_active_user)` | `user_id: int` — matches `crear_user_category(user_id, ...)` convention |
| Commit inside service vs leave in router | Router must stop committing (REQ-RS-02). Service commits, `get_db` success-commit becomes no-op; `get_db` still rolls back on any exception | Commit in service — mirrors `user_category_service` precedent |
| Move `_validate_categoria` as private helper vs inline | Helper preserves 400/404 semantics verbatim | Private `_validate_categoria` in `movimiento_service` |
| New test fixture vs reuse `db_session` | `test_presupuesto.py` already calls services directly on `db_session` — established pattern, zero new plumbing | Reuse `db_session` + `_crear_user` seeding pattern |
| Seed via HTTP fixtures vs direct model rows | HTTP mix couples service tests to `client`; direct rows are the `test_presupuesto.py` precedent | Direct `models.User` + `get_password_hash` seeding |

## Data Flow

    Router (Depends wiring) ──→ Service entry point ──→ helpers (validate / GastoFijo / presupuesto)
                                              │
                                              ├── db.commit() ──→ eager re-query (joinedload categoria, user_category) ──→ response_model
                                              └── HTTPException (400/404) ↑ pre-commit → get_db rollback

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/services/movimiento_service.py` | Modify | Add `crear_movimiento`, `actualizar_movimiento`, private `_validate_categoria`; import `schemas` |
| `backend/services/user_category_service.py` | Modify | `actualizar_user_category` runs `verificar_nombre_unico` internally (REQ-RS-05) |
| `backend/routers/movimientos.py` | Modify | Thin delegators; drop helper imports/`joinedload`/`Decimal`; remove dead `gasto_fijo_id` |
| `backend/routers/categorias.py` | Modify | `update_user_category` → fetch via `obtener_categoria_usuario` + single service call |
| `backend/tests/test_movimientos.py` | Modify | Service-level tests for `crear_movimiento`/`actualizar_movimiento` (REQ-RS-08) |
| `backend/tests/test_categorias.py` | Modify | Service-level duplicate-name test (REQ-RS-08) |
| poda files (`config.py`, `email_service.py`, `schemas.py`, `.env.example`, `conftest.py`, `push.ts`, `migrate_encryption.py`) | Modify/Delete | Work unit 1 — already applied |

## Interfaces / Contracts

```python
# movimiento_service.py
def crear_movimiento(movimiento: schemas.MovimientoCreate, user_id: int, db: Session) -> models.Movimiento:
    # 400 both-categorias-None; 404 missing categoria; es_fijo template; presupuesto link; commit; eager re-query
def actualizar_movimiento(movimiento_id: int, movimiento_update: schemas.MovimientoCreate,
                          user_id: int, db: Session) -> models.Movimiento:
    # 404 not-owned; same pipeline with exclude_movimiento_id=movimiento_id; commit; eager re-query
def _validate_categoria(categoria_id, user_category_id, user_id, db) -> None:  # moved verbatim

# user_category_service.py  (signature unchanged — REQ-RS-05 added internally)
def actualizar_user_category(category: models.UserCategory, update: schemas.UserCategoryUpdate,
                             db: Session) -> models.UserCategory:
    # BEFORE mutation: if update.nombre is not None and update.nombre != category.nombre:
    #     verificar_nombre_unico(category.user_id, update.nombre, db, exclude_id=category.id)  # HTTP 400
```

Thin router sketch: `create_movimiento` handler body is `return movimiento_service.crear_movimiento(movimiento, current_user.id, db)`; `update_user_category` body is `category = user_category_service.obtener_categoria_usuario(category_id, current_user.id, db); return user_category_service.actualizar_user_category(category, category_update, db)`.

**es_fijo flow** (REQ-RS-04/06): validate → `model_dump(exclude={"presupuesto_item_id","es_fijo"})` → `resolve_clasificacion` → construct/add `Movimiento` → if `getattr(movimiento, "es_fijo", False) and tipo=="gasto"`: `GastoFijo(user_id, descripcion, user_category_id, categoria_id, activo=True)`; `db.add(gf); db.flush(); db_movimiento.gasto_fijo_id = gf.id` (no local) → auto-detect + `apply_presupuesto_item_link` → `db.commit()` → re-query with `joinedload(categoria, user_category)` → return.

**Transaction**: HTTPException raised pre-commit leaves the session dirty; `get_db` (database.py) rolls back and re-raises — identical to today. Service commit is idempotent with `get_db`'s success-path commit.

## Testing Strategy

Reuse `db_session` + the `test_presupuesto.py` seeding helper (`_crear_user` using `get_password_hash`). Pure service calls — no `client` dependency.

```python
def test_service_crear_movimiento_es_fijo_crea_template(db_session):
    user = _crear_user(db_session, "u_fijo")
    cat = user_category_service.crear_user_category(user.id, schemas.UserCategoryCreate(nombre="Fijos"), db_session)
    mov = movimiento_service.crear_movimiento(
        schemas.MovimientoCreate(importe=Decimal("500"), fecha=datetime.now(), descripcion="Alquiler",
                                 tipo="gasto", user_category_id=cat.id, es_fijo=True), user.id, db_session)
    assert mov.gasto_fijo_id is not None
    assert db_session.get(models.GastoFijo, mov.gasto_fijo_id).activo is True

def test_service_crear_movimiento_sin_categoria_400(db_session):
    user = _crear_user(db_session, "u_nocat")
    with pytest.raises(HTTPException) as exc:
        movimiento_service.crear_movimiento(
            schemas.MovimientoCreate(importe=Decimal("100"), fecha=datetime.now(),
                                     descripcion="Sin cat", tipo="gasto"), user.id, db_session)
    assert exc.value.status_code == 400

def test_service_actualizar_categoria_nombre_duplicado_400(db_session):
    user = _crear_user(db_session, "u_dup")
    cat1 = user_category_service.crear_user_category(user.id, schemas.UserCategoryCreate(nombre="Original"), db_session)
    user_category_service.crear_user_category(user.id, schemas.UserCategoryCreate(nombre="Existente"), db_session)
    with pytest.raises(HTTPException) as exc:
        user_category_service.actualizar_user_category(cat1, schemas.UserCategoryUpdate(nombre="Existente"), db_session)
    assert exc.value.status_code == 400
    assert cat1.nombre == "Original"      # no persistió
```

| Layer | What | Approach |
|---|---|---|
| Unit (service) | es_fijo template+link, 400 validation, duplicate 400, update pipeline | Direct calls on `db_session`, `pytest.raises(HTTPException)` |
| Integration | Existing full suite incl. `test_gastos_fijos.py`/`test_ciclos.py` | `SECRET_KEY=test python -m pytest backend/tests/ -v` — proofs REQ-RS-07 |

## Threat Matrix

N/A — no shell commands, subprocesses, VCS/PR automation, executable-file classification, or process-integration boundary. HTTP routes and contracts are unchanged (REQ-RS-07).

## Migration / Rollout

No migration — no schema/model change. Rollback: `git revert` per commit; worktree poda is uncommitted (stash/discard first).

## Work-Unit Split

1. `chore: remove dead code and unused config keys` (inherited poda — already in worktree: migrate_encryption.py, email_service.py senders, config keys, `.env.example`, `Token`/`CategoryCreate` schemas, `Dict`→`List` import, `func` import, conftest phantom, push.ts unexport). Touches both gated files at import level only.
2. `refactor: move movimiento and user-category orchestration into services` (service entry points, thin routers, dead `gasto_fijo_id` removal, service-level tests).

Review-gate reality: both commits touch `movimientos.py`/`categorias.py` and trigger native review — commit 2 must leave both files with zero business orchestration so the gate passes on final state. Run the full suite after each commit.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Transactional regression (flush→raise→rollback) | Verbatim move; `get_db` rollback preserved; duplicate-400 tests assert no persist; full suite |
| Test fixture mismatch | Reuse proven `db_session` + `_crear_user` pattern from `test_presupuesto.py`; no new fixture |
| Circular imports | None new — services import only `models`/`schemas` (both dependency-free of services); no service→router imports (grep-verified) |
| Gated-file review twice | Commit 1 import-only changes; commit 2 final state is gate-clean |

## Open Questions

- None blocking. (Remaining `es_fijo` feature deprecation is tracked as out-of-scope per proposal.)
