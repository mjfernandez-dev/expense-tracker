# Gentleman Guardian Angel — Code Review Rules
# FinanzaApp (FastAPI + React + BlueGlass)

## GENERAL

- No debug code (`console.log`, `print(`, `breakpoint()`) committed to production files
- No hardcoded secrets, API keys, passwords, or tokens
- No `TODO` / `FIXME` comments left in production code without a linked issue
- No dead code (commented-out blocks, unused imports, unreachable branches)
- Spanish variable/function names for domain logic; English for generic utilities

---

## PYTHON / BACKEND (FastAPI + SQLAlchemy)

### Structure
- Each router lives in `backend/routers/<feature>.py` with `prefix="/<feature>"` and `tags=["<feature>"]`
- Business logic belongs in `backend/services/`, NOT inside routers
- Models in `backend/models.py`, Pydantic schemas in `backend/schemas.py`
- Private helpers inside a module must be prefixed with `_` (e.g. `_validate_categoria`)

### Security
- Every endpoint that touches user data MUST use `current_user = Depends(get_current_active_user)`
- Multi-tenancy: always filter queries by `user_id == current_user.id` — never expose another user's data
- Sensitive fields (descripciones, info bancaria, contactos) must use `EncryptedString` column type

### SQLAlchemy
- Use `joinedload` for eager loading of relationships to avoid N+1 queries
- Amounts must be `Numeric(10, 2)` in the DB and `Decimal` in Python — never `float`
- Timestamps default to `ahora_buenos_aires()` from `services/ciclo_time_service.py` — never `datetime.utcnow()` or `datetime.now()`

### Error handling
- Use `HTTPException` with appropriate status codes (404 not found, 400 bad request, 403 forbidden)
- Validate ownership before returning or modifying any resource
- Return meaningful Spanish error messages in the `detail` field

### Tests
- New endpoints and services require tests in `backend/tests/`
- Tests use `pytest` and must pass with `SECRET_KEY=test python -m pytest backend/tests/ -v`
- Do not mock the DB unless strictly necessary — use the test SQLite in-memory DB

---

## TYPESCRIPT / FRONTEND (React 19 + Vite + Tailwind CSS 4)

### Components
- One component per file; filename matches the exported component name (PascalCase)
- Define prop types with a `interface <ComponentName>Props` before the component
- Prefer function declarations over arrow functions for top-level components
- No inline styles — use Tailwind classes only

### State & Effects
- `useState` type must be explicit: `useState<string>('')`, not `useState('')`
- `useEffect` must list ALL dependencies in the array — no empty arrays unless truly mount-only
- Async calls inside `useEffect` must use an inner `async` function, not make the effect itself async

### API calls
- All HTTP calls go through `frontend/src/services/api.ts` — no direct `axios`/`fetch` in components
- Errors from API calls must be caught and stored in a `error` state variable — never silently swallowed
- Loading state must be set to `true` before the call and `false` in `finally`

### Styling — BlueGlass Design System
- Primary palette: `slate-*` + `blue-*` gradients
- Interactive elements use `bg-blue-600 hover:bg-blue-700` for primary actions
- Destructive actions use `bg-red-600 hover:bg-red-700`
- Cards use `bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl`
- No arbitrary Tailwind values (e.g. `w-[347px]`) unless there is no alternative
- Exception: progress bars must use `style={{ width: \`${pct}%\` }}` for runtime percentage widths — Tailwind JIT cannot generate arbitrary values with runtime data. Do NOT use `[--bar-w:${pct}%] dyn-bar`.

### TypeScript
- No `any` type — use proper types or `unknown` with a type guard
- Import types with `import type { ... }` to avoid runtime imports
- Avoid non-null assertions (`!`) — use optional chaining or explicit null checks

---

## GIT & COMMITS

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- No "Co-Authored-By" or AI attribution in commit messages
- Each commit must be a coherent, reviewable work unit — no "WIP" commits
- Do not commit `*.db`, `.env`, `__pycache__/`, `node_modules/`, `dist/`, `.venv/`

---

## MIGRATIONS (Alembic)

- Every schema change requires an Alembic migration in `backend/alembic/versions/`
- `revision` ID must be a real 12-char hex string — NEVER `'xxxx'` or placeholder
- `down_revision` must chain correctly to the previous migration
- Migration filenames must describe the change: `add_presupuesto_item.py`, not `auto_generated.py`
