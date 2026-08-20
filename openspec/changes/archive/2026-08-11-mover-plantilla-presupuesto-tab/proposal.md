# Proposal: Mover plantilla de presupuesto al tab Presupuesto

## Intent

La plantilla de presupuesto (`PresupuestoManager`) vive en `AccountPage` (`/account`), donde convive con "Cambiar Contraseña". Para el usuario es confuso: "Cuenta" mezcla dominio de cuenta con input del ciclo financiero. La plantilla es configuración de input del ciclo, no del dominio cuenta. Se mueve al tab Presupuesto (label de `tabLabel.ciclo`) como sub-tab `Plantilla`, dejando Cuenta con contenido de cuenta únicamente.

## Scope

### In Scope
- Sub-tabs `Ciclo actual | Plantilla` dentro del tab Ciclo (`CicloTab`), con estado local (sin ruta nueva).
- Renderizar `PresupuestoManager` en el sub-tab Plantilla con el `refreshKey` que ya recibe `CicloTab` desde `App`; mover la lógica `visibilitychange` (hoy en `AccountPage`) al contenedor nuevo.
- Remover de `AccountPage` la card "Plantilla de presupuesto" y su estado/lógica `refreshKey`; Cuenta queda con "Cambiar Contraseña" y lugar para perfil futuro.
- Botón "Categorías" de `CicloTab` → cambia al sub-tab Plantilla (estado local), no navega más a `/account`.
- Deltas spec para `budget-template` y `cycle-tab`.

### Out of Scope
- Cambios internos de `PresupuestoManager` (comportamiento intacto).
- `ChangePassword.tsx` y ruta `/account/change-password` sin cambios.
- Ruta `/ciclo/plantilla`: navegación por estado local.
- Backend: sin cambios.
- Sección de perfil futuro en Cuenta.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `budget-template`: la requirement "Plantilla en Configuración/Cuenta" MUST cambiar — la plantilla vive en el tab Presupuesto (sub-tab Plantilla), MUST estar ausente de Configuración/Cuenta.
- `cycle-tab`: nueva requirement de sub-tabs `Ciclo actual | Plantilla` dentro del tab Ciclo; el botón "Categorías" MUST conmutar al sub-tab Plantilla sin navegar a `/account`.

## Approach

1. En `CicloTab`, agregar estado `subTab: 'ciclo' | 'plantilla'` y un segmented control en el encabezado (`Ciclo actual | Plantilla`).
2. Render condicional: sub-tab ciclo = contenido actual; sub-tab plantilla = `<PresupuestoManager refreshKey={refreshKey} />` con copy diferenciado ("Defaults que el asistente y el ciclo consumen").
3. Mover el listener `visibilitychange` que incrementa `refreshKey` desde `AccountPage` al contenedor del sub-tab Plantilla (o a `CicloTab`), reutilizando el prop existente.
4. `AccountPage`: eliminar card de plantilla, su import y el estado/lógica `refreshKey`.
5. Botón "Categorías" de `CicloTab` setea `subTab = 'plantilla'`.
6. Deltas spec: `MODIFIED` en budget-template (ubicación) y `cycle-tab` (sub-tabs + navegación Categorías).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/components/CicloTab.tsx` | Modified | Sub-tabs, render condicional de `PresupuestoManager`, botón "Categorías" a estado local |
| `frontend/src/pages/AccountPage.tsx` | Modified | Quita card plantilla + estado/lógica `refreshKey` |
| `frontend/src/App.tsx` | Modified | Menor: `refreshKey` ya fluye a `CicloTab`; verificar coherencia |
| `frontend/src/components/PresupuestoManager.tsx` | Unchanged | Se reutiliza tal cual |
| `openspec/specs/budget-template/spec.md` | Modified | Delta: ubicación en tab Presupuesto |
| `openspec/specs/cycle-tab/spec.md` | Modified | Delta: sub-tabs + navegación Categorías |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Spec `budget-template` hoy exige Configuración/Cuenta; sin delta, archive falla | Med | Incluir delta spec MODIFIED en la misma change |
| Refresco por `visibilitychange` mal reubicado → datos obsoletos | Med | Mantener el mismo mecanismo `refreshKey`; test manual de navegación |
| Regresión de layout en móvil con sub-tabs anidados | Low | Reutilizar estilos del segmented control existente |

## Rollback Plan

`git revert` del commit de la change (o revert parcial): restaura la card en `AccountPage` y el botón "Categorías" navegando a `/account`. Revertir los deltas spec en el archive. `PresupuestoManager` nunca se modifica, sin riesgo de datos.

## Dependencies

- Ninguna externa. Interna: `refreshKey` desde `App` hacia `CicloTab` (ya cableado en App.tsx:187).

## Success Criteria

- [ ] Al tocar el tab "Presupuesto" se ven los sub-tabs `Ciclo actual | Plantilla`.
- [ ] `PresupuestoManager` renderiza en Plantilla con datos frescos (refresco por `visibilitychange` funciona).
- [ ] `/account` ya no muestra la plantilla; solo Cambiar Contraseña.
- [ ] Botón "Categorías" conmuta al sub-tab Plantilla sin cambiar de ruta.
- [ ] `npm run build` / typecheck pasan; cero cambios backend.
- [ ] Deltas de `budget-template` y `cycle-tab` se fusionan en archive.
