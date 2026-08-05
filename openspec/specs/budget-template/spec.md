# Especificación Plantilla de Presupuesto (`budget-template`)

## Purpose

La plantilla de presupuesto (PresupuestoManager) pasa a ser configuración de la cuenta: vive en Configuración/Cuenta, no en el tab Ciclo, y define los defaults que el wizard y el ciclo consumen.

## Requirements

### Requirement: Plantilla en Configuración/Cuenta

La plantilla MUST renderizarse desde Configuración/Cuenta (AccountPage) y MUST estar ausente del tab Ciclo.

#### Scenario: Acceso desde Cuenta

- GIVEN un usuario en Configuración/Cuenta
- WHEN navega a la sección de plantilla
- THEN MUST poder editar categorías, % de ahorro default y gastos fijos
- AND la plantilla MUST NO aparecer en el tab Ciclo

### Requirement: Contenido de la plantilla

La plantilla MUST conservar: categorías con `monto_default` y toggle `tiene_monto_fijo`, `% ahorro objetivo default`, y gastos fijos recurrentes. El % default MUST persistirse vía `PATCH /auth/me/preferences` (comportamiento actual).

#### Scenario: Guardar default

- GIVEN un % modificado en la plantilla
- WHEN se guarda
- THEN MUST persistirse como `porcentaje_ahorro_default`
- AND los nuevos ciclos MUST pre-cargarlo

### Requirement: Refresco de la plantilla

La plantilla MUST recibir y respetar el mecanismo de refresco (refreshKey) de la app: al navegar de vuelta o tras cambios de datos, MUST mostrar datos actualizados sin cache obsoleto. (Previously: PresupuestoManager no recibía refreshKey → datos viejos tras cambios.)

#### Scenario: Navegación y refresco

- GIVEN la plantilla con datos modificados en otro flujo
- WHEN se regresa a Configuración/Cuenta
- THEN MUST mostrarse el estado actualizado vía refreshKey

## Open Decisions (para design)

- Ubicación exacta dentro de Cuenta: card propia vs ruta `/account/presupuesto-template` (depende de la navegación existente).
