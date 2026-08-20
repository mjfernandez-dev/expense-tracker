# Delta para cycle-tab

## ADDED Requirements

### Requirement: Sub-tabs del tab Ciclo

El tab Presupuesto MUST mostrar los sub-tabs `Ciclo actual | Plantilla` con estado local y SIN ruta nueva; el sub-tab por defecto MUST ser `Ciclo actual`.

#### Scenario: Render inicial

- GIVEN un usuario en el tab Presupuesto
- WHEN se renderiza el tab
- THEN MUST verse el selector con las opciones "Ciclo actual" y "Plantilla"
- AND "Ciclo actual" MUST estar activo por defecto

#### Scenario: Conmutación sin navegación

- GIVEN un usuario en el sub-tab Ciclo actual
- WHEN selecciona el sub-tab Plantilla
- THEN MUST renderizarse la plantilla
- AND la URL MUST permanecer sin cambios

### Requirement: Render de PresupuestoManager en Plantilla

El sub-tab Plantilla MUST renderizar `PresupuestoManager` con el `refreshKey` que CicloTab ya recibe desde App y con copy diferenciado ("Defaults que el asistente y el ciclo consumen"). PresupuestoManager MUST reutilizarse sin cambios internos.

#### Scenario: Edición de defaults

- GIVEN el sub-tab Plantilla activo
- WHEN se renderiza el editor
- THEN MUST poder editar categorías, % de ahorro default y gastos fijos
- AND MUST NO alterarse el comportamiento interno del editor

#### Scenario: Accesible sin ciclo activo

- GIVEN un usuario sin ciclos creados
- WHEN navega al tab Presupuesto
- THEN MUST poder seleccionar el sub-tab Plantilla
- AND MUST NO quedar bloqueado por la ausencia de ciclos

### Requirement: Botón "Categorías" conmuta al sub-tab Plantilla

El botón "Categorías" del encabezado del tab Ciclo MUST conmutar al sub-tab Plantilla vía estado local y MUST NO navegar a /account.

#### Scenario: Conmutación por Categorías

- GIVEN un usuario en el sub-tab Ciclo actual
- WHEN presiona "Categorías"
- THEN MUST activarse el sub-tab Plantilla
- AND la ruta MUST permanecer en el tab Presupuesto

#### Scenario: Ya en Plantilla

- GIVEN un usuario en el sub-tab Plantilla
- WHEN presiona "Categorías"
- THEN MUST permanecer en el sub-tab Plantilla sin navegar
