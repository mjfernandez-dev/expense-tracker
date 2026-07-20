# Design: Goal Contributions

## Technical Approach

Two new endpoints on the existing wishlist router, backed by a new `GoalContribution` table and a `goal_service.py` validation layer. Withdrawals use negative amounts on the same table (simpler than a separate operation column). `calcular_resumen()` adds two queries to incorporate goal deductions. Frontend extends `WishlistItemCard` with a progress bar and adds a modal form (`GoalContributeForm`) for split-source contributions.

## Architecture Decisions

### Decision: New `goal_service.py` vs. extending `wishlist_service.py`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New service | Clearer separation; contribution validation depends on ciclo/budget logic that doesn't belong in wishlist CRUD | **Chosen** |
| Extend wishlist | Fewer files; but mixes CRUD with financial validation | Rejected |

**Rationale**: Contribution validation needs to read ciclo resumen, presupuesto items, and executed amounts — that's a different concern from CRUD operations on wishlist items.

### Decision: Negative amount for withdrawals vs. `operation` enum

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Negative amount | Simpler queries (`SUM(amount)` works directly); one schema reuse | **Chosen** |
| `operation` enum + absolute | More explicit; but adds complexity for aggregation | Rejected |

**Rationale**: All contributions from presupuesto are positive (can't withdraw from presupuesto — always returns to disponible). A negative `amount` is unambiguous and simplifies reporting.

### Decision: Atomicity boundary

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Transaction in endpoint handler | One commit per request; matches existing pattern (`database.py:get_db` commits on success) | **Chosen** |
| Transaction in service | Service would need commit control, inconsistent with current pattern | Rejected |

**Rationale**: The existing `get_db` dependency already wraps requests in a transaction. Services `flush()` and the endpoint returns — `get_db` commits. This keeps consistency.

### Decision: Validation before DB reads vs. in-transaction reads

**Choice**: Read current resumen/presupuesto state INSIDE the transaction, after `db.flush()` for writes, before the final commit.
**Rationale**: Avoids race conditions — reads are stale-resistant when in the same transaction (SQLite serializes, PostgreSQL uses MVCC).

### Decision: Frontend modal reuses existing pattern

**Choice**: `GoalContributeForm` as a controlled modal component, following the pattern of `WishlistForm` (props: `item`, `onSuccess`, `onClose`).
**Rationale**: Consistency with the existing form approach; no need for a separate modal framework.

## Data Flow

```
Contribute:
  POST /api/wishlist/{id}/contribute
    → Router (wishlist.py) validates ownership via get_current_active_user
    → goal_service.contribute_to_goal(db, item, sources, ciclo)
        → For each source:
            - If presupuesto: validate amount ≤ remaining budget (monto_estimado - ejecutado - existing_contribs_from_item)
            - If disponible: validate amount ≤ saldo_disponible_actual (from calcular_resumen)
        → GoalContribution rows created (db.add)
        → WishlistItem.monto_ahorrado += total_amount
    → flush (writes visible inside transaction)
    → return updated WishlistItemRead

Withdraw:
  POST /api/wishlist/{id}/withdraw
    → Router validates ownership
    → goal_service.withdraw_from_goal(db, item, amount, ciclo)
        → Validate item.monto_ahorrado >= amount
        → Create GoalContribution(amount=-withdrawn, source_type="disponible")
        → WishlistItem.monto_ahorrado -= amount
    → flush
    → return updated WishlistItemRead

Resumen (calcular_resumen):
  New additions after existing presupuesto calculations:
    goal_contrib_presupuesto = Σ(GoalContribution.amount WHERE goal.ciclo_id=current AND source_type='presupuesto')
    goal_savings = Σ(GoalContribution.amount WHERE amount > 0 AND ciclo_id=current)
    presupuesto_efectivo = monto_estimado - ejecutado - goal_contrib_for_this_item
    saldo_disponible_total = ingresos - ahorro_objetivo - presupuesto_confirmado - goal_savings
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/models.py` | Modify | Add `GoalContribution` model with FKs to WishlistItem, Ciclo, PresupuestoItem |
| `backend/schemas.py` | Modify | Add `GoalContributionSource`, `ContributeRequest`, `ContributeResponse`, `WithdrawRequest` schemas |
| `backend/services/goal_service.py` | Create | Validation: available budget per source type, available saldo; contribute/withdraw logic |
| `backend/services/ciclo_service.py` | Modify | `calcular_resumen()`: subtract goal contributions from presupuesto cap and saldo_disponible_total |
| `backend/routers/wishlist.py` | Modify | Add `POST /{id}/contribute` and `POST /{id}/withdraw` endpoints |
| `backend/alembic/versions/` | New | Migration `add_goal_contributions_table` (revises `c9d8e7f6a5b4`) |
| `frontend/src/types/index.ts` | Modify | Add `GoalContributionSource`, `ContributeRequest`, `GoalContributionRead` types |
| `frontend/src/services/api.ts` | Modify | Add `contributeToGoal()`, `withdrawFromGoal()` API functions |
| `frontend/src/components/WishlistItemCard.tsx` | Modify | Add progress bar showing `monto_ahorrado / estimated_cost`; contribute/withdraw buttons |
| `frontend/src/components/GoalContributeForm.tsx` | Create | Modal form with split-source selection, amount inputs, and validation display |
| `frontend/src/components/WishlistPage.tsx` | Modify | Wire contribute/withdraw handlers; pass to WishlistItemCard |

## Interfaces / Contracts

```python
# === Schemas (schemas.py) ===

class GoalContributionSource(BaseModel):
    source_type: Literal["disponible", "presupuesto"]
    presupuesto_item_id: Optional[int] = None
    amount: MoneyDecimal

class ContributeRequest(BaseModel):
    sources: List[GoalContributionSource]  # at least 1

class ContributeResponse(BaseModel):
    id: int
    monto_ahorrado: MoneyDecimal
    message: str

class WithdrawRequest(BaseModel):
    amount: MoneyDecimal

# === Model (models.py) ===

class GoalContribution(Base):
    __tablename__ = "goal_contributions"
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("wishlist_items.id"), nullable=False, index=True)
    ciclo_id = Column(Integer, ForeignKey("ciclos.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)  # positive=contribute, negative=withdraw
    source_type = Column(String, nullable=False)  # "disponible" | "presupuesto"
    presupuesto_item_id = Column(Integer, ForeignKey("presupuesto_items.id"), nullable=True)
    created_at = Column(DateTime, default=ahora_buenos_aires)

    goal = relationship("WishlistItem", backref="contributions")
    ciclo = relationship("Ciclo")
    presupuesto_item = relationship("PresupuestoItem")

# === Goal service (goal_service.py) ===

def contribute_to_goal(
    db: Session, item: models.WishlistItem, user_id: int,
    sources: list[GoalContributionSource], ciclo: models.Ciclo
) -> models.WishlistItem

def withdraw_from_goal(
    db: Session, item: models.WishlistItem, amount: Decimal
) -> models.WishlistItem

# === API (wishlist.py additions) ===

@router.post("/{item_id}/contribute", response_model=schemas.ContributeResponse)
def contribute(
    item_id: int, data: schemas.ContributeRequest,
    db=Depends(get_db), current_user=Depends(get_current_active_user),
)

@router.post("/{item_id}/withdraw", response_model=schemas.ContributeResponse)
def withdraw(
    item_id: int, data: schemas.WithdrawRequest,
    db=Depends(get_db), current_user=Depends(get_current_active_user),
)
```

```typescript
// === Frontend types (types/index.ts) ===

export interface GoalContributionSource {
  source_type: 'disponible' | 'presupuesto';
  presupuesto_item_id?: number | null;
  amount: number;
}

export interface ContributeRequest {
  sources: GoalContributionSource[];
}

export interface WithdrawRequest {
  amount: number;
}

// === API functions (api.ts) ===

export const contributeToGoal = async (
  id: number, data: ContributeRequest
): Promise<{ id: number; monto_ahorrado: number; message: string }>

export const withdrawFromGoal = async (
  id: number, data: WithdrawRequest
): Promise<{ id: number; monto_ahorrado: number; message: string }>
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (backend) | GoalContribution model validation (amount types, FKs) | Pydantic schema tests + SQLite model instantiation |
| Unit (backend) | `contribute_to_goal`: presupuesto available validation, disponible validation, split-source atomicity | Mock/Pure DB with test ciclo + test presupuesto items |
| Unit (backend) | `withdraw_from_goal`: insufficient funds, success case | Same approach |
| Unit (backend) | `calcular_resumen`: formula with contributions | Seed GoalContribution rows, compare expected presupuesto_efectivo and saldo_disponible_total |
| Integration | `POST /wishlist/{id}/contribute` success + error scenarios | FastAPI TestClient with auth + in-memory SQLite |
| Integration | `POST /wishlist/{id}/withdraw` success + error scenarios | Same |
| Frontend | `GoalContributeForm` renders available sources and amounts | Vitest + React Testing Library |
| Frontend | Progress bar displays correct percentage and caps at 100% | Vitest rendering test |

## Migration / Rollout

**Migration file**: `add_goal_contributions_table.py`
- `down_revision`: `c9d8e7f6a5b4` (the wishlist_items table creation)
- Creates `goal_contributions` table with FKs and indexes
- No data migration needed (new table)

**Rollback**: Alembic downgrade drops the table; `calcular_resumen()` revert is a code revert.

## Open Questions

- [ ] None
