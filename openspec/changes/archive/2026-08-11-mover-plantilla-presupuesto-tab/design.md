# Design: Mover plantilla de presupuesto al tab Presupuesto

## Technical Approach

`CicloTab` (que ya recibe `refreshKey` desde `App`) se convierte en contenedor de dos sub-tabs con estado local `subTab: 'ciclo' | 'plantilla'` (sin ruta nueva). El sub-tab `plantilla` renderiza `PresupuestoManager` (sin cambios internos) dentro de un bloque con copy diferenciado. El listener `visibilitychange` que hoy vive en `AccountPage` se mueve a `CicloTab`; para poder incrementar el `refreshKey` que la app inyecta, `App` pasa además un callback `onRefresh` (único cambio en `App.tsx`). `AccountPage` pierde la card, su estado y su listener. El botón "Categorías" conmuta `subTab` por estado local.

## Architecture Decisions

| Decisión | Opciones | Tradeoff | Decisión |
|----------|----------|----------|----------|
| Ubicación del estado `subTab` | (a) `useState` inline en `CicloTab`; (b) wrapper `PresupuestoTab` que contiene `CicloTab` + `PresupuestoManager`; (c) ruta `/ciclo/plantilla` | (b) obliga a reestructurar ~420 líneas de ciclo o prop-drilling masivo; (c) agrega ruta (out of scope). (a) es el cambio estructural mínimo y el estado es UI efímera | **Inline en `CicloTab`** con `useState<SubTab>('ciclo')` |
| Cómo incrementar `refreshKey` desde el contenedor | (a) `App` pasa `onRefresh: () => void`; (b) `CicloTab` duplica estado local con efecto espejo; (c) listener en `PresupuestoManager` | `refreshKey` es prop de solo-lectura: `CicloTab` no puede incrementarla. (b) doble buffer con riesgo de carrera; (c) viola el delta spec (listener en el contenedor) y tocaría un componente "sin cambios". (a) mantiene a `App` como único dueño del estado | **`onRefresh` callback desde `App`** (uso único: `setRefreshKey(prev => prev + 1)`) |
| Alcance del listener `visibilitychange` | (a) raíz de `CicloTab` siempre montado; (b) solo cuando `subTab === 'plantilla'` | (a) replica el comportamiento de `AccountPage` (siempre escuchando) y evita re-mounts; `PresupuestoManager` desmontado en sub-tab ciclo → sin refetch innecesario. (b) efecto condicional con dep extra | **(a) raíz de `CicloTab`** |
| Acceso a Plantilla sin ciclos | (a) selector por encima de los early returns y branch `plantilla` antes que ellos; (b) extraer `CicloActualView` | (b) extrae cientos de líneas y prop-drilling. (a) es el mínimo: hoistear un `SubTabSelector` local + early return de plantilla previo a `ciclos.length === 0` | **(a)** — `CicloTab` deja de depender de ciclos para renderizar el selector y la plantilla |
| Estilos del segmented control | (a) patrón de `MovimientoList.tsx:314`; (b) nuevo diseño ad-hoc | (a) ya es BlueGlass (contenedor `bg-slate-700/50 rounded-xl p-1`, activo `bg-blue-600 text-white`, inactivo `text-slate-400 hover:text-slate-200`), sin valores arbitrarios | **Reusar patrón de `MovimientoList`** con estado activo `bg-blue-600` |
| Botón "Categorías" | (a) `setSubTab('plantilla')`; (b) mantener `navigate('/account')` | (a) cumple el spec; deja `useNavigate` sin uso → se elimina import + `const navigate`. (b) contradice el delta | **(a) conmutar a estado local**; remover `useNavigate` de `CicloTab` |

## Data Flow

    App (refreshKey state) ──refreshKey────▶ CicloTab
    App (onRefresh cb)     ───────┘ ▲
                                    │ document 'visibilitychange' → onRefresh()
    CicloTab subTab='plantilla' ──▶ <PresupuestoManager refreshKey={refreshKey} />
    PresupuestoManager ──getUserCategories/getGastosFijos/updateUserPreferences──▶ API
                             (re-fetch cuando refreshKey cambia — lógica intacta)
    CicloTab "Categorías" onClick ──▶ setSubTab('plantilla')   (sin navigate)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/CicloTab.tsx` | Modify | Agregar `subTab` state, `SubTabSelector` (componente local en archivo), prop `onRefresh` + listener `visibilitychange` (raíz), branch `plantilla` (selector + copy + `PresupuestoManager`), botón "Categorías" → `setSubTab('plantilla')`, remover `useNavigate`. Los early returns existentes (loading/error/sin-ciclos) quedan solo para el sub-tab ciclo y anteponen el selector |
| `frontend/src/App.tsx` | Modify | `const handleRefresh = useCallback(() => setRefreshKey(prev => prev + 1), [])`; `<CicloTab refreshKey={refreshKey} onRefresh={handleRefresh} />`. Sin otros cambios |
| `frontend/src/pages/AccountPage.tsx` | Modify | Eliminar card "Plantilla de presupuesto", import de `PresupuestoManager`, estado `refreshKey` y su effect `visibilitychange`; quitar `useState`/`useEffect` del import si quedan sin uso. Queda la card "Cambiar Contraseña" |
| `frontend/src/components/PresupuestoManager.tsx` | Unchanged | Se reutiliza tal cual |
| `openspec/changes/mover-plantilla-presupuesto-tab/design.md` | Create | Este documento |

## Interfaces / Contracts

```tsx
type SubTab = 'ciclo' | 'plantilla';

interface CicloTabProps {
  refreshKey: number;
  onRefresh: () => void;  // único mecanismo para incrementar refreshKey desde el contenedor
}
```

Estructura de render de `CicloTab`:

```
subTab === 'plantilla'
  → selector + <h2>Plantilla</h2> + <p>Defaults que el asistente y el ciclo consumen.</p>
      + <PresupuestoManager refreshKey={refreshKey} />
subTab === 'ciclo'
  → selector + (early returns de ciclo | contenido actual)
```

El selector se define una vez como componente local `SubTabSelector` y se reutiliza en todas las ramas (evita drift visual). El h2 interno "Presupuesto" de `PresupuestoManager` se mantiene tal cual; el wrapper solo agrega el copy diferenciado sin duplicar encabezado nivel 2.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | — (no hay runner FE; no hay lógica pura nueva) | — |
| Integration | Sub-tabs, conmutación sin ruta, botón "Categorías", acceso sin ciclos | Manual smoke + `npm run build` (tsc estricto) |
| E2E | `visibilitychange` → refreshKey; /account sin plantilla | Manual en navegador: cambiar de pestaña, usuario sin ciclos |
| Static | Lint + types | `npm run lint` && `npm run build` |

No hay tests backend porque el backend no cambia (se pueden correr los existentes con `SECRET_KEY=test python -m pytest backend/tests/ -v` por regresión).

## Threat Matrix

N/A — no routing (navegación por estado local), shell, subprocess, VCS/PR automation, executable-file classification, ni process-integration boundary.

## Migration / Rollout

No migration required. Rollback: `git revert` del commit; `PresupuestoManager` nunca se modifica → sin riesgo de datos.

## Open Questions

None.
