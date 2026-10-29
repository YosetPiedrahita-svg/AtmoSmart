# AtmoSmart — Frontend (mockup)

Prototipo navegable del sistema de monitoreo de atmósferas en minas subterráneas.
Está hecho con **HTML + CSS + JavaScript sin dependencias ni build**, así que funciona
abriendo los archivos directamente en el navegador, incluso sin Internet.

Mientras se define el backend, los datos vienen de una **API simulada**
(`assets/js/mock-api.js`) con la misma forma que tendrán las respuestas reales.

## Cómo verlo

Abra `frontend/index.html` en el navegador, o sírvalo localmente:

```bash
cd frontend && python3 -m http.server 8080
```

y entre a <http://localhost:8080>.

## Páginas

| Archivo | Contenido |
| --- | --- |
| `index.html` | Acceso con rol (operador, supervisor, HSE, administrador) |
| `dashboard.html` | Condición general, indicadores del turno, mapa, alertas activas y tarjetas por zona (se actualiza cada 5 s) |
| `zonas.html` | Mapa esquemático de la mina con circuito de ventilación y tabla de lecturas actuales |
| `zona.html?id=…` | Detalle de una zona: variables con límites y tendencia, gráfico con proyección a 30 min, alertas y equipos |
| `alertas.html` | Alertas por umbral, predictivas, sin señal y de calibración; protocolo de respuesta y reconocimiento con bitácora |
| `historial.html` | Consulta filtrable, resumen estadístico del periodo y exportación a CSV |
| `dispositivos.html` | Flujo de captura de datos, inventario de sensores (estado, batería, calibración) y registro manual de contingencia |
| `configuracion.html` | Límites de precaución y alarma por variable y preferencias de notificación |

## Estructura

```
frontend/
├── *.html                    páginas (cada una solo define su <main class="page">)
└── assets/
    ├── css/
    │   ├── app.css           entrada: importa los demás en orden
    │   ├── tokens.css        colores, tipografía, espaciado, tema claro/oscuro
    │   ├── base.css          reset, tipografía y utilidades (.stack, .grid-3, .muted…)
    │   ├── layout.css        shell (sidebar + topbar), página, acceso, responsive
    │   └── components.css    botones, badges, tarjetas, KPIs, tablas, formularios,
    │                         alertas, gráficos, mapa, modal, toasts…
    └── js/
        ├── config.js         variables, límites por defecto, zonas y protocolos
        ├── mock-api.js       API simulada (reemplazar por fetch al backend)
        ├── ui.js             íconos, shell, formato, sesión, tema, modales, toasts
        ├── charts.js         gráficos SVG y mapa de la mina
        ├── manual-entry.js   formulario de registro manual de contingencia
        └── pages/*.js        lógica de cada página
```

## Sistema de diseño

- **Tokens**: todo color, tamaño o radio se toma de `tokens.css`. Para cambiar la marca
  o el tema se editan solo esas variables.
- **Semáforo de riesgo**: `ok` (normal), `warn` (precaución), `crit` (alarma) y `off`
  (sin señal). Se usan como `data-status` en tarjetas, tablas, medidores y mapa, y como
  clases `.badge-ok`, `.badge-warn`, etc.
- **Tema claro/oscuro**: sigue al sistema operativo y se puede forzar con el botón de la
  barra superior.
- **Uso en campo**: los objetivos táctiles miden al menos 44 px (pensado para tablet y uso
  con guantes) y el diseño se adapta a móvil.

## Integración con el backend

`assets/js/api-http.js` expone la **misma interfaz** que `mock-api.js` (`AS.api`), pero resuelve
cada llamada contra el backend. Al cargar la página, intenta conectarse:

- **Si el backend responde:** usa sus datos y límites, y se refresca en vivo con los eventos SSE
  (`/api/stream`). La barra superior muestra "Backend · datos de sensores".
- **Si no responde:** sigue con `mock-api.js` y muestra "Modo demo · datos locales".

La forma más simple de usarlo es abrir <http://localhost:3000> con el backend encendido, porque
el backend sirve esta carpeta. También funciona abriendo los HTML directamente: en ese caso
busca el backend en `http://localhost:3000`.

| Parámetro de URL | Efecto (se recuerda en el navegador) |
| --- | --- |
| `?datos=backend` / `?datos=mock` / `?datos=auto` | Fuerza la fuente de datos |
| `?backend=http://IP:3000` | Usa un backend en otra dirección |

Con backend conectado, la página de **Límites** guarda los cambios en el servidor, con historial
de quién los cambió.

Los escenarios del modo demo sin backend son estos (con backend, los escenarios los controla el
`simulador/`):

- **Frente 2**: metano en ascenso sostenido, que dispara una alerta predictiva con el tiempo estimado hasta la alarma.
- **Frente 1**: temperatura en precaución.
- **Galería N1**: pico de CO y NO₂ después de una voladura hace unas 4,5 h (aparece en alertas resueltas).
- **Estación de bombeo**: detector sin comunicación.

> ⚠️ **Límites**: los valores de `config.js` son de referencia para el prototipo.
> El equipo de Ingeniería de Minas debe validarlos contra el Decreto 1886 de 2015
> y los valores límite permisibles vigentes.
