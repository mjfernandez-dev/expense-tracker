# Especificación Plantilla de Presupuesto (`budget-template`)

## Purpose

La plantilla de presupuesto (PresupuestoManager) vive en el sub-tab Plantilla del tab Presupuesto y define los defaults que el wizard y el ciclo consumen.

## Requirements

### Requirement: Plantilla en Configuración/Cuenta

La plantilla MUST renderizarse en el tab Presupuesto como sub-tab `Plantilla` y MUST estar ausente de Configuración/Cuenta (AccountPage).
(Previously: la plantilla vivía en Configuración/Cuenta y debía estar ausente del tab Ciclo.)

#### Scenario: Acceso desde el tab Presupuesto

- GIVEN un usuario en el tab Presupuesto
- WHEN selecciona el sub-tab Plantilla
- THEN MUST poder editar categorías, % de ahorro default y gastos fijos
- AND la plantilla MUST NO aparecer en Configuración/Cuenta

#### Scenario: Ausencia en Cuenta

- GIVEN un usuario en Configuración/Cuenta
- WHEN se renderiza la página
- THEN MUST NO mostrarse la card de plantilla ni su estado/lógica de refresco

### Requirement: Contenido de la plantilla

La plantilla MUST conservar: categorías con `monto_default` y toggle `tiene_monto_fijo`, `% ahorro objetivo default`, y gastos fijos recurrentes. El % default MUST persistirse vía `PATCH /auth/me/preferences` (comportamiento actual).

#### Scenario: Guardar default

- GIVEN un % modificado en la plantilla
- WHEN se guarda
- THEN MUST persistirse como `porcentaje_ahorro_default`
- AND los nuevos ciclos MUST pre-cargarlo

### Requirement: Refresco de la plantilla

La plantilla MUST recibir y respetar el mecanismo de refresco (refreshKey) de la app. El listener `visibilitychange` que incrementa `refreshKey` MUST residir en el contenedor del sub-tab Plantilla (CicloTab), reutilizando el prop `refreshKey` que App ya inyecta en CicloTab; al volver a la pestaña o tras cambios de datos MUST mostrarse datos actualizados sin cache obsoleto.
(Previously: el listener vivía en AccountPage y PresupuestoManager lo recibía desde allí.)

#### Scenario: Regreso al sub-tab Plantilla

- GIVEN la plantilla con datos modificados en otro flujo
- WHEN se regresa al sub-tab Plantilla del tab Presupuesto
- THEN MUST mostrarse el estado actualizado vía refreshKey

#### Scenario: Visibilidad de la pestaña

- GIVEN la app en segundo plano con la plantilla abierta
- WHEN el documento vuelve a ser visible
- THEN MUST incrementarse refreshKey y refrescarse la plantilla
