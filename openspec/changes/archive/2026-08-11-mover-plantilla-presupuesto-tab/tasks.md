# Tasks: Mover plantilla de presupuesto al tab Presupuesto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~75–100 (CicloTab ~50–60, App ~4, AccountPage ~20 deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Sub-tabs en CicloTab + onRefresh en App + limpieza AccountPage (misma change, commits ordenados) | PR 1 | `npm run lint` && `npm run build` (en `frontend/`) | Smoke manual: sub-tabs, "Categorías" sin navegación, /account sin plantilla, usuario sin ciclos | `git revert` del commit; card vuelve a AccountPage, botón navega a /account |

## Phase 1: CicloTab — Contenedor de sub-tabs

- [x] 1.1 `frontend/src/components/CicloTab.tsx`: add `import PresupuestoManager from './PresupuestoManager';`
- [x] 1.2 Add `type SubTab = 'ciclo' | 'plantilla';`; extend `CicloTabProps` with `onRefresh: () => void`; destructure `{ refreshKey, onRefresh }`
- [x] 1.3 Add `const [subTab, setSubTab] = useState<SubTab>('ciclo');`
- [x] 1.4 Add module-level `SubTabSelector` (props `subTab`, `onSelect`) reusing `MovimientoList.tsx:314` pattern: container `bg-slate-700/50 rounded-xl p-1`, active `bg-blue-600 text-white`, inactive `text-slate-400 hover:text-slate-200`; options "Ciclo actual" / "Plantilla"
- [x] 1.5 Add root `visibilitychange` effect: `if (document.visibilityState === 'visible') onRefresh()`; cleanup removes listener; dep `[onRefresh]`
- [x] 1.6 Add `plantilla` branch as FIRST early return (before loading/error/ciclos checks): selector + copy `<p>Defaults que el asistente y el ciclo consumen.</p>` + `<PresupuestoManager refreshKey={refreshKey} />` — accesible sin ciclos (spec: "Accesible sin ciclo activo"). NOTA: sin `<h2>` propio; `PresupuestoManager` mantiene su `<h2>Presupuesto</h2>` interno (design.md L59: "sin duplicar encabezado nivel 2")
- [x] 1.7 Ciclo branch: render selector above existing early returns (loading/error/sin-ciclos/selección) and main content, so it stays visible en todos los estados
- [x] 1.8 "Categorías" button (línea ~400): `onClick={() => setSubTab('plantilla')}`; remove `navigate('/account')`
- [x] 1.9 Remove `import { useNavigate }` and `const navigate = useNavigate();`

## Phase 2: App wiring + limpieza AccountPage

- [x] 2.1 `frontend/src/App.tsx`: add `const handleRefresh = useCallback(() => setRefreshKey(prev => prev + 1), []);` and `<CicloTab refreshKey={refreshKey} onRefresh={handleRefresh} />` (línea 187); `useCallback` ya importado
- [x] 2.2 `frontend/src/pages/AccountPage.tsx`: remove card "Plantilla de presupuesto", `import PresupuestoManager`, `useState`/`useEffect` imports (quedan sin uso), estado `refreshKey` y effect `visibilitychange` — queda solo "Cambiar Contraseña" (spec: "Ausencia en Cuenta")

## Phase 3: Verificación

- [x] 3.1 `npm run lint` en `frontend/` — sin errores
- [x] 3.2 `npm run build` en `frontend/` (tsc estricto + vite) — pasa
- [x] 3.3 ~~Smoke manual~~ **OMITIDO por decisión del usuario (2026-08-11)**: sub-tabs, conmutación sin URL, "Categorías" sin navegar, /account sin plantilla, usuario sin ciclos, refresh por visibilitychange. Verificación manual pendiente antes de producción; el verify reporta esta omisión como riesgo.
- [x] 3.4 Regresión backend (sin cambios): `SECRET_KEY=test python -m pytest backend/tests/ -v`
