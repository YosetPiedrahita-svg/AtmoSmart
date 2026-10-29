/* ==========================================================================
   AtmoSmart — Configuración de dominio
   Variables monitoreadas, zonas de la mina y protocolos de respuesta.

   Los límites normativos y su evaluación están en normativa.js; los criterios
   internos (umbral amarillo, jornada, redondeo) se ajustan en "Límites y
   configuración" y se guardan en este navegador (localStorage).
   ========================================================================== */

window.AS = window.AS || {};

/**
 * Dirección del backend (el que guarda todo en Supabase).
 * Vacío = el mismo dominio que sirve esta página (cuando el backend sirve el frontend).
 * Si el frontend está en otro dominio (p. ej. Vercel), escriba aquí la URL pública del
 * backend, sin "/" final: "https://atmosmart-backend.onrender.com".
 */
AS.BACKEND_URL = "";

/**
 * Variables monitoreadas.
 *
 * Los umbrales NO se leen de aquí directamente: AS.getThresholds(key, zoneId)
 * (en normativa.js) los calcula a partir de los Parámetros normativos 1 y 2
 * (Decreto 1886 de 2015, modificado por el Decreto 944 de 2022), del tipo de
 * labor de la zona y de los criterios internos configurables.
 *
 *   lowCrit  >= valor  -> alarma por defecto (ej. O₂ bajo)
 *   lowWarn  >= valor  -> precaución por defecto
 *   highWarn <= valor  -> precaución por exceso
 *   highCrit <= valor  -> alarma por exceso
 *
 * `role`:
 *   "gas"     se evalúa en lectura instantánea y además como exposición (Art. 39)
 *   "input"   dato de entrada para calcular otra variable; no tiene semáforo propio
 *   "derived" se calcula a partir de otras variables (temperatura efectiva, Art. 217)
 *
 * `thresholds` solo se usa para variables que los Parámetros 1 y 2 no cubren
 * (polvo de carbón): es un criterio interno, por confirmar con Minas.
 */
AS.VARIABLES = [
  { key: "o2",   label: "Oxígeno",              short: "O₂",   unit: "%",   decimals: 1, scale: [17, 24] },
  { key: "ch4",  label: "Metano",               short: "CH₄",  unit: "%",   decimals: 2, scale: [0, 2] },
  { key: "co",   label: "Monóxido de carbono",  short: "CO",   unit: "ppm", decimals: 0, scale: [0, 60],   role: "gas" },
  { key: "co2",  label: "Dióxido de carbono",   short: "CO₂",  unit: "%",   decimals: 2, scale: [0, 1],    role: "gas" },
  { key: "h2s",  label: "Ácido sulfhídrico",    short: "H₂S",  unit: "ppm", decimals: 1, scale: [0, 6],    role: "gas" },
  { key: "no",   label: "Óxido nítrico",        short: "NO",   unit: "ppm", decimals: 1, scale: [0, 30],   role: "gas" },
  { key: "no2",  label: "Dióxido de nitrógeno", short: "NO₂",  unit: "ppm", decimals: 2, scale: [0, 1.2],  role: "gas" },
  { key: "so2",  label: "Dióxido de azufre",    short: "SO₂",  unit: "ppm", decimals: 2, scale: [0, 0.3],  role: "gas" },
  { key: "te",   label: "Temperatura efectiva", short: "Te",   unit: "°C",  decimals: 1, scale: [15, 34],  role: "derived" },
  { key: "temp", label: "Temperatura seca",     short: "Ts",   unit: "°C",  decimals: 1, scale: [10, 40],  role: "input" },
  { key: "tw",   label: "Temperatura húmeda",   short: "Th",   unit: "°C",  decimals: 1, scale: [10, 40],  role: "input" },
  { key: "hr",   label: "Humedad relativa",     short: "HR",   unit: "%",   decimals: 0, scale: [0, 100],  role: "input" },
  { key: "air",  label: "Velocidad del aire",   short: "V",    unit: "m/s", decimals: 2, scale: [0, 3] },
  // Polvo de carbón, fracción respirable. No está en los Parámetros 1 y 2: el umbral
  // es un criterio interno del prototipo, por confirmar con Ingeniería de Minas.
  { key: "pm",   label: "Polvo de carbón (respirable)", short: "Polvo", unit: "mg/m³", decimals: 2, scale: [0, 2], thresholds: { highWarn: 0.5, highCrit: 0.9 }, internal: true },
];

/** Variables que se muestran en tarjetas compactas (las más críticas) */
AS.KEY_VARIABLES = ["o2", "ch4", "co", "te"];

/** Zonas monitoreadas (cada una con sus sensores). La geometría está en AS.MINE_LAYOUT. */
/*
 * `labor`: sitio de la labor según el Art. 53 (define el límite de metano). Ver AS.LABORES.
 * `vent`:  tipo de vía según el Art. 56 (define la velocidad mínima y máxima del aire). Ver AS.VENTILACION.
 * La clasificación de cada zona es una PROPUESTA del equipo para la mina simulada:
 * debe validarla Ingeniería de Minas con el plano de ventilación real.
 */
AS.ZONES = [
  { id: "bocamina",   name: "Bocamina",               level: "Superficie", type: "Acceso / entrada de aire",                         labor: "via_general",       vent: "via_explotacion" },
  { id: "galeria-1",  name: "Galería principal N1",   level: "Nivel 1",    type: "Transporte",                                       labor: "via_general",       vent: "via_explotacion" },
  { id: "frente-1",   name: "Frente de explotación 1", level: "Nivel 1",   type: "Frente activo (labor ciega)",                      labor: "frente",            vent: "aux_carbon" },
  { id: "inclinado",  name: "Inclinado / tambor",     level: "N1 → N2",    type: "Comunicación entre niveles",                       labor: "via_general",       vent: "via_explotacion" },
  { id: "galeria-2",  name: "Galería N2",             level: "Nivel 2",    type: "Transporte",                                       labor: "via_general",       vent: "via_explotacion" },
  { id: "frente-2",   name: "Frente de explotación 2", level: "Nivel 2",   type: "Frente activo (labor ciega)",                      labor: "frente",            vent: "aux_carbon" },
  { id: "bombeo",     name: "Estación de bombeo",     level: "Nivel 2",    type: "Servicios",                                        labor: "via_general",       vent: "aux_roca" },
  { id: "retorno",    name: "Chimenea de retorno",    level: "N2 → Sup.",  type: "Salida de aire viciado / ventilador principal",    labor: "retorno_principal", vent: "pozo_ventilacion" },
];

/**
 * Plano esquemático de la mina (corte vertical, viewBox 800x440).
 * En producción NO es fijo: lo entrega el backend (GET /api/mina/plano) a partir
 * del plano de labores y ventilación que mantiene topografía, y se versiona cada
 * vez que avanza un frente, se abre una labor o se cierra/sella una zona.
 *
 * nodes:    puntos del plano. `zoneId` enlaza con una zona monitoreada; los nodos
 *           sin zona son cruces o puntos sin sensor. `label`: above | below | right.
 * segments: labores entre nodos.
 *   kind = intake    vía de aire fresco (entrada)
 *          return    vía de aire viciado (salida hacia el ventilador principal)
 *          heading   labor ciega (frente) ventilada con ventilador auxiliar y manga;
 *                    el aire entra y sale por la misma labor, nunca la atraviesa
 *          service   labor sin circulación principal (bombeo, depósitos)
 * fans:     ventiladores (principal en superficie, auxiliares en la entrada de los frentes).
 */
AS.MINE_LAYOUT = {
  version: 3,
  updatedAt: "2026-10-27",
  source: "Plano de ventilación — Topografía",
  levels: [
    { name: "Superficie", y: 30 },
    { name: "Nivel 1", y: 160 },
    { name: "Nivel 2", y: 340 },
  ],
  nodes: [
    { id: "n-bocamina",  zoneId: "bocamina",  x: 90,  y: 70,  label: "below" },
    { id: "n-g1",        zoneId: "galeria-1", x: 250, y: 150, label: "above" },
    { id: "n-f1",        zoneId: "frente-1",  x: 470, y: 150, label: "above" },
    { id: "n-incl",      zoneId: "inclinado", x: 330, y: 245, label: "right" },
    { id: "n-g2",        zoneId: "galeria-2", x: 420, y: 330, label: "above" },
    { id: "n-f2",        zoneId: "frente-2",  x: 560, y: 400, label: "right" },
    { id: "n-bombeo",    zoneId: "bombeo",    x: 220, y: 350, label: "above" },
    { id: "n-ret-n2",    name: "Galería de retorno N2", x: 720, y: 330, label: "above" },
    { id: "n-chimenea",  zoneId: "retorno",   x: 720, y: 70,  label: "below" },
  ],
  segments: [
    { from: "n-bocamina", to: "n-g1",       kind: "intake" },
    { from: "n-g1",       to: "n-incl",     kind: "intake" },
    { from: "n-incl",     to: "n-g2",       kind: "intake" },
    { from: "n-g1",       to: "n-f1",       kind: "heading" },
    { from: "n-g2",       to: "n-f2",       kind: "heading" },
    { from: "n-g2",       to: "n-bombeo",   kind: "service" },
    { from: "n-g2",       to: "n-ret-n2",   kind: "return" },
    { from: "n-ret-n2",   to: "n-chimenea", kind: "return" },
  ],
  fans: [
    { id: "VP-01", kind: "main", node: "n-chimenea", label: "Ventilador principal (extractor)" },
    { id: "VA-01", kind: "auxiliary", segment: ["n-g1", "n-f1"] },
    { id: "VA-02", kind: "auxiliary", segment: ["n-g2", "n-f2"] },
  ],
};

AS.STATUS = {
  ok:   { label: "Normal",      badge: "badge-ok" },
  warn: { label: "Precaución",  badge: "badge-warn" },
  crit: { label: "Alarma",      badge: "badge-crit" },
  off:  { label: "Sin señal",   badge: "badge-off" },
};

AS.STATUS_RANK = { ok: 0, off: 1, warn: 2, crit: 3 };

/** Protocolos de respuesta sugeridos por tipo de evento (a validar con Minas / HSE). */
AS.PROTOCOLS = {
  ch4: [
    "Al alcanzar el límite del Art. 53 para el sitio: suspender labores y evacuar inmediatamente la zona.",
    "Desenergizar y retirar fuentes de ignición (equipos eléctricos, corte, soldadura).",
    "Verificar el ventilador auxiliar y el estado de la manga de ventilación.",
    "Confirmar la lectura con un detector portátil calibrado.",
    "No ingresar ni permanecer hasta diluir el metano por debajo del límite (Art. 53, par. 1). Por encima de 2 % solo ingresa personal de salvamento.",
    "Registrar la causa y las acciones tomadas antes de reanudar labores.",
  ],
  co: [
    "Retirar al personal de la zona hacia aire fresco.",
    "Verificar si hubo voladura reciente y respetar el tiempo de reingreso.",
    "Aumentar ventilación / revisar recirculación.",
    "Confirmar con detector portátil antes de permitir reingreso.",
  ],
  o2: [
    "Retirar al personal de la zona de inmediato.",
    "Revisar circuito de ventilación y posibles obstrucciones.",
    "No reingresar sin autoconservador y medición confirmada ≥ límite.",
  ],
  te: [
    "Calcular la temperatura efectiva con temperatura húmeda, seca y velocidad del aire (Art. 217).",
    "Limitar el tiempo de permanencia del personal según la tabla del Art. 217 (29 °C: 6 h · 30 °C: 4 h · 31 °C: 2 h).",
    "Por encima de 31 °C retirar al personal: solo pueden ingresar cuadrillas de salvamento (Art. 218).",
    "Aumentar el caudal de aire en la labor y revisar el circuito de ventilación.",
    "Aplicar pausas de hidratación y vigilar síntomas de estrés térmico.",
  ],
  exposicion: [
    "Retirar al personal expuesto hacia aire fresco.",
    "Registrar el tiempo de exposición de cada trabajador en la zona durante la jornada.",
    "Aumentar la ventilación y buscar la fuente del gas (voladura, motor diésel, incendio).",
    "Confirmar con detector portátil antes de permitir el reingreso.",
  ],
  air: [
    "Revisar ventilador principal / auxiliar y puertas de ventilación.",
    "Verificar que la manga no esté rota o desconectada.",
    "Suspender labores si no se restablece el caudal mínimo.",
  ],
  pm: [
    "Verificar el riego / humectación del frente y de las vías de acarreo.",
    "Confirmar que el personal use protección respiratoria adecuada.",
    "Revisar caudal de ventilación en el frente para diluir el polvo.",
    "Si persiste, suspender la actividad que genera polvo (corte, cargue) hasta controlarlo.",
  ],
  sensor: [
    "Enviar técnico a revisar el equipo y su conexión con el gateway.",
    "Mientras tanto, realizar mediciones con detector portátil y registrarlas como contingencia.",
    "Verificar fecha de calibración y prueba de respuesta (bump test).",
  ],
  default: [
    "Confirmar la lectura con un detector portátil.",
    "Informar al supervisor de turno.",
    "Registrar acciones tomadas.",
  ],
};

/* ---------- Almacenamiento local (localStorage) ---------- */

AS.storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("atmosmart:" + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("atmosmart:" + key, JSON.stringify(value));
    } catch (e) {
      /* almacenamiento no disponible: se ignora */
    }
  },
  remove(key) {
    try { localStorage.removeItem("atmosmart:" + key); } catch (e) { /* noop */ }
  },
};

AS.getVariable = (key) => AS.VARIABLES.find((v) => v.key === key);
AS.getZone = (id) => AS.ZONES.find((z) => z.id === id);
