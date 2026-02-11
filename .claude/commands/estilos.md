# BlueGlass Design System

**Estilo base:** Dark Glassmorphism Premium

Aplica este sistema de diseno a todos los componentes que crees o modifiques en este proyecto.

---

## Paleta de Colores

| Rol | Valor (Tailwind) | Descripcion |
|------|------------------|--------------|
| **Fondo principal** | `bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900` | Fondo global oscuro con gradiente azul profundo |
| **Superficie (tarjetas, modales)** | `bg-slate-900/80 backdrop-blur-2xl` | Fondo translucido tipo vidrio con blur |
| **Texto primario** | `text-white` | Titulos y elementos destacados |
| **Texto secundario** | `text-slate-300` | Subtitulos o texto auxiliar |
| **Acento / primario** | `text-blue-400` / `from-blue-500 to-indigo-500` | Botones principales, links, resaltados |
| **Borde / separadores** | `border-slate-700/70` | Bordes y lineas sutiles |
| **Focus / activo** | `ring-blue-500` | Indicador de foco o estado activo |

---

## Tipografia

**Fuente recomendada:** `Inter`, `Manrope` o `Poppins`
**Caracteristicas:**
- `font-semibold` para botones y titulos
- `uppercase` para botones de accion
- `tracking-wide` (espaciado amplio entre letras)
- `font-medium` para texto general

### Ejemplos de estilos
| Estilo | Tamano | Peso | Ejemplo |
|---------|--------|------|----------|
| `Heading / H1` | 32px | Bold | "Bienvenido" |
| `Heading / H2` | 24px | Semibold | "Inicia sesion" |
| `Body / Regular` | 16px | Medium | "Introduce tus credenciales" |
| `Button / Label` | 14px | Semibold Uppercase | "Ingresar" |

---

## Componentes principales

### Boton primario
```
bg-gradient-to-r from-blue-500 to-indigo-500
text-white font-semibold
rounded-full
shadow-[0_0_25px_rgba(59,130,246,0.6)]
border border-blue-300/70
py-3 px-4
tracking-wide uppercase text-sm
hover:from-blue-400 hover:to-indigo-400
hover:brightness-110
active:scale-95
disabled:from-slate-700 disabled:to-slate-700
transition-all duration-200
```

### Boton secundario
```
border border-blue-400/70
bg-slate-800/40
text-blue-300
rounded-lg
py-2 px-4
hover:bg-slate-800/60
transition-all duration-200
```

### Boton peligro / destructivo
```
bg-gradient-to-r from-red-500 to-rose-500
text-white font-semibold
rounded-full
shadow-[0_0_20px_rgba(239,68,68,0.5)]
border border-red-300/70
py-2 px-4
hover:from-red-400 hover:to-rose-400
transition-all duration-200
```

### Input
```
w-full px-4 py-3
rounded-lg
bg-slate-800/60
border border-slate-600
text-white
placeholder:text-slate-400
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
transition-all
```

### Select
```
w-full px-4 py-3
rounded-lg
bg-slate-800/60
border border-slate-600
text-white
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
transition-all
```

### Label
```
block text-sm font-medium text-slate-100 mb-2
```

### Card / Contenedor
```
bg-slate-900/80
border border-slate-700/70
backdrop-blur-2xl
rounded-2xl
p-6
shadow-2xl
```

### Card secundaria (dentro de otra card)
```
bg-slate-800/50
border border-slate-700/50
backdrop-blur-xl
rounded-xl
p-4
```

### Logo / Icono circular
```
backdrop-blur-xl
border-2 border-blue-400/70
bg-slate-950/80
rounded-full
shadow-xl shadow-black/40
flex items-center justify-center
overflow-hidden
```

### Alerta de error
```
bg-red-500/10
border border-red-300/60
text-red-100
px-4 py-3
rounded-lg text-sm
```

### Alerta de exito
```
bg-green-500/10
border border-green-300/60
text-green-100
px-4 py-3
rounded-lg text-sm
```

### Alerta informativa
```
bg-blue-500/10
border border-blue-300/60
text-blue-100
px-4 py-3
rounded-lg text-sm
```

### Badge / Etiqueta
```
inline-flex items-center
px-2.5 py-0.5
rounded-full
text-xs font-medium
bg-blue-500/20
text-blue-300
border border-blue-400/30
```

---

## Efectos

| Efecto | Descripcion |
|---------|-------------|
| **Glassmorphism** | Fondo translucido con blur (`backdrop-blur-2xl`) |
| **Glow (Neon)** | Sombras azules suaves (`shadow-[0_0_25px_rgba(59,130,246,0.6)]`) |
| **Blur Layers** | Diferentes niveles: `backdrop-blur-sm`, `md`, `xl` segun profundidad |
| **Borders suaves** | `border-slate-700/70` con opacidad 0.7 |

---

## Estados

| Estado | Estilo |
|---------|--------|
| **Hover** | Incrementar brillo (`brightness-110`) o aclarar color |
| **Active / Pressed** | Escalar ligeramente (`scale-95`) |
| **Focus** | Anillo azul (`ring-2 ring-blue-500`) |
| **Disabled** | `opacity-40`, sin sombra ni glow |

---

## Layout y estructura

- Fondo con gradiente oscuro diagonal aplicado a `min-h-screen`
- Tarjetas centradas verticalmente cuando es apropiado
- Contenido en columnas con espaciado uniforme (`gap-4`, `gap-6`)
- Botones y inputs con bordes redondeados (`rounded-full` para botones primarios, `rounded-lg` para inputs)
- Consistencia entre sombras y profundidad visual
- Espaciado: `space-y-6` para formularios, `mb-8` entre secciones

---

## Tabla / Lista de datos

### Encabezado de tabla
```
bg-slate-800/60
text-slate-300 text-sm font-semibold uppercase tracking-wider
px-4 py-3
border-b border-slate-700/70
```

### Fila de tabla
```
border-b border-slate-800/50
hover:bg-slate-800/30
transition-colors
text-slate-100
px-4 py-3
```

### Fila de total / resumen
```
bg-slate-800/40
border-t-2 border-slate-600
text-white font-semibold
px-4 py-3
```

---

## Navegacion / Header

```
bg-slate-900/90
backdrop-blur-xl
border-b border-slate-700/70
shadow-lg
px-6 py-4
```

### Link de navegacion activo
```
text-blue-400 font-semibold
border-b-2 border-blue-400
```

### Link de navegacion inactivo
```
text-slate-300
hover:text-white
transition-colors
```

---

## Jerarquia y uso de botones

| Tipo | Cuando usar | Ejemplos |
|------|-------------|----------|
| **Primario** | Accion principal de la pantalla. Solo uno por seccion visible. | "Registrar Gasto", "Iniciar Sesion", "Guardar" |
| **Secundario** | Acciones complementarias o de navegacion. No compiten con la accion principal. | "Gestionar Categorias", "Cambiar contrasena", "Cancelar", "Volver" |
| **Peligro** | Acciones destructivas o irreversibles que requieren atencion. | "Eliminar", "Cerrar Sesion" |
| **Accion de tabla** | Acciones contextuales dentro de filas de tabla. Tamano reducido. | "Editar" (fila), "Eliminar" (fila) |

**Reglas:**
- Evitar que dos botones primarios coexistan en la misma zona visual; genera confusion sobre cual es la accion principal.
- El boton primario debe corresponder a la tarea principal del usuario en ese contexto.
- Usar secundario para todo lo que sea accesorio, de navegacion o de gestion.
- Usar peligro solo para acciones con consecuencias significativas.
- Las acciones de tabla son compactas y no compiten visualmente con los botones principales de la pagina.

### Accion de tabla - Editar
```
bg-blue-500/20 hover:bg-blue-500/30
text-blue-300 border border-blue-400/30
px-3 py-1 rounded text-xs font-medium
transition-all
```

### Accion de tabla - Eliminar
```
bg-red-500/20 hover:bg-red-500/30
text-red-300 border border-red-400/30
px-3 py-1 rounded text-xs font-medium
transition-all
```

---

## Jerarquia y uso de links de texto

| Tipo | Cuando usar | Estilo |
|------|-------------|--------|
| **Link principal** | Navegacion entre paginas de auth. Invita a una accion alternativa. | `font-semibold text-white hover:text-slate-100 underline-offset-4 hover:underline` |
| **Link secundario** | Acciones auxiliares o contextuales dentro de una card. | `text-blue-300 hover:text-blue-200 font-medium transition-colors` |
| **Link sutil** | Acciones muy secundarias, como "¿Olvidaste tu contrasena?". | `text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors` |

**Reglas:**
- Nunca usar `text-blue-600` ni colores del tema light. Todos los links deben ser `text-white`, `text-blue-300` o `text-blue-200`.
- Los links de navegacion entre paginas de auth van debajo de la card, centrados.
- "Volver a..." se usa como link secundario o boton secundario segun el contexto.

---

## Jerarquia y uso de alertas

| Tipo | Cuando usar | Color base |
|------|-------------|------------|
| **Error** | Validaciones fallidas, errores de API, acciones rechazadas. | `bg-red-500/10 border-red-300/60 text-red-100` |
| **Exito** | Confirmacion de acciones completadas (guardar, actualizar, crear). | `bg-green-500/10 border-green-300/60 text-green-100` |
| **Informativa** | Datos contextuales, resumenes, estadisticas. | `bg-blue-500/10 border-blue-300/60 text-blue-100` |
| **Advertencia / Dev** | Avisos, datos de desarrollo, tokens temporales. | `bg-amber-500/10 border-amber-300/60 text-amber-100` |

**Reglas:**
- Usar siempre `green` para exito (no `emerald`). Mantener consistencia en toda la app.
- Las alertas van dentro de la card, antes del formulario o contenido principal.
- Una sola alerta visible a la vez por seccion (error reemplaza exito y viceversa).

---

## Jerarquia y uso de badges

| Tipo | Significado | Color |
|------|-------------|-------|
| **Neutro / Categoria** | Etiquetas de clasificacion general. | `bg-blue-500/20 text-blue-300 border-blue-400/30` |
| **Predeterminado** | Elemento del sistema, no editable por el usuario. | `bg-purple-500/20 text-purple-300 border-purple-400/30` |
| **Personalizado** | Elemento creado por el usuario. | `bg-green-500/20 text-green-300 border-green-400/30` |

**Reglas:**
- Los badges siempre usan `rounded-full`, `text-xs font-medium` y borde translucido.
- No usar badges como botones. Son informativos, no interactivos.

---

## Jerarquia tipografica

| Nivel | Uso | Estilo |
|-------|-----|--------|
| **H1 - Titulo de pagina** | Titulo principal, uno por pantalla. | `text-3xl font-semibold text-white tracking-wide` (auth) / `text-4xl font-bold text-white` (dashboard) |
| **H2 - Titulo de seccion** | Encabezado de card o seccion. | `text-2xl font-bold text-white` |
| **H3 - Subtitulo** | Subsecciones dentro de una card. | `text-lg font-semibold text-slate-300` |
| **Body** | Texto general, celdas de tabla, contenido. | `text-sm text-slate-100` o `text-slate-300` |
| **Muted** | Texto auxiliar, placeholders, empty states. | `text-slate-400` |
| **Descripcion** | Texto debajo de titulos. | `text-slate-300 text-sm` |

---

## Estados vacios y de carga

### Estado vacio
```
text-center py-8
text-slate-400 text-lg    (mensaje principal)
text-slate-400 text-sm    (mensaje secundario / hint)
```
Usar un mensaje principal descriptivo y opcionalmente un hint que guie al usuario.

### Estado de carga (inline)
```
text-center text-slate-300
```
Para contenido que carga dentro de una card existente.

### Estado de carga (pantalla completa)
```
min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900
flex items-center justify-center
```
Spinner: `animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400`
Texto: `mt-4 text-slate-300`

---

## Filosofia del diseno

> "Oscuridad elegante, acentos azules y sensacion de profundidad translucida."

Este Design System busca transmitir **sofisticacion tecnologica**, con **claridad visual**, **profundidad tridimensional** y **brillos sutiles** que evoquen una experiencia premium.

---

## Prompt de referencia para IA

> "Usar el estilo visual BlueGlass Design System:
> fondo oscuro con gradiente azul (`from-slate-950 via-slate-900 to-blue-900`),
> superficies translucidas con glassmorphism (`bg-slate-900/80 backdrop-blur-2xl`),
> tipografia semibold y uppercase,
> botones con gradiente azul y glow neon,
> inputs oscuros semitransparentes con focus ring azul.
> Estetica tecnologica, premium y moderna."
