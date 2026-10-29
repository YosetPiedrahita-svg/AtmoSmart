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
| `configuracion.html` | Límites normativos (con artículo), límites por zona, criterios internos de precaución y preferencias de notificación |

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
    │   ├── chatbot.css       botón flotante y panel del asistente
    │   └── components.css    botones, badges, tarjetas, KPIs, tablas, formularios,
    │                         alertas, gráficos, mapa, modal, toasts…
    └── js/
        ├── config.js         variables, zonas (tipo de labor y de vía) y protocolos
        ├── normativa.js      motor normativo del semáforo (Parámetros 1 y 2)
        ├── mock-api.js       API simulada (reemplazar por fetch al backend)
        ├── ui.js             íconos, shell, formato, sesión, tema, modales, toasts
        ├── charts.js         gráficos SVG y mapa de la mina
        ├── chatbot.js        asistente conversacional (botón flotante, por reglas)
        ├── alarm.js          sonido y vibración de alertas (alarma y precaución)
        ├── manual-entry.js   formulario de registro manual de contingencia
        └── pages/*.js        lógica de cada página
```

## Asistente conversacional

Todas las páginas con menú lateral muestran un **botón flotante** (abajo a la derecha) que abre un chat.
El asistente responde en español usando los mismos datos que las pantallas (`AS.api`: zonas, alertas,
sensores y turno), sin Internet y sin IA: interpreta palabras clave. Es **solo lectura**; no reconoce
alertas ni cambia ningún dato.

Preguntas que entiende:

| Tema | Ejemplos |
| --- | --- |
| Estado general | "¿Cómo está la mina?" |
| Alertas | "¿Qué alertas hay?", "alertas del Frente 2" |
| Una zona | "¿Cómo está el Frente 2?", "bombeo" |
| Una variable | "¿Dónde está más alto el CO?", "polvo", "¿y el metano ahí?" |
| Tendencias | "¿Hay tendencias peligrosas?" |
| Personal | "¿Dónde hay personas en riesgo?" |
| Equipos | "¿Qué sensores fallan?" (estado, batería, calibración) |
| Límites | "¿Cuál es el límite de metano?" |
| Protocolo | "¿Qué hago ahora?" (protocolo de la alerta más urgente) |
| Historial | "¿Qué pasó con la voladura?" |

- Se activa desde `AS.mountShell` (en `ui.js`) y se carga con `<script src="assets/js/chatbot.js">`
  después de `ui.js`. No aparece en `index.html` (acceso).
- La conversación se conserva al cambiar de página durante la sesión (`sessionStorage`).
- `AS.chatbot.reply(texto, datos)` concentra la lógica; para conectar un modelo de lenguaje
  basta con reemplazar esa función por una llamada al backend.

## Sonido y vibración de alertas

`alarm.js` vigila las alertas cada 5 s en todas las páginas con menú lateral y avisa solo en dos niveles,
cada uno con su propio carácter (se prueban en **Límites y configuración → Probar avisos**):

| Nivel | Sonido | Vibración | Repetición |
| --- | --- | --- | --- |
| **Alarma** | Sirena de emergencia con barrido (560–1250 Hz), timbre saturado y volumen alto | Larga e insistente (5 pulsos de 600 ms) | Sin parar hasta pulsar "Silenciar" en la tarjeta (la alarma sigue activa hasta reconocerla en Alertas) |
| **Precaución** (incluye predictivas) | Dos tonos suaves (660 Hz), onda triangular, volumen bajo | Corta (doble pulso de 160 ms) | Una sola vez al aparecer o al escalar a alarma |
| Sin señal y mantenimiento | No suenan | No vibran | — |

- Preferencias (guardadas en el navegador): sonido, vibración y "avisar también las alertas de precaución" (activas por defecto).
- Al abrir la sesión se avisa también de lo que ya existía (alarmas y precauciones sin reconocer).
- El navegador exige un gesto del usuario para reproducir audio: el primer clic o toque en la página lo activa.
- La vibración solo existe en móviles/tablets Android; en computador o iPhone el aviso es sonoro y visual (toast).

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
| `?datos=mock` / `?datos=backend` | Los datos vienen siempre del backend (Supabase). `mock` solo sirve para desarrollar sin servidor |
| `?backend=http://IP:3000` | Usa un backend en otra dirección |

Con backend conectado, la página de **Límites** guarda los cambios en el servidor, con historial
de quién los cambió.

Los escenarios del modo demo sin backend son estos (con backend, los escenarios los controla el
`simulador/`):

- **Frente 2**: metano en ascenso sostenido, que dispara una alerta predictiva con el tiempo estimado hasta la alarma.
- **Frente 1**: temperatura efectiva sobre 28 °C, con tiempo de permanencia limitado (Art. 217).
- **Galería N1**: pico de CO y NO₂ después de una voladura hace unas 4,5 h; la lectura ya bajó, pero el promedio de la jornada de NO₂ supera el TLV-TWA (Art. 39).
- **Inclinado**: detector multigas con calibración vencida; sus gases se muestran como "no disponible".
- **Estación de bombeo**: detector sin comunicación.

> ⚠️ **Límites**: la evaluación del semáforo está en `normativa.js` y sigue los Parámetros normativos 1 y 2
> (Decreto 1886 de 2015, modificado por el Decreto 944 de 2022). Los umbrales de precaución son criterios
> internos configurables, no límites legales. Detalle y decisiones pendientes de validar con Ingeniería de
> Minas en [`docs/parametros-normativos.md`](../docs/parametros-normativos.md).
