# Design: Wishlist (Lista de Deseos)

## Technical Approach

Add `WishlistItem` model following existing multi-tenant patterns (`user_id` FK, `EncryptedString` for sensitive fields, `ahora_buenos_aires` timestamps). Size is computed at read time via Pydantic `@computed_field` — never stored. Wish Farm rule (max 3 en-progreso) and status transitions enforced at service layer. Inline category creation searches by user+name first to avoid duplicates. Frontend adds a new `Tab` value `'wishlist'` + three components following existing patterns.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Size derivation | Pydantic `@computed_field` | Read-only, zero storage, matches spec §wishlist-farm-sizes |
| Wish Farm enforcement | Service layer (`_check_wish_farm_limit`) | Business rule needs Spanish error messages, not DB constraint |
| Status transitions | Service layer state machine dict | Centralized validation, follows `ciclo_service` pattern |
| Priority sorting | SQL `CASE WHEN` in `order_by` | More efficient than Python sort for paginated queries |
| Inline category creation | Search by `user_id + nombre` first, create if no match | Prevents duplicates per spec §wishlist-categories |
| Field encryption | `EncryptedString` for `name` + `notes` | Follows existing pattern (Movimiento.descripcion, User.cvu) |

## Data Flow

```
Frontend                          Backend
─────────                        ───────
WishlistPage ──GET /wishlist──→  wishlist.py ──→ wishlist_service.py ──→ DB
    │                                │                  │
    │  ← response with computed      │  _derive_size()  │
    │     size, category nested      │  _check_transition() │
    │                                │  _enforce_farm_limit() │
    │                                │                  │
WishlistForm ──POST/PATCH──────→  wishlist.py ──→ wishlist_service.py ──→ DB
    │  (inline category via          │  _get_or_create_category()
    │   category_name field)         │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/models.py` | Modify | Add `WishlistItem` model (user_id, name, estimated_cost, priority, status, category_id, notes, monto_ahorrado, timestamps) |
| `backend/schemas.py` | Modify | Add `WishlistItemCreate/Update/Read` schemas; `WishlistItemRead` has `@computed_field size` |
| `backend/routers/wishlist.py` | Create | `prefix="/wishlist"`, `tags=["wishlist"]`, 5 endpoints (CRUD + status PATCH) |
| `backend/services/wishlist_service.py` | Create | `_derive_size()`, `_validate_transition()`, `_check_wish_farm_limit()`, `_get_or_create_category()` |
| `backend/main.py` | Modify | Add `from routers import wishlist` + `api_router.include_router(wishlist.router)` |
| `backend/alembic/versions/` | Create | Migration: `create_wishlist_items_table` — revises `b4a50c6e16e5` |
| `backend/tests/test_wishlist.py` | Create | Tests for CRUD, Wish Farm limit, status transitions, category inline, multi-tenant isolation |
| `frontend/src/types/index.ts` | Modify | Add `WishlistItem`, `WishlistItemCreate`, `WishlistItemUpdate` interfaces |
| `frontend/src/services/api.ts` | Modify | Add `getWishlistItems`, `createWishlistItem`, `updateWishlistItem`, `deleteWishlistItem` |
| `frontend/src/components/WishlistPage.tsx` | Create | Tab page: list, error/loading/empty states |
| `frontend/src/components/WishlistItemCard.tsx` | Create | Card with priority/size/status badges, action buttons |
| `frontend/src/components/WishlistForm.tsx` | Create | Modal form with category search+create, priority/status selects |
| `frontend/src/App.tsx` | Modify | Add `'wishlist'` to `Tab` union, tab config, conditional render, bottom nav entry |

## Interfaces / Contracts

### Backend Schemas

```python
# --- Enums (validated as strings, consistent with existing patterns) ---
VALID_PRIORITIES = {"alta", "media", "baja"}
VALID_STATUSES = {"draft", "en-progreso", "completado", "cancelado"}
STATUS_TRANSITIONS = {
    "draft": {"en-progreso", "cancelado"},
    "en-progreso": {"completado", "cancelado"},
    "completado": set(),
    "cancelado": set(),
}

# --- Create ---
class WishlistItemCreate(BaseModel):
    name: str
    estimated_cost: MoneyDecimal
    priority: str  # validated via field_validator
    status: str = "draft"
    category_id: Optional[int] = None
    category_name: Optional[str] = None  # for inline creation
    notes: Optional[str] = None

# --- Read ---
class WishlistItemRead(BaseModel):
    id: int
    user_id: int
    name: str
    estimated_cost: MoneyDecimal
    priority: str
    status: str
    category_id: Optional[int]
    category: Optional[UserCategoryRead]  # nested
    notes: Optional[str]
    monto_ahorrado: MoneyDecimal = Decimal('0')
    size: str  # computed_field
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def size(self) -> str:
        if self.estimated_cost < 500: return "chico"
        if self.estimated_cost <= 5000: return "mediano"
        return "grande"

# --- Update ---
class WishlistItemUpdate(BaseModel):
    name: Optional[str] = None
    estimated_cost: Optional[MoneyDecimal] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    notes: Optional[str] = None
    monto_ahorrado: Optional[MoneyDecimal] = None
```

### Frontend Types

```typescript
export type WishlistPriority = 'alta' | 'media' | 'baja';
export type WishlistStatus = 'draft' | 'en-progreso' | 'completado' | 'cancelado';
export type WishlistSize = 'chico' | 'mediano' | 'grande';

export interface WishlistItem {
  id: number;
  user_id: number;
  name: string;
  estimated_cost: number;
  priority: WishlistPriority;
  status: WishlistStatus;
  size: WishlistSize;
  category_id: number | null;
  category: UserCategory | null;
  notes: string | null;
  monto_ahorrado: number;
  created_at: string;
  updated_at: string;
}

export interface WishlistItemCreate {
  name: string;
  estimated_cost: number;
  priority: WishlistPriority;
  status?: WishlistStatus;
  category_id?: number | null;
  category_name?: string | null;
  notes?: string | null;
}

export interface WishlistItemUpdate {
  name?: string;
  estimated_cost?: number;
  priority?: WishlistPriority;
  status?: WishlistStatus;
  category_id?: number | null;
  category_name?: string | null;
  notes?: string | null;
  monto_ahorrado?: number | null;
}
```

### API Endpoints

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/wishlist/` | 200 | List user's items (priority-sorted, paginated via `limit`/`offset`) |
| GET | `/wishlist/{id}` | 200 / 404 | Get single item (scoped by user_id) |
| POST | `/wishlist/` | 201 / 400 / 422 | Create item (inline category via `category_name`) |
| PATCH | `/wishlist/{id}` | 200 / 400 / 404 | Partial update (status transitions validated, Wish Farm enforced) |
| DELETE | `/wishlist/{id}` | 204 / 404 | Delete item (owner-only) |

### Service Layer Contract

```python
def _derive_size(estimated_cost: Decimal) -> str  # pure function
def _validate_transition(current: str, target: str) -> None  # raises ValueError
def _check_wish_farm_limit(db: Session, user_id: int) -> None  # raises ValueError
def _get_or_create_category(db: Session, user_id: int, name: str) -> UserCategory
def create_wishlist_item(db: Session, user_id: int, data: WishlistItemCreate) -> WishlistItem
def update_wishlist_item(db: Session, item: WishlistItem, data: WishlistItemUpdate) -> WishlistItem
def delete_wishlist_item(db: Session, item: WishlistItem) -> None
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `_derive_size` boundaries (499, 500, 5000, 5001) | Pure function tests, no DB needed |
| Unit | `_validate_transition` all valid + invalid paths | State machine matrix coverage |
| Unit | Size `@computed_field` in Pydantic schema | Direct schema instantiation |
| Integration | Full CRUD via test client with auth | 201 create, 200 list/get, 200 patch, 204 delete |
| Integration | Wish Farm: 4th en-progreso returns 400 | Create 3 → fail 4th → complete one → succeed |
| Integration | Multi-tenant isolation: user B cannot read/modify user A's items | Different auth headers |
| Integration | Inline category creation + dedup | POST with `category_name`, verify FK |
| Integration | Invalid status transitions return 400 | e.g., draft→completado, completado→en-progreso |
| E2E | Frontend flow: create → card renders → edit → delete | Playwright (optional, post-MVP) |

## Migration / Rollout

**Migration**: New table `wishlist_items` with FK to `users` and `user_categories`. No data migration needed. Rollback: `alembic downgrade -1`.

**Rollback**: Remove router from `main.py`, delete `routers/wishlist.py` + `services/wishlist_service.py`, revert `App.tsx` tab config, restore `models.py` + `schemas.py` + `types/index.ts` + `api.ts`.

**No feature flags** required — new feature is opt-in via a new tab.

## Open Questions

None — all decisions are resolved by specs and existing codebase patterns.
