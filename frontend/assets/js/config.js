/* ==========================================================================
   AtmoSmart — Configuración de dominio
   Variables monitoreadas, límites por defecto y zonas de la mina.

   IMPORTANTE: los límites son VALORES DE REFERENCIA para el prototipo.
   Deben validarse con el equipo de Ingeniería de Minas contra la normativa
   aplicable (en Colombia: Decreto 1886 de 2015 — Reglamento de Seguridad en
   las Labores Mineras Subterráneas) y los TLV vigentes.
   El usuario puede ajustarlos en "Límites y configuración" (localStorage).
   ========================================================================== */

window.AS = window.AS || {};

/**
 * Cada umbral es opcional:
 *   lowCrit  <= valor  -> alarma por defecto (ej. O2 bajo)
 *   lowWarn  <= valor  -> precaución por defecto
 *   highWarn >= valor  -> precaución por exceso
 *   highCrit >= valor  -> alarma por exceso
 */
AS.VARIABLES = [
  { key: "o2",   label: "Oxígeno",            short: "O₂",   unit: "%",   decimals: 1, scale: [17, 24],  thresholds: { lowCrit: 19.5, lowWarn: 20.0, highWarn: 22.5, highCrit: 23.5 } },
  { key: "ch4",  label: "Metano",             short: "CH₄",  unit: "%",   decimals: 2, scale: [0, 2],    thresholds: { highWarn: 0.5, highCrit: 1.0 } },
  { key: "co",   label: "Monóxido de carbono", short: "CO",  unit: "ppm", decimals: 0, scale: [0, 100],  thresholds: { highWarn: 25, highCrit: 50 } },
  { key: "co2",  label: "Dióxido de carbono", short: "CO₂",  unit: "%",   decimals: 2, scale: [0, 1.5],  thresholds: { highWarn: 0.5, highCrit: 1.0 } },
  { key: "h2s",  label: "Sulfuro de hidrógeno", short: "H₂S", unit: "ppm", decimals: 1, scale: [0, 15],  thresholds: { highWarn: 1, highCrit: 10 } },
  { key: "no2",  label: "Dióxido de nitrógeno", short: "NO₂", unit: "ppm", decimals: 1, scale: [0, 5],   thresholds: { highWarn: 0.2, highCrit: 3 } },
  { key: "temp", label: "Temperatura",        short: "T",    unit: "°C",  decimals: 1, scale: [10, 35],  thresholds: { highWarn: 26, highCrit: 28 } },
  { key: "hr",   label: "Humedad relativa",   short: "HR",   unit: "%",   decimals: 0, scale: [0, 100],  thresholds: { highWarn: 95 } },
  { key: "air",  label: "Velocidad del aire", short: "V",    unit: "m/s", decimals: 2, scale: [0, 3],    thresholds: { lowCrit: 0.2, lowWarn: 0.3 } },
  // Polvo de carbón, fracción respirable. El límite de referencia es un promedio
  // ponderado de 8 h (TWA); la lectura instantánea se usa como indicador temprano.
  { key: "pm",   label: "Polvo de carbón (respirable)", short: "Polvo", unit: "mg/m³", decimals: 2, scale: [0, 2], thresholds: { highWarn: 0.5, highCrit: 0.9 } },
];

/** Variables que se muestran en tarjetas compactas (las más críticas) */
AS.KEY_VARIABLES = ["o2", "ch4", "co", "pm"];

/** Zonas monitoreadas (cada una con sus sensores). La geometría está en AS.MINE_LAYOUT. */
AS.ZONES = [
  { id: "bocamina",   name: "Bocamina",               level: "Superficie", type: "Acceso / entrada de aire" },
  { id: "galeria-1",  name: "Galería principal N1",   level: "Nivel 1",    type: "Transporte" },
  { id: "frente-1",   name: "Frente de explotación 1", level: "Nivel 1",   type: "Frente activo (labor ciega)" },
  { id: "inclinado",  name: "Inclinado / tambor",     level: "N1 → N2",    type: "Comunicación entre niveles" },
  { id: "galeria-2",  name: "Galería N2",             level: "Nivel 2",    type: "Transporte" },
  { id: "frente-2",   name: "Frente de explotación 2", level: "Nivel 2",   type: "Frente activo (labor ciega)" },
  { id: "bombeo",     name: "Estación de bombeo",     level: "Nivel 2",    type: "Servicios" },
  { id: "retorno",    name: "Chimenea de retorno",    level: "N2 → Sup.",  type: "Salida de aire viciado / ventilador principal" },
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
    "Suspender trabajos con fuentes de ignición en la zona (equipos eléctricos, corte, soldadura).",
    "Verificar funcionamiento del ventilador auxiliar y estado de la manga de ventilación.",
    "Confirmar la lectura con un detector portátil calibrado.",
    "Si la concentración alcanza el límite de alarma: evacuar la zona y cortar energía.",
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
  temp: [
    "Aplicar pausas de hidratación y rotación de personal.",
    "Revisar caudal de aire en el frente.",
    "Vigilar síntomas de estrés térmico.",
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

/* ---------- Límites editables (persisten en localStorage) ---------- */

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

AS.getThresholds = function (key) {
  const custom = AS.storage.get("thresholds", {});
  const variable = AS.VARIABLES.find((v) => v.key === key);
  return Object.assign({}, variable.thresholds, custom[key] || {});
};

AS.getVariable = (key) => AS.VARIABLES.find((v) => v.key === key);
AS.getZone = (id) => AS.ZONES.find((z) => z.id === id);
