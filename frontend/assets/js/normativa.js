/* ==========================================================================
   AtmoSmart — Motor normativo del semáforo

   Fuente: "Parámetros normativos para el semáforo" (Parámetros 1 y 2), que
   organizan el Decreto 1886 de 2015 (Reglamento de Seguridad en las Labores
   Mineras Subterráneas), modificado por el Decreto 944 de 2022.

   Distingue siempre dos cosas:
     - LÍMITE NORMATIVO: valor del decreto (artículo indicado). Define la ALARMA.
     - CRITERIO INTERNO: umbral preventivo (amarillo) definido por el equipo.
       Es configurable y NO es un límite legal.

   Reglas que implementa:
     Art. 38   Oxígeno entre 19,5 % y 23,5 %.
     Art. 39   Gases contaminantes con TLV-TWA (promedio de jornada) y TLV-STEL
               (15 min). No son umbrales instantáneos: se evalúan como exposición.
               Jornada > 8 h: corrección de Brief & Scala.
     Art. 53   Metano según el sitio de la labor (1,0 % o 1,5 %): al alcanzarlo,
               suspender labores y evacuar. > 2 %: solo personal de salvamento.
     Art. 56   Velocidad mínima y máxima del aire según el tipo de vía.
     Art. 217  Temperatura efectiva te = 0,7·th + 0,3·ts − V y tiempo de permanencia.
     Art. 218  te > 31 °C: solo cuadrillas de salvamento.
     Diseño    Lectura ausente, inválida o con calibración vencida = "no disponible",
               nunca estado seguro.

   No es una certificación de cumplimiento legal. Antes de uso operativo el
   responsable técnico debe confirmar el texto vigente, la categoría de la mina
   y los valores de exposición ocupacional aplicables (ACGIH vigente).
   ========================================================================== */

window.AS = window.AS || {};

AS.NORMA = {
  fuente: "Decreto 1886 de 2015, modificado por el Decreto 944 de 2022",
  documento: "Parámetros normativos para el semáforo (Parámetros 1 y 2)",
};

/* ---------- Art. 53: metano según el sitio de la labor ---------- */

AS.LABORES = {
  frente:              { label: "Frente de explotación o avance",                ch4: 1.0, lel: 20, ref: "Art. 53" },
  retorno_principal:   { label: "Retorno principal de aire",                     ch4: 1.0, lel: 20, ref: "Art. 53" },
  retorno_tajo:        { label: "Retorno de aire de los tajos",                  ch4: 1.5, lel: 30, ref: "Art. 53" },
  retorno_preparacion: { label: "Retorno de frentes de preparación y desarrollo", ch4: 1.5, lel: 30, ref: "Art. 53" },
  // El Art. 53 no lista vías de entrada de aire, transporte ni servicios: se aplica
  // el valor más estricto de la tabla. Es un criterio interno, por confirmar con Minas.
  via_general:         { label: "Vía de entrada de aire, transporte o servicio",  ch4: 1.0, lel: 20, ref: "Criterio interno (sitio no listado en el Art. 53; se usa el valor más estricto)", internal: true },
};

/** Art. 53, parágrafo 1: por encima de este valor solo ingresa personal de salvamento. */
AS.CH4_SALVAMENTO = 2.0;

/* ---------- Art. 56: velocidad del aire según el tipo de vía (m/s) ---------- */

AS.VENTILACION = {
  trolley:          { label: "Ventilación principal: vía con locomotora trolley",          min: 1.0, max: 6.0, ref: "Art. 56" },
  via_explotacion:  { label: "Ventilación principal: vía de explotación (galería o sobreguía)", min: 0.5, max: 6.0, ref: "Art. 56" },
  aux_carbon:       { label: "Ventilación auxiliar: vía en carbón",                         min: 0.3, max: 6.0, ref: "Art. 56" },
  aux_roca:         { label: "Ventilación auxiliar: vía en roca",                           min: 0.2, max: 6.0, ref: "Art. 56" },
  avance_arriba:    { label: "Tambor, pozo o inclinado con avance hacia arriba",            min: 0.5, max: null, ref: "Art. 56 (excepción al máximo general)" },
  avance_abajo:     { label: "Bajada, pozo o inclinado con avance hacia abajo",             min: 0.2, max: null, ref: "Art. 56 (excepción al máximo general)" },
  tajo_carbon:      { label: "Tajo de explotación de carbón",                               min: null, max: 4.5, ref: "Art. 56" },
  // Pozos y canales de ventilación están exceptuados del máximo general. El mínimo
  // tomado es el de ventilación principal: criterio interno, por confirmar con Minas.
  pozo_ventilacion: { label: "Pozo o chimenea de ventilación",                              min: 0.5, max: null, ref: "Art. 56 (máximo exceptuado); mínimo por criterio interno", internal: true },
};

/* ---------- Art. 39: valores límite permisibles (unidad de la app) ---------- */
// CO₂ se maneja en % de volumen en la app: 5.000 ppm = 0,5 % · 30.000 ppm = 3,0 %.
AS.VLP = {
  co:  { twa: 25,   stel: null, ppm: "TWA 25 ppm" },
  co2: { twa: 0.5,  stel: 3.0,  ppm: "TWA 5.000 ppm · STEL 30.000 ppm" },
  h2s: { twa: 1,    stel: 5,    ppm: "TWA 1 ppm · STEL 5 ppm" },
  so2: { twa: null, stel: 0.25, ppm: "STEL 0,25 ppm" },
  no:  { twa: 25,   stel: null, ppm: "TWA 25 ppm" },
  no2: { twa: 0.2,  stel: null, ppm: "TWA 0,2 ppm" },
};

/* ---------- Art. 217: temperatura efectiva y tiempo de permanencia ---------- */

AS.TE_TABLA = [
  { te: 28, horas: Infinity, texto: "Sin limitaciones" },
  { te: 29, horas: 6, texto: "6 horas" },
  { te: 30, horas: 4, texto: "4 horas" },
  { te: 31, horas: 2, texto: "2 horas" },
  { te: 32, horas: 0, texto: "0 horas — solo cuadrillas de salvamento (Art. 218)" },
];

/* ---------- Criterios internos (configurables, NO son límites legales) ---------- */

AS.CRITERIOS_DEFAULT = {
  ch4WarnPct: 50,       // precaución de metano al 50 % del límite del Art. 53 del sitio
  o2WarnLow: 20.0,      // precaución si el O₂ baja de este valor (límite legal: 19,5 %)
  o2WarnHigh: 23.0,     // precaución si el O₂ sube de este valor (límite legal: 23,5 %)
  gasWarnPctTwa: 100,   // precaución si la lectura instantánea llega a este % del TLV-TWA
  accionPctTwa: 50,     // precaución si el promedio de la jornada llega a este % del TLV-TWA (nivel de acción)
  excursionFactor: 5,   // alarma instantánea en gases sin STEL: lectura ≥ 5 × TLV-TWA (criterio de excursiones ACGIH)
  airWarnPct: 20,       // precaución si la velocidad está a menos de este % por encima del mínimo
  airWarnMaxPct: 90,    // precaución si la velocidad supera este % del máximo
  teRedondeo: "arriba", // te intermedia: "arriba" aplica la fila siguiente de la tabla (más conservador)
  jornadaHoras: 8,      // duración de la jornada; > 8 h activa la corrección de Brief & Scala
};

AS.CRITERIOS_INFO = {
  ch4WarnPct:      { label: "Precaución de metano (% del límite del Art. 53)", unit: "%" },
  o2WarnLow:       { label: "Precaución si el O₂ baja de", unit: "%" },
  o2WarnHigh:      { label: "Precaución si el O₂ sube de", unit: "%" },
  gasWarnPctTwa:   { label: "Precaución por lectura instantánea (% del TLV-TWA)", unit: "%" },
  accionPctTwa:    { label: "Nivel de acción del promedio de jornada (% del TLV-TWA)", unit: "%" },
  excursionFactor: { label: "Alarma instantánea en gases sin STEL (múltiplo del TLV-TWA)", unit: "×" },
  airWarnPct:      { label: "Precaución de velocidad del aire (% por encima del mínimo)", unit: "%" },
  airWarnMaxPct:   { label: "Precaución de velocidad del aire (% del máximo)", unit: "%" },
  jornadaHoras:    { label: "Duración de la jornada", unit: "h" },
};

AS.getCriterios = function () {
  return Object.assign({}, AS.CRITERIOS_DEFAULT, AS.storage.get("criterios", {}));
};

/* ---------- Cálculos ---------- */

AS.norma = {
  /** Art. 217: te = 0,7 · th + 0,3 · ts − V */
  te(th, ts, v) {
    if (th == null || ts == null || v == null) return null;
    return 0.7 * th + 0.3 * ts - v;
  },

  /** Valor de te que se usa para entrar a la tabla, según el criterio de redondeo. */
  teTabla(te) {
    if (te == null) return null;
    return AS.getCriterios().teRedondeo === "arriba" ? Math.ceil(te - 1e-9) : Math.round(te);
  },

  /** Tiempo de permanencia permitido (Art. 217 y 218). */
  permanencia(te) {
    const t = AS.norma.teTabla(te);
    if (t == null) return null;
    if (t <= 28) return AS.TE_TABLA[0];
    return AS.TE_TABLA.find((row) => row.te === t) || AS.TE_TABLA[AS.TE_TABLA.length - 1];
  },

  /** Brief & Scala (Art. 39, par. 2): factor de corrección del TLV-TWA para jornadas > 8 h. */
  factorJornada(horas) {
    const hd = horas || AS.getCriterios().jornadaHoras;
    if (hd <= 8) return 1;
    return (8 / hd) * ((24 - hd) / 16);
  },

  labor(zoneId) {
    const z = AS.getZone(zoneId);
    return AS.LABORES[(z && z.labor) || "via_general"];
  },

  ventilacion(zoneId) {
    const z = AS.getZone(zoneId);
    return AS.VENTILACION[(z && z.vent) || "via_explotacion"];
  },
};

/**
 * Umbrales instantáneos de una variable en una zona.
 * Devuelve { lowCrit, lowWarn, highWarn, highCrit, refCrit, refWarn }.
 * Si no se indica zona, usa el caso más estricto (frente de explotación).
 */
AS.getThresholds = function (key, zoneId) {
  const c = AS.getCriterios();
  const v = AS.getVariable(key);
  const t = { lowCrit: null, lowWarn: null, highWarn: null, highCrit: null, refCrit: "", refWarn: "Criterio interno (no es límite legal)" };

  switch (key) {
    case "o2":
      Object.assign(t, { lowCrit: 19.5, highCrit: 23.5, lowWarn: c.o2WarnLow, highWarn: c.o2WarnHigh, refCrit: "Art. 38" });
      break;

    case "ch4": {
      const lab = zoneId ? AS.norma.labor(zoneId) : AS.LABORES.frente;
      Object.assign(t, { highCrit: lab.ch4, highWarn: Math.round(lab.ch4 * c.ch4WarnPct) / 100, refCrit: `${lab.ref} — ${lab.label}` });
      break;
    }

    case "co": case "co2": case "h2s": case "so2": case "no": case "no2": {
      const vlp = AS.VLP[key];
      if (vlp.twa != null) t.highWarn = round(vlp.twa * c.gasWarnPctTwa / 100, 4);
      else t.highWarn = round(vlp.stel * 0.5, 4); // SO₂ solo tiene STEL: precaución a la mitad
      t.highCrit = vlp.stel != null ? vlp.stel : round(vlp.twa * c.excursionFactor, 4);
      t.refCrit = vlp.stel != null
        ? "Lectura ≥ TLV-STEL (Art. 39). Criterio interno conservador sobre la lectura instantánea"
        : `Lectura ≥ ${c.excursionFactor} × TLV-TWA (criterio de excursiones ACGIH, al que remite el Art. 39)`;
      t.refWarn = vlp.twa != null ? `Lectura ≥ ${c.gasWarnPctTwa} % del TLV-TWA (criterio interno)` : "Lectura ≥ 50 % del TLV-STEL (criterio interno)";
      break;
    }

    case "te":
      Object.assign(t, { highWarn: 28, highCrit: 31, refWarn: "Art. 217 — por encima de 28 °C se limita el tiempo de permanencia", refCrit: "Art. 218 — por encima de 31 °C solo cuadrillas de salvamento" });
      break;

    case "air": {
      const vent = zoneId ? AS.norma.ventilacion(zoneId) : AS.VENTILACION.aux_carbon;
      if (vent.min != null) { t.lowCrit = vent.min; t.lowWarn = round(vent.min * (1 + c.airWarnPct / 100), 3); }
      if (vent.max != null) { t.highCrit = vent.max; t.highWarn = round(vent.max * c.airWarnMaxPct / 100, 3); }
      t.refCrit = `${vent.ref} — ${vent.label}`;
      break;
    }

    default:
      // Variables de entrada (temp seca, temp húmeda, HR) no tienen semáforo propio.
      if (v && v.thresholds) Object.assign(t, v.thresholds, { refCrit: "Criterio interno (no incluido en Parámetros 1 y 2)" });
  }
  return t;

  function round(x, d) { return Math.round(x * 10 ** d) / 10 ** d; }
};

/**
 * Estado instantáneo de un valor: ok | warn | crit | off.
 * `null` = sin lectura válida → "off" (nunca se muestra como seguro).
 */
AS.evaluate = function (key, value, zoneId) {
  if (value == null || Number.isNaN(value)) return "off";
  if (key === "te") {
    const t = AS.norma.teTabla(value);
    return t <= 28 ? "ok" : t <= 31 ? "warn" : "crit";
  }
  const t = AS.getThresholds(key, zoneId);
  // Metano y gases: alarma al ALCANZAR el valor (Art. 53). O₂ (Art. 38) y velocidad del aire
  // (Art. 56) son rangos: alarma solo si el valor queda POR FUERA (inferior al mínimo o superior al máximo).
  const strictHigh = key === "o2" || key === "air";
  const overCrit = t.highCrit != null && (strictHigh ? value > t.highCrit : value >= t.highCrit);
  if (overCrit || (t.lowCrit != null && value < t.lowCrit)) return "crit";
  if ((t.highWarn != null && value >= t.highWarn) || (t.lowWarn != null && value < t.lowWarn)) return "warn";
  return "ok";
};

/**
 * Evaluación de exposición (Art. 39) a partir de los promedios de una zona.
 * @param {string} key gas
 * @param {{twa:number|null, stel:number|null, minutos:number}} prom
 */
AS.evaluateExposure = function (key, prom) {
  const vlp = AS.VLP[key];
  if (!vlp || !prom) return null;
  const c = AS.getCriterios();
  const fc = AS.norma.factorJornada();
  const twaLim = vlp.twa != null ? vlp.twa * fc : null;
  let status = "ok";
  const causas = [];
  if (twaLim != null && prom.twa != null) {
    if (prom.twa >= twaLim) { status = "crit"; causas.push("twa"); }
    else if (prom.twa >= twaLim * c.accionPctTwa / 100) { status = "warn"; causas.push("accion"); }
  }
  if (vlp.stel != null && prom.stel != null && prom.stel >= vlp.stel) { status = "crit"; causas.push("stel"); }
  return { status, causas, twa: prom.twa, stel: prom.stel, minutos: prom.minutos, twaLim, stelLim: vlp.stel, fc };
};
