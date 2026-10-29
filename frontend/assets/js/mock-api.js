/* ==========================================================================
   AtmoSmart — API simulada (mock)

   Reemplaza al backend mientras se define. Todas las funciones devuelven
   Promesas con la misma forma que se espera del servidor, de modo que al
   integrar basta con cambiar la implementación por llamadas fetch().
   Endpoints sugeridos se indican en cada método.

   Los datos son deterministas (función del tiempo + ruido con hash), así que
   todas las páginas ven la misma "mina" de forma coherente. Escenarios:
     - Frente 2: metano en ascenso sostenido (precaución y alerta predictiva
       hacia el límite del Art. 53).
     - Frente 1: temperatura efectiva sobre 28 °C (permanencia limitada, Art. 217).
     - Galería N1: pico de CO/NO₂ post-voladura hace ~4,5 h: la lectura ya bajó,
       pero el promedio de la jornada de NO₂ supera el TLV-TWA (Art. 39).
     - Inclinado: detector multigas con calibración vencida → gases "no disponible".
     - Estación de bombeo: detector sin señal en los últimos minutos.

   La evaluación (límites, exposición, temperatura efectiva) la hace
   normativa.js; esta API solo produce los datos y arma las respuestas.
   ========================================================================== */

(function () {
  const LATENCY_MS = 120;
  const MINUTE = 60 * 1000;

  const BASE = { o2: 20.85, ch4: 0.06, co: 4, co2: 0.08, h2s: 0.1, no: 0.6, no2: 0.05, so2: 0.02, temp: 22, hr: 80, air: 1.2, pm: 0.15 };
  const NOISE = { o2: 0.06, ch4: 0.02, co: 1.2, co2: 0.02, h2s: 0.08, no: 0.2, no2: 0.02, so2: 0.008, temp: 0.15, tw: 0.15, te: 0.15, hr: 1.5, air: 0.06, pm: 0.04 };

  /** Gases que mide el detector multigas fijo (Art. 46: CH₄, O₂, CO, H₂S, gases nitrosos y CO₂). */
  const MULTIGAS_VARS = ["o2", "ch4", "co", "co2", "h2s", "no", "no2", "so2"];
  /** Zonas cuyo detector multigas tiene la calibración vencida (días de vencida). */
  const CAL_EXPIRED = { inclinado: 3 };

  const PROFILES = {
    "bocamina":  { o2: 20.9, ch4: 0.0, co: 1, temp: 18, hr: 72, air: 2.2, workers: 4 },
    "galeria-1": { co: 7, no2: 0.08, temp: 22, air: 1.6, workers: 6 },
    "frente-1":  { ch4: 0.22, co: 10, co2: 0.18, temp: 30.0, hr: 90, air: 0.6, pm: 0.62, workers: 9 },
    "inclinado": { ch4: 0.14, temp: 23, air: 1.0, workers: 2 },
    "galeria-2": { co: 6, temp: 24, air: 0.9, workers: 5 },
    "frente-2":  { o2: 20.4, ch4: 0.3, co: 8, co2: 0.22, temp: 25.4, hr: 90, air: 0.45, pm: 0.38, workers: 7 },
    "bombeo":    { temp: 23.5, hr: 95, air: 0.7, workers: 1 },
    "retorno":   { o2: 20.6, ch4: 0.2, co: 12, co2: 0.25, temp: 25, hr: 92, air: 2.5, workers: 0 },
  };

  const OFFLINE_ZONE = "bombeo";
  const OFFLINE_MINUTES = 18;

  /* ---------- utilidades ---------- */

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967295;
  }

  const zoneIndex = (id) => AS.ZONES.findIndex((z) => z.id === id);
  const varIndex = (key) => AS.VARIABLES.findIndex((v) => v.key === key);
  const nowMinute = () => Math.floor(Date.now() / MINUTE);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const respond = (value) => new Promise((resolve) => setTimeout(() => resolve(clone(value)), LATENCY_MS));
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  /**
   * Temperatura de bulbo húmedo a partir de temperatura seca (°C) y humedad relativa (%),
   * fórmula empírica de Stull (2011). SOLO para simular el sensor: en la mina la
   * temperatura húmeda la mide un psicrómetro.
   */
  function wetBulb(t, rh) {
    return t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(t + rh) - Math.atan(rh - 1.676331)
      + 0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) - 4.686035;
  }

  const cache = new Map();
  let cacheMinute = null;

  /** Valor simulado de una variable en una zona para un minuto absoluto. */
  function valueAt(zoneId, key, minute, jitter = 0) {
    if (jitter === 0) {
      if (cacheMinute !== nowMinute()) { cache.clear(); cacheMinute = nowMinute(); }
      const ck = `${zoneId}|${key}|${minute}`;
      if (!cache.has(ck)) cache.set(ck, rawValueAt(zoneId, key, minute, 0));
      return cache.get(ck);
    }
    return rawValueAt(zoneId, key, minute, jitter);
  }

  function rawValueAt(zoneId, key, minute, jitter) {
    // Variables derivadas: se calculan con las mismas lecturas que las producen.
    if (key === "tw") {
      const t = valueAt(zoneId, "temp", minute, jitter);
      const rh = valueAt(zoneId, "hr", minute, jitter);
      return t == null || rh == null ? null : round(wetBulb(t, Math.min(99, Math.max(5, rh))), 2);
    }
    if (key === "te") {
      const v = AS.norma.te(valueAt(zoneId, "tw", minute, jitter), valueAt(zoneId, "temp", minute, jitter), valueAt(zoneId, "air", minute, jitter));
      return v == null ? null : round(v, 2);
    }

    const zi = zoneIndex(zoneId);
    const vi = varIndex(key);
    const profile = PROFILES[zoneId] || {};
    const ago = nowMinute() - minute;

    if (zoneId === OFFLINE_ZONE && ago < OFFLINE_MINUTES) return null;

    let v = profile[key] != null ? profile[key] : BASE[key];
    const noise = NOISE[key];
    v += Math.sin(minute / 47 + zi * 1.7 + vi) * noise * 1.5;
    v += (hash(minute * 131 + zi * 7919 + vi * 104729) - 0.5) * noise * 2;
    v += jitter * noise;

    // Escenario: metano en ascenso en el Frente 2 (últimos 45 min)
    if (zoneId === "frente-2" && key === "ch4" && ago < 45) v += ((45 - ago) / 45) * 0.55;
    if (zoneId === "frente-2" && key === "o2" && ago < 45) v -= ((45 - ago) / 45) * 0.15;

    // Escenario: gases post-voladura en Galería N1 (pico hace ~270 min)
    if (zoneId === "galeria-1" && (key === "co" || key === "no2")) {
      const peak = key === "co" ? 58 : 3.4;
      v += peak * Math.exp(-((ago - 270) ** 2) / (2 * 14 ** 2));
    }

    const variable = AS.VARIABLES[vi];
    v = Math.max(0, v);
    if (key === "hr") v = Math.min(100, v);
    return round(v, variable.decimals + 1);
  }

  /** Estado instantáneo de un valor en una zona (lógica en normativa.js). */
  function statusOf(key, value, zoneId) {
    return AS.evaluate(key, value, zoneId);
  }

  /** Inicio del turno vigente (turnos consecutivos desde las 06:00 de la duración configurada). */
  function shiftStartMinute() {
    const hours = AS.getCriterios().jornadaHoras || 8;
    const now = new Date();
    const six = new Date(now);
    six.setHours(6, 0, 0, 0);
    let start = six.getTime();
    if (now.getTime() < start) start -= 24 * 3600 * 1000;
    while (start + hours * 3600 * 1000 <= now.getTime()) start += hours * 3600 * 1000;
    return Math.floor(start / MINUTE);
  }

  /** Promedios de exposición de un gas en una zona: jornada en curso y últimos 15 min. */
  function exposureOf(zoneId, key) {
    const m0 = nowMinute();
    const from = shiftStartMinute();
    const avg = (a, b) => {
      let sum = 0, n = 0;
      for (let m = a; m <= b; m++) {
        const v = valueAt(zoneId, key, m);
        if (v != null) { sum += v; n++; }
      }
      return n ? { v: sum / n, n } : { v: null, n: 0 };
    };
    const shift = avg(from, m0);
    const stel = avg(Math.max(from, m0 - 14), m0);
    return AS.evaluateExposure(key, { twa: shift.v, stel: stel.n >= 5 ? stel.v : null, minutos: shift.n });
  }

  /** Tendencia por regresión lineal (unidades/min) y minutos estimados hasta el límite de alarma. */
  function trendOf(zoneId, key, window = 15) {
    const m0 = nowMinute();
    const pts = [];
    for (let i = window - 1; i >= 0; i--) {
      const v = valueAt(zoneId, key, m0 - i);
      if (v != null) pts.push([window - 1 - i, v]);
    }
    if (pts.length < 5) return { slope: 0, etaMin: null, direction: "flat" };

    const n = pts.length;
    const sx = pts.reduce((a, p) => a + p[0], 0);
    const sy = pts.reduce((a, p) => a + p[1], 0);
    const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
    const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const last = pts[n - 1][1];
    const t = AS.getThresholds(key, zoneId);

    let etaMin = null;
    if (t.highCrit != null && slope > 0 && last < t.highCrit) etaMin = (t.highCrit - last) / slope;
    if (t.lowCrit != null && slope < 0 && last > t.lowCrit) etaMin = (last - t.lowCrit) / -slope;

    const significant = Math.abs(slope) * window > NOISE[key] * 2.5;
    return {
      slope: round(slope, 4),
      etaMin: etaMin != null ? Math.round(etaMin) : null,
      direction: !significant ? "flat" : slope > 0 ? "up" : "down",
    };
  }

  function worstStatus(statuses) {
    return statuses.reduce((worst, s) => (AS.STATUS_RANK[s] > AS.STATUS_RANK[worst] ? s : worst), "ok");
  }

  function currentReading(zoneId) {
    const m = nowMinute();
    const seconds = new Date().getSeconds();
    const values = {};
    const status = {};
    const trends = {};
    const quality = {};
    const exposure = {};
    const calExpired = CAL_EXPIRED[zoneId] != null;
    const jitterOf = (i) => (hash(seconds * 17 + i * 3 + zoneIndex(zoneId) * 101) - 0.5) * 0.6;

    AS.VARIABLES.forEach((v, i) => {
      // Las derivadas se recalculan con las lecturas instantáneas (mismo jitter que sus entradas).
      values[v.key] = v.key === "tw" || v.key === "te" ? null : valueAt(zoneId, v.key, m, jitterOf(i));
    });
    if (values.temp != null && values.hr != null) values.tw = round(wetBulb(values.temp, Math.min(99, Math.max(5, values.hr))), 2);
    values.te = AS.norma.te(values.tw, values.temp, values.air);
    if (values.te != null) values.te = round(values.te, 2);

    AS.VARIABLES.forEach((v) => {
      const k = v.key;
      quality[k] = values[k] == null ? "sin_senal" : "valida";
      if (calExpired && MULTIGAS_VARS.includes(k) && values[k] != null) quality[k] = "calibracion_vencida";
      // Una lectura sin señal o con calibración vencida nunca se muestra como segura.
      status[k] = quality[k] === "valida" ? statusOf(k, values[k], zoneId) : "off";
      trends[k] = trendOf(zoneId, k);
      if (AS.VLP[k] && quality[k] === "valida") exposure[k] = exposureOf(zoneId, k);
    });

    const offline = Object.values(values).every((v) => v == null);
    const statuses = Object.values(status).concat(Object.values(exposure).map((e) => e.status));
    return {
      zoneId,
      ts: offline ? (m - OFFLINE_MINUTES) * MINUTE : Date.now(),
      values,
      status,
      trends,
      quality,
      exposure,
      permanencia: AS.norma.permanencia(values.te),
      calibrationExpired: calExpired ? CAL_EXPIRED[zoneId] : null,
      offline,
      zoneStatus: offline ? "off" : worstStatus(statuses),
      workers: (PROFILES[zoneId] || {}).workers || 0,
    };
  }

  /* ---------- dispositivos ---------- */

  function buildDevices() {
    const devices = [
      { id: "GW-SUP-01", type: "Gateway de superficie", zoneId: "bocamina", vars: [], power: "Red eléctrica + UPS", battery: null, calDays: null },
    ];
    AS.ZONES.forEach((z, i) => {
      const code = z.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      devices.push({
        id: `MG-${code}-01`,
        type: "Detector multigas fijo",
        zoneId: z.id,
        vars: MULTIGAS_VARS,
        power: "Red + batería respaldo",
        battery: z.id === OFFLINE_ZONE ? 4 : 70 + Math.round(hash(i + 5) * 30),
        calDays: CAL_EXPIRED[z.id] != null ? -CAL_EXPIRED[z.id] : 5 + Math.round(hash(i + 9) * 80),
      });
      devices.push({
        id: `TH-${code}-01`,
        type: "Psicrómetro (temperatura seca y húmeda) / humedad",
        zoneId: z.id,
        vars: ["temp", "tw", "hr"],
        power: "Batería",
        battery: 40 + Math.round(hash(i + 21) * 60),
        calDays: 30 + Math.round(hash(i + 33) * 150),
      });
      if (z.id.startsWith("frente")) {
        devices.push({
          id: `PM-${code}-01`,
          type: "Monitor de polvo respirable",
          zoneId: z.id,
          vars: ["pm"],
          power: "Red + batería respaldo",
          battery: 60 + Math.round(hash(i + 66) * 40),
          calDays: 10 + Math.round(hash(i + 77) * 60),
        });
      }
      if (z.id !== "bocamina") {
        devices.push({
          id: `AN-${code}-01`,
          type: "Anemómetro",
          zoneId: z.id,
          vars: ["air"],
          power: "Batería",
          battery: z.id === "galeria-2" ? 14 : 50 + Math.round(hash(i + 44) * 50),
          calDays: 20 + Math.round(hash(i + 55) * 200),
        });
      }
    });
    ["P-014", "P-022", "P-031", "P-047"].forEach((id, i) => {
      devices.push({
        id,
        type: "Detector portátil personal",
        zoneId: ["frente-1", "frente-2", "galeria-2", "frente-2"][i],
        vars: ["o2", "ch4", "co", "h2s"],
        power: "Batería",
        battery: 35 + Math.round(hash(i + 70) * 60),
        calDays: 2 + Math.round(hash(i + 80) * 25),
        holder: ["J. Rincón", "M. Pabón", "L. Carrascal", "A. Quintero"][i],
      });
    });

    return devices.map((d) => {
      const offline = d.zoneId === OFFLINE_ZONE && d.type === "Detector multigas fijo";
      return Object.assign(d, {
        status: offline ? "off" : "ok",
        lastSeen: offline ? (nowMinute() - OFFLINE_MINUTES) * MINUTE : Date.now() - Math.round(hash(d.id.length * 13) * 20) * 1000,
      });
    });
  }

  /* ---------- alertas ---------- */

  function buildAlerts() {
    const acks = AS.storage.get("acks", {});
    const alerts = [];
    const m = nowMinute();

    AS.ZONES.forEach((z) => {
      const r = currentReading(z.id);
      if (r.offline) {
        alerts.push({
          id: `sensor-${z.id}`,
          severity: "off",
          type: "Sensor sin señal",
          zoneId: z.id,
          varKey: null,
          title: `Detector multigas sin comunicación`,
          detail: `Última lectura hace ${OFFLINE_MINUTES} min. La zona no está siendo monitoreada.`,
          ts: r.ts,
          protocol: "sensor",
          active: true,
        });
        return;
      }
      AS.VARIABLES.forEach((v) => {
        const k = v.key;
        const s = r.status[k];
        const value = r.values[k];
        const t = AS.getThresholds(k, z.id);
        const protocol = AS.PROTOCOLS[k] ? k : "default";

        if (r.quality[k] === "valida" && (s === "crit" || s === "warn")) {
          const alert = {
            id: `umbral-${z.id}-${k}`,
            severity: s,
            type: "Umbral superado",
            zoneId: z.id,
            varKey: k,
            value,
            ts: Date.now() - 60 * 1000 * (2 + (k.length % 5)),
            protocol,
            active: true,
          };

          if (k === "te") {
            const p = r.permanencia;
            alert.limit = s === "crit" ? t.highCrit : t.highWarn;
            alert.ref = s === "crit" ? "Art. 218" : "Art. 217";
            alert.title = s === "crit"
              ? `Temperatura efectiva ${AS.fmt.value(k, value)}: solo cuadrillas de salvamento`
              : `Temperatura efectiva ${AS.fmt.value(k, value)}: permanencia máxima ${p.texto}`;
            alert.detail = `te = 0,7·Th + 0,3·Ts − V = 0,7·${AS.fmt.number(r.values.tw, 1)} + 0,3·${AS.fmt.number(r.values.temp, 1)} − ${AS.fmt.number(r.values.air, 2)}. ${alert.ref}.`;
          } else {
            const low = (t.lowCrit != null && value < t.lowCrit) || (t.lowWarn != null && value < t.lowWarn && !(t.highWarn != null && value >= t.highWarn));
            alert.limit = s === "crit" ? (low ? t.lowCrit : t.highCrit) : (low ? t.lowWarn : t.highWarn);
            alert.ref = s === "crit" ? t.refCrit : t.refWarn;
            alert.title = `${v.label} ${low ? "por debajo" : "por encima"} del ${s === "crit" ? "límite de alarma" : "umbral de precaución"}`;
            if (k === "ch4" && s === "crit") {
              alert.title = value > AS.CH4_SALVAMENTO
                ? `Metano sobre ${AS.fmt.number(AS.CH4_SALVAMENTO, 1)} %: solo personal de salvamento`
                : "Metano en el límite del Art. 53: suspender labores y evacuar";
            }
            alert.detail = `${AS.fmt.value(k, value)} (${s === "crit" ? "límite" : "umbral"} ${AS.fmt.value(k, alert.limit)}). ${alert.ref}.`;
          }
          alerts.push(alert);
        }

        const ex = r.exposure[k];
        if (ex && ex.status !== "ok") {
          const parts = [];
          if (ex.twaLim != null) parts.push(`promedio de jornada ${AS.fmt.value(k, ex.twa)} (TLV-TWA ${AS.fmt.value(k, ex.twaLim)}${ex.fc < 1 ? `, corregido por jornada de ${AS.getCriterios().jornadaHoras} h` : ""})`);
          if (ex.stelLim != null && ex.stel != null) parts.push(`promedio 15 min ${AS.fmt.value(k, ex.stel)} (TLV-STEL ${AS.fmt.value(k, ex.stelLim)})`);
          alerts.push({
            id: `exposicion-${z.id}-${k}`,
            severity: ex.status,
            type: "Exposición de jornada",
            zoneId: z.id,
            varKey: k,
            value: ex.twa,
            limit: ex.twaLim,
            ref: ex.status === "crit" ? "Art. 39" : "Nivel de acción (criterio interno)",
            title: ex.causas.includes("stel")
              ? `${v.label}: exposición de 15 min supera el TLV-STEL`
              : ex.status === "crit"
                ? `${v.label}: el promedio de la jornada supera el TLV-TWA`
                : `${v.label}: el promedio de la jornada llegó al nivel de acción`,
            detail: `${parts.join(" · ")}. ${ex.status === "crit" ? "Art. 39" : `Nivel de acción: ${AS.getCriterios().accionPctTwa} % del TLV-TWA (criterio interno)`}.`,
            ts: Date.now() - 60 * 1000 * 3,
            protocol: "exposicion",
            active: true,
          });
        }

        const tr = r.trends[k];
        if (r.quality[k] === "valida" && s !== "crit" && tr.direction !== "flat" && tr.etaMin != null && tr.etaMin <= 30) {
          alerts.push({
            id: `tendencia-${z.id}-${k}`,
            severity: "warn",
            type: "Tendencia predictiva",
            zoneId: z.id,
            varKey: k,
            value,
            limit: tr.direction === "up" ? t.highCrit : t.lowCrit,
            ref: t.refCrit,
            title: `${v.label} en ${tr.direction === "up" ? "ascenso" : "descenso"}: alcanzaría la alarma en ~${tr.etaMin} min`,
            detail: `Ritmo ${tr.slope > 0 ? "+" : ""}${tr.slope} ${v.unit}/min en los últimos 15 min. Límite: ${AS.fmt.value(k, tr.direction === "up" ? t.highCrit : t.lowCrit)} (${t.refCrit}).`,
            ts: Date.now() - 60 * 1000,
            protocol,
            active: true,
          });
        }
      });

      if (r.calibrationExpired) {
        alerts.push({
          id: `cal-gases-${z.id}`,
          severity: "off",
          type: "Lectura no válida",
          zoneId: z.id,
          varKey: null,
          title: "Gases sin lectura válida: detector con calibración vencida",
          detail: `La calibración venció hace ${r.calibrationExpired} días. Las lecturas de gases se muestran como "no disponible", nunca como seguras (Arts. 46 y 51). Medir con detector portátil calibrado.`,
          ts: Date.now() - 5 * 3600 * 1000,
          protocol: "sensor",
          active: true,
        });
      }
    });

    buildDevices()
      // El multigas con calibración vencida ya genera la alerta "Lectura no válida" de su zona.
      .filter((d) => d.calDays != null && d.calDays < 0 && !(d.type === "Detector multigas fijo" && CAL_EXPIRED[d.zoneId] != null))
      .forEach((d) => {
        alerts.push({
          id: `cal-${d.id}`,
          severity: "info",
          type: "Calibración vencida",
          zoneId: d.zoneId,
          varKey: null,
          title: `${d.type} ${d.id}: calibración vencida hace ${-d.calDays} días`,
          detail: "Las lecturas pueden no ser confiables hasta recalibrar.",
          ts: Date.now() - 6 * 3600 * 1000,
          protocol: "sensor",
          active: true,
        });
      });

    // Históricas (resueltas)
    alerts.push(
      {
        id: `hist-co-galeria-1-${m - 270}`,
        severity: "warn",
        type: "Umbral superado",
        zoneId: "galeria-1",
        varKey: "co",
        value: 61,
        limit: 25,
        ref: "Lectura ≥ 100 % del TLV-TWA (criterio interno)",
        title: "Monóxido de carbono por encima del umbral de precaución",
        detail: "61 ppm posterior a voladura programada (TLV-TWA 25 ppm, Art. 39). Normalizado tras 38 min de ventilación.",
        ts: (m - 270) * MINUTE,
        protocol: "co",
        active: false,
      },
      {
        id: `hist-no2-galeria-1-${m - 272}`,
        severity: "crit",
        type: "Umbral superado",
        zoneId: "galeria-1",
        varKey: "no2",
        value: 3.5,
        limit: 1,
        ref: "Lectura ≥ 5 × TLV-TWA (criterio de excursiones ACGIH, al que remite el Art. 39)",
        title: "Dióxido de nitrógeno por encima del límite de alarma",
        detail: "3,5 ppm por gases de voladura (5 × TLV-TWA = 1 ppm). Reingreso autorizado por supervisor tras medición.",
        ts: (m - 272) * MINUTE,
        protocol: "default",
        active: false,
      },
      {
        id: `hist-air-frente-1-${m - 900}`,
        severity: "crit",
        type: "Umbral superado",
        zoneId: "frente-1",
        varKey: "air",
        value: 0.28,
        limit: 0.3,
        ref: "Art. 56 — Ventilación auxiliar: vía en carbón",
        title: "Velocidad del aire por debajo del mínimo del Art. 56",
        detail: "Manga de ventilación desacoplada. Corregido por mantenimiento.",
        ts: (m - 900) * MINUTE,
        protocol: "air",
        active: false,
      }
    );

    return alerts
      .map((a) => Object.assign(a, { ack: acks[a.id] || null }))
      .sort((a, b) => b.ts - a.ts);
  }

  /* ---------- API pública ---------- */

  AS.api = {
    /** GET /api/mina/plano — plano vigente (versionado por topografía). */
    getMineLayout() {
      return respond(AS.MINE_LAYOUT);
    },

    /** GET /api/zonas/estado */
    getZonesStatus() {
      return respond(AS.ZONES.map((z) => Object.assign({}, z, { reading: currentReading(z.id) })));
    },

    /** GET /api/zonas/:id/estado */
    getZoneStatus(zoneId) {
      const z = AS.getZone(zoneId);
      return respond(z ? Object.assign({}, z, { reading: currentReading(zoneId) }) : null);
    },

    /** GET /api/mediciones?zona=&variable=&desde=&hasta=&paso= */
    getSeries({ zoneId, varKey, minutes = 60, step = 1 }) {
      const m0 = nowMinute();
      const points = [];
      for (let m = m0 - minutes; m <= m0; m += step) {
        points.push({ t: m * MINUTE, v: valueAt(zoneId, varKey, m) });
      }
      return respond(points);
    },

    /** Proyección lineal a futuro según la tendencia actual (para el gráfico). */
    getForecast({ zoneId, varKey, minutes = 30 }) {
      const tr = trendOf(zoneId, varKey);
      const m0 = nowMinute();
      const v0 = valueAt(zoneId, varKey, m0);
      if (v0 == null || tr.direction === "flat") return respond([]);
      return respond([
        { t: m0 * MINUTE, v: v0 },
        { t: (m0 + minutes) * MINUTE, v: Math.max(0, v0 + tr.slope * minutes) },
      ]);
    },

    /** GET /api/mediciones/tabla — filas por zona y marca de tiempo con todas las variables. */
    getHistoryTable({ zoneId = "all", hours = 8, step = 10 }) {
      const m0 = nowMinute();
      const zones = zoneId === "all" ? AS.ZONES : [AS.getZone(zoneId)];
      const rows = [];
      for (let m = m0 - (m0 % step); m >= m0 - hours * 60; m -= step) {
        zones.forEach((z) => {
          const values = {};
          AS.VARIABLES.forEach((v) => (values[v.key] = valueAt(z.id, v.key, m)));
          if (Object.values(values).every((v) => v == null)) return;
          rows.push({ ts: m * MINUTE, zoneId: z.id, values, source: "Sensor fijo" });
        });
      }
      const manual = AS.storage.get("manual", []).filter((r) => (zoneId === "all" || r.zoneId === zoneId) && r.ts >= (m0 - hours * 60) * MINUTE);
      return respond(rows.concat(manual).sort((a, b) => b.ts - a.ts));
    },

    /** GET /api/alertas */
    getAlerts() {
      return respond(buildAlerts());
    },

    /** POST /api/alertas/:id/reconocer */
    ackAlert(id, { user, note } = {}) {
      const acks = AS.storage.get("acks", {});
      acks[id] = { user: user || AS.session.user().name, note: note || "", ts: Date.now() };
      AS.storage.set("acks", acks);
      return respond(acks[id]);
    },

    /** GET /api/dispositivos */
    getDevices() {
      return respond(buildDevices());
    },

    /** POST /api/mediciones/manual — solo contingencia (sensor caído). */
    addManualReading(reading) {
      const list = AS.storage.get("manual", []);
      const row = Object.assign({ ts: Date.now(), source: "Manual (contingencia)" }, reading);
      // Temperatura efectiva (Art. 217) si se registraron sus tres entradas.
      const v = row.values || {};
      if (v.te == null && v.tw != null && v.temp != null && v.air != null) v.te = Math.round(AS.norma.te(v.tw, v.temp, v.air) * 100) / 100;
      list.push(row);
      AS.storage.set("manual", list);
      return respond(row);
    },

    /** GET /api/turno/resumen */
    getShiftSummary() {
      const workers = Object.values(PROFILES).reduce((a, p) => a + (p.workers || 0), 0);
      return respond({ shift: "Turno A", from: "06:00", to: "14:00", supervisor: "Ing. Laura Méndez", workersInside: workers });
    },

    statusOf,
  };
})();
