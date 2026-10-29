/* ==========================================================================
   AtmoSmart — API simulada (mock)

   Reemplaza al backend mientras se define. Todas las funciones devuelven
   Promesas con la misma forma que se espera del servidor, de modo que al
   integrar basta con cambiar la implementación por llamadas fetch().
   Endpoints sugeridos se indican en cada método.

   Los datos son deterministas (función del tiempo + ruido con hash), así que
   todas las páginas ven la misma "mina" de forma coherente. Escenarios:
     - Frente 2: metano en ascenso sostenido (dispara alerta predictiva).
     - Frente 1: temperatura en precaución.
     - Galería N1: pico de CO/NO₂ post-voladura hace ~4,5 h (alerta histórica).
     - Estación de bombeo: detector sin señal en los últimos minutos.
   ========================================================================== */

(function () {
  const LATENCY_MS = 120;
  const MINUTE = 60 * 1000;

  const BASE = { o2: 20.85, ch4: 0.06, co: 4, co2: 0.08, h2s: 0.1, no2: 0.05, temp: 22, hr: 80, air: 1.2, pm: 0.15 };
  const NOISE = { o2: 0.06, ch4: 0.02, co: 1.2, co2: 0.02, h2s: 0.08, no2: 0.03, temp: 0.15, hr: 1.5, air: 0.06, pm: 0.04 };

  const PROFILES = {
    "bocamina":  { o2: 20.9, ch4: 0.0, co: 1, temp: 18, hr: 72, air: 2.2, workers: 4 },
    "galeria-1": { co: 7, no2: 0.08, temp: 22, air: 1.6, workers: 6 },
    "frente-1":  { ch4: 0.22, co: 10, co2: 0.18, temp: 26.8, hr: 88, air: 0.6, pm: 0.62, workers: 9 },
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

  /** Valor simulado de una variable en una zona para un minuto absoluto. */
  function valueAt(zoneId, key, minute, jitter = 0) {
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

  /** Estado de un valor según los umbrales configurados. */
  function statusOf(key, value) {
    if (value == null) return "off";
    const t = AS.getThresholds(key);
    if ((t.highCrit != null && value >= t.highCrit) || (t.lowCrit != null && value <= t.lowCrit)) return "crit";
    if ((t.highWarn != null && value >= t.highWarn) || (t.lowWarn != null && value <= t.lowWarn)) return "warn";
    return "ok";
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
    const t = AS.getThresholds(key);

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
    AS.VARIABLES.forEach((v, i) => {
      const jitter = (hash(seconds * 17 + i * 3 + zoneIndex(zoneId) * 101) - 0.5) * 0.6;
      values[v.key] = valueAt(zoneId, v.key, m, jitter);
      status[v.key] = statusOf(v.key, values[v.key]);
      trends[v.key] = trendOf(zoneId, v.key);
    });
    const offline = Object.values(values).every((v) => v == null);
    return {
      zoneId,
      ts: offline ? (m - OFFLINE_MINUTES) * MINUTE : Date.now(),
      values,
      status,
      trends,
      zoneStatus: offline ? "off" : worstStatus(Object.values(status)),
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
        vars: ["o2", "ch4", "co", "co2", "h2s", "no2"],
        power: "Red + batería respaldo",
        battery: z.id === OFFLINE_ZONE ? 4 : 70 + Math.round(hash(i + 5) * 30),
        calDays: z.id === "inclinado" ? -3 : 5 + Math.round(hash(i + 9) * 80),
      });
      devices.push({
        id: `TH-${code}-01`,
        type: "Sensor temperatura / humedad",
        zoneId: z.id,
        vars: ["temp", "hr"],
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
      if (r.zoneStatus === "off") {
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
        const s = r.status[v.key];
        const t = AS.getThresholds(v.key);
        const value = r.values[v.key];
        if (s === "crit" || s === "warn") {
          const limit = s === "crit" ? (t.highCrit != null && value >= t.highCrit ? t.highCrit : t.lowCrit) : (t.highWarn != null && value >= t.highWarn ? t.highWarn : t.lowWarn);
          const low = t.lowWarn != null && value <= (t.lowWarn ?? -Infinity);
          alerts.push({
            id: `umbral-${z.id}-${v.key}`,
            severity: s,
            type: "Umbral superado",
            zoneId: z.id,
            varKey: v.key,
            value,
            limit,
            title: `${v.label} ${low ? "por debajo" : "por encima"} del límite de ${s === "crit" ? "alarma" : "precaución"}`,
            detail: `${AS.fmt.value(v.key, value)} (límite ${AS.fmt.value(v.key, limit)})`,
            ts: Date.now() - 60 * 1000 * (2 + (v.key.length % 5)),
            protocol: AS.PROTOCOLS[v.key] ? v.key : "default",
            active: true,
          });
        }
        const tr = r.trends[v.key];
        if (s !== "crit" && tr.direction !== "flat" && tr.etaMin != null && tr.etaMin <= 30) {
          alerts.push({
            id: `tendencia-${z.id}-${v.key}`,
            severity: "warn",
            type: "Tendencia predictiva",
            zoneId: z.id,
            varKey: v.key,
            value,
            title: `${v.label} en ${tr.direction === "up" ? "ascenso" : "descenso"}: alcanzaría la alarma en ~${tr.etaMin} min`,
            detail: `Ritmo ${tr.slope > 0 ? "+" : ""}${tr.slope} ${v.unit}/min en los últimos 15 min.`,
            ts: Date.now() - 60 * 1000,
            protocol: AS.PROTOCOLS[v.key] ? v.key : "default",
            active: true,
          });
        }
      });
    });

    buildDevices()
      .filter((d) => d.calDays != null && d.calDays < 0)
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
        severity: "crit",
        type: "Umbral superado",
        zoneId: "galeria-1",
        varKey: "co",
        value: 61,
        limit: 50,
        title: "Monóxido de carbono por encima del límite de alarma",
        detail: "Posterior a voladura programada. Normalizado tras 38 min de ventilación.",
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
        limit: 3,
        title: "Dióxido de nitrógeno por encima del límite de alarma",
        detail: "Gases de voladura. Reingreso autorizado por supervisor tras medición.",
        ts: (m - 272) * MINUTE,
        protocol: "default",
        active: false,
      },
      {
        id: `hist-air-frente-1-${m - 900}`,
        severity: "warn",
        type: "Umbral superado",
        zoneId: "frente-1",
        varKey: "air",
        value: 0.28,
        limit: 0.3,
        title: "Velocidad del aire por debajo del límite de precaución",
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
