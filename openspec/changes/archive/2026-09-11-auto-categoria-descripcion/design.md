# Design: Auto-select most-used category for a movement description

## Technical Approach

Extend the existing `GET /movimientos/descripciones/search` flow. `buscar_descripciones` already scans decrypted `descripcion` rows in memory (EncryptedString forbids DB-level grouping); it now also aggregates category usage per exact trimmed case-insensitive description and emits additive nullable category fields per suggestion. `MovimientoForm.tsx` hooks the existing suggestion select/Enter/blur flow to auto-apply the suggested `user_category_id` through a new pure helper, guarded by a manual-touch ref. No new endpoint, no migration.

## Architecture Decisions

|  decision | option | tradeoff | decision |
|---|---|---|---|
| Group key | raw stored string vs trimmed-lower | trimmed+lower merges `"Cafe"`/`"cafe "`; display keeps first-seen original | `desc.strip().lower()` key, first-seen original as `descripcion` (spec: exact trimmed CI) |
| Scan cap (proposal risk) | `.limit()` most-recent rows vs full scan | cap skews `frecuencia` and tie determinism; spec says aggregate over "the current user's movements" | **No cap in v1** — spec authority; cost stays O(rows·c) same as today |
| Tie-break | count → most-recent `fecha` → smaller category id | two categories may share count+max fecha (same-second inserts); needs deterministic fallback | count desc, max `fecha` desc, smaller category id ("stable id") |
| TS nullable shape | `?: number \| null` vs `number \| null` | old server/cached payloads may omit fields | `user_category_id?: number \| null` — helper treats `undefined`/`null` as no suggestion |
| System category | apply on frontend vs no-op | form `<select>` lists user categories only and can't represent system ids | v1 no-op (`categoria_id` returned, never applied); documented follow-up |
| Apply trigger | on type vs on select/blur only | typing would yank the category mid-keystroke | Only suggestion select/Enter and exact-match blur |

## Data Flow

```
descripcion input ──(debounce 300ms)──▶ GET /movimientos/descripciones/search?q=&limit=10
                                              │
                                              ▼
                     buscar_descripciones: scan decrypted rows (user_id filter)
                     → group by desc.strip().lower()
                     → _sugerir_categoria_por_descripcion per group
                     → [{descripcion, frecuencia, user_category_id, categoria_id}]
                                              │
                                              ▼
                      DescripcionSuggestion[] (api.ts, additive fields)
                                              │
        select/Enter ──┐                      │ blur (exact match, 200ms delay)
                        ▼                      ▼
              obtenerCategoriaSugerida(desc, suggestions, categorias, esEdicion, touched)  [pure]
                        │  (null → no-op: offline, edit, touched, first-time, no user_category)
                        ▼
        setCategoriaId(String(user_category_id))  — id must exist in categories list
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/services/movimiento_service.py` | Modify | `buscar_descripciones` fetches `id, descripcion, categoria_id, user_category_id, fecha`; groups by trimmed-lower key; additive response fields via new private `_sugerir_categoria_por_descripcion` |
| `backend/tests/test_movimientos.py` | Modify | Extend the 3 search tests (aggregation+tie-break, limit, per-user isolation) |
| `frontend/src/services/api.ts` | Modify | `DescripcionSuggestion` gains optional `user_category_id`/`categoria_id` |
| `frontend/src/utils/sugerenciaCategoria.ts` | Create | Pure helper + exports |
| `frontend/src/utils/sugerenciaCategoria.test.ts` | Create | Vitest unit tests |
| `frontend/src/components/MovimientoForm.tsx` | Modify | `categoriaTouchedRef`, apply-on-select/blur wiring, reset hooks |

## Interfaces / Contracts

```python
# backend/services/movimiento_service.py — private helper
def _sugerir_categoria_por_descripcion(
    filas: list[tuple[int, str, int | None, int | None, datetime.datetime | None]],
) -> tuple[int | None, int | None]:
    """(user_category_id, categoria_id) más usados; ties: fecha más reciente, id menor."""
    def _top(slot: str) -> int | None:
        conteos: dict[int, list] = {}  # cat_id -> [conteo, fecha_max]
        for _, _, categoria_id, user_category_id, fecha in filas:
            cat = user_category_id if slot == "user" else categoria_id
            if cat is None:
                continue
            prev = conteos.get(cat)
            if prev is None:
                conteos[cat] = [1, fecha or datetime.min]
            else:
                prev[0] += 1
                if fecha and fecha > prev[1]:
                    prev[1] = fecha
        if not conteos:
            return None
        return max(conteos.items(), key=lambda kv: (kv[1][0], kv[1][1], -kv[0]))[0]
    return _top("user"), _top("categoria")
```

```ts
// frontend/src/utils/sugerenciaCategoria.ts
export function obtenerCategoriaSugerida(
  descripcion: string,
  suggestions: DescripcionSuggestion[],
  categoriasDisponibles: UserCategory[],
  esEdicion: boolean,
  categoriaTouched: boolean,
): number | null
// exact trimmed CI match → user_category_id if present && id ∈ categoriasDisponibles && !esEdicion && !touched; else null
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Backend (API) | Aggregation + additive fields; tie-break by recency; limit; per-user isolation; per-field null (user-only category ⇒ `categoria_id: null`) | Extend the 3 existing tests in `test_movimientos.py`; `_gasto(user_category_id)` fixture |
| Frontend (unit) | Exact/CI/trimmed match applies; partial/first-time ⇒ null; touched ⇒ null; edit ⇒ null; undefined fields ⇒ null; id not in available list ⇒ null; empty suggestions (offline) ⇒ null | New `sugerenciaCategoria.test.ts` (vitest, mirrors `presupuestoSuggestions.test.ts` conventions) |

Commands: `SECRET_KEY=test python -m pytest backend/tests/test_movimientos.py -v`; `npm test` (vitest run).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Response fields are additive — old clients ignore them. Rollback: revert form wiring, helper, and service aggregation as one work unit.

## Open Questions

- [ ] Confirm tertiary tie-break reading: "stable id" = category id (deterministic across identical timestamps), not movement id. Assumed category id; low risk.
- [ ] Blur exact-match may run against a suggestions list slightly stale within the 300ms debounce window — failure mode is benign no-op (default preserved); acceptable as designed?
