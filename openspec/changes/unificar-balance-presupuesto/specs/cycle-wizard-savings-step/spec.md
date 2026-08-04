# Especificación Paso Ahorro del Wizard (`cycle-wizard-savings-step`)

## Purpose

El paso Ahorro del wizard de ciclo sincroniza importe y porcentaje de ahorro de forma bidireccional y persiste el porcentaje como default del usuario.

## Requirements

### Requirement: Sincronización bidireccional importe ↔ porcentaje

El paso Ahorro MUST mostrar ambos campos (importe en $ y porcentaje %) editables. Al editar cualquiera, el otro MUST recalcularse. La regla MUST ser "último campo tocado manda": el campo editado es la fuente; el otro se deriva de él.

#### Scenario: Edito el importe

- GIVEN ingreso 100000, % actual 10
- WHEN el usuario escribe importe 15000
- THEN MUST mostrarse % = 15 y el importe sin reescribirse

#### Scenario: Edito el porcentaje

- GIVEN ingreso 100000, importe 15000
- WHEN el usuario escribe % 20
- THEN MUST mostrarse importe = 20000 y el % sin reescribirse

### Requirement: Redondeo definido

El porcentaje MUST redondearse a 1 decimal y el importe MUST redondearse a pesos. (Precisión del % decidida en design: 1 decimal recomendado.)

#### Scenario: Porcentaje con decimal

- GIVEN ingreso 100000 e importe 12500
- WHEN se deriva el %
- THEN MUST mostrarse 12.5%

#### Scenario: Importe redondeado

- GIVEN ingreso 100000 y % 12.5
- WHEN se deriva el importe
- THEN MUST mostrarse $12500 sin centavos

### Requirement: Ingreso cero

Cuando el ingreso de referencia sea 0, el paso MUST evitar división por cero: el % derivado MUST ser 0 y la edición de campos MUST NOT producir NaN ni errores.

#### Scenario: Ingreso 0

- GIVEN importeReferencia = 0
- WHEN se deriva el % desde un importe
- THEN MUST mostrarse % = 0 sin errores de cálculo

### Requirement: Persistencia del porcentaje default

Al confirmar el wizard, el % vigente MUST persistirse como `porcentaje_ahorro_default` vía `PATCH /auth/me/preferences` (endpoint existente, valida 0-100). (Decisión abierta: persistir solo al confirmar vs en cada cambio — recomendado: solo al confirmar.)

#### Scenario: Confirmación del wizard

- GIVEN el usuario completó el paso Ahorro con % 15
- WHEN confirma la creación del ciclo
- THEN MUST enviarse `PATCH /auth/me/preferences {porcentaje_ahorro_default: 15}`
- AND el próximo wizard MUST abrir con % 15 por defecto

#### Scenario: Error de persistencia

- GIVEN un fallo de red al persistir el %
- WHEN se confirma el wizard
- THEN el ciclo MUST crearse igual y el fallo MUST mostrarse sin bloquear el flujo

## Open Decisions (para design)

- Precisión del %: entero vs 1 decimal (recomendado: 1 decimal).
- Momento de persistencia: solo al confirmar el wizard (recomendado) vs cada cambio de campo.
