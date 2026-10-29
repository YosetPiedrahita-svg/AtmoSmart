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
    │   ├── chatbot.css       botón flotante y panel del asistente
    │   └── components.css    botones, badges, tarjetas, KPIs, tablas, formularios,
    │                         alertas, gráficos, mapa, modal, toasts…
    └── js/
        ├── config.js         variables, límites por defecto, zonas y protocolos
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
| **Alarma** | Sirena de dos tonos (988 / 784 Hz), onda cuadrada, rápida y fuerte (~2,5 s) | Larga e insistente (4 pulsos de 500 ms) | Sin parar hasta pulsar "Silenciar" en la tarjeta (la alarma sigue activa hasta reconocerla en Alertas) |
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

Cada método de `AS.api` indica en un comentario el endpoint sugerido
(por ejemplo, `GET /api/zonas/estado` o `POST /api/alertas/:id/reconocer`).
Para conectarlo basta con reemplazar el cuerpo de esas funciones por llamadas
`fetch` que devuelvan los mismos objetos.

Escenarios incluidos en la simulación para la demo:

- **Frente 2**: metano en ascenso sostenido, que dispara una alerta predictiva con el tiempo estimado hasta la alarma.
- **Frente 1**: temperatura en precaución.
- **Galería N1**: pico de CO y NO₂ después de una voladura hace unas 4,5 h (aparece en alertas resueltas).
- **Estación de bombeo**: detector sin comunicación.

> ⚠️ **Límites**: los valores de `config.js` son de referencia para el prototipo.
> El equipo de Ingeniería de Minas debe validarlos contra el Decreto 1886 de 2015
> y los valores límite permisibles vigentes.
