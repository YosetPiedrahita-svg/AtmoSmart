/* ==========================================================================
   AtmoSmart — Adaptador HTTP hacia el backend.

   Expone la MISMA interfaz que mock-api.js (AS.api), así las páginas no
   cambian. Al cargar intenta conectarse al backend:
     - si responde → usa el backend (datos del simulador / sensores reales,
       límites del servidor y actualizaciones en vivo por SSE);
     - si no responde → sigue con mock-api.js como respaldo (modo demo).

   Forzar un modo:   ?datos=backend   ?datos=mock   ?datos=auto (por defecto)
   Otra dirección:   ?backend=http://192.168.1.20:3000
   (ambas preferencias se recuerdan en este navegador)
   ========================================================================== */

(function () {
  const mock = AS.api;
  const params = new URLSearchParams(location.search);
  if (params.get("datos")) AS.storage.set("datos", params.get("datos"));
  if (params.get("backend")) AS.storage.set("backendUrl", params.get("backend"));

  const preferencia = AS.storage.get("datos", "auto");
  const servidoPorBackend = location.protocol === "http:" || location.protocol === "https:";
  const BASE = String(AS.storage.get("backendUrl", null) || (servidoPorBackend ? location.origin : "http://localhost:3000")).replace(/\/$/, "");

  AS.dataMode = "conectando";
  AS.backendUrl = BASE;
  const oyentes = new Set();
  const avisarModo = () => document.dispatchEvent(new CustomEvent("as:datamode", { detail: AS.dataMode }));

  async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok) throw new Error((datos && datos.error) || `Error ${r.status} en ${ruta}`);
    return datos;
  }
  const get = (ruta) => pedir("GET", ruta);
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();

  function abrirEventos() {
    const es = new EventSource(BASE + "/api/stream");
    const reenviar = (e) => {
      let dato = null;
      try { dato = JSON.parse(e.data); } catch (_) { /* evento sin datos */ }
      oyentes.forEach((cb) => cb(dato));
    };
    es.addEventListener("mediciones", reenviar);
    es.addEventListener("alerta", reenviar);
    es.onerror = () => { if (AS.dataMode === "backend") { AS.dataMode = "backend-caido"; avisarModo(); } };
    es.onopen = () => { if (AS.dataMode === "backend-caido") { AS.dataMode = "backend"; avisarModo(); } };
  }

  /** Conecta con el backend y adopta sus límites. Resuelve true si hay backend. */
  const listo = (async () => {
    if (preferencia === "mock") {
      AS.dataMode = "mock";
      avisarModo();
      return false;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(BASE + "/api/config", { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(String(r.status));
      const cfg = await r.json();
      // Los límites vigentes son los del servidor (no los guardados en el navegador).
      cfg.variables.forEach((v) => {
        const local = AS.getVariable(v.key);
        if (local) local.thresholds = Object.assign({}, v.thresholds);
      });
      AS.getThresholds = (key) => Object.assign({}, (AS.getVariable(key) || { thresholds: {} }).thresholds);
      AS.dataMode = "backend";
      abrirEventos();
      return true;
    } catch (e) {
      console.warn(`[AtmoSmart] Backend no disponible en ${BASE}; se usan datos simulados locales.`, e);
      AS.dataMode = "mock";
      return false;
    } finally {
      avisarModo();
    }
  })();

  /** Usa el backend si está disponible; si no, la función equivalente del mock. */
  const usar = (http, respaldo) => async (...args) => ((await listo) ? http(...args) : respaldo(...args));

  AS.api = {
    getMineLayout: usar(() => get("/api/mina/plano"), mock.getMineLayout),
    getZonesStatus: usar(() => get("/api/zonas/estado"), mock.getZonesStatus),
    getZoneStatus: usar((id) => get(`/api/zonas/${encodeURIComponent(id)}/estado`).catch(() => null), mock.getZoneStatus),
    getSeries: usar(
      ({ zoneId, varKey, minutes = 60, step = 1 }) => get(`/api/mediciones/serie?${q({ zona: zoneId, variable: varKey, minutos: minutes, paso: step })}`),
      mock.getSeries
    ),
    getForecast: usar(
      ({ zoneId, varKey, minutes = 30 }) => get(`/api/mediciones/pronostico?${q({ zona: zoneId, variable: varKey, minutos: minutes })}`),
      mock.getForecast
    ),
    getHistoryTable: usar(
      ({ zoneId = "all", hours = 8, step = 10 }) => get(`/api/mediciones/historial?${q({ zona: zoneId, horas: hours, paso: step })}`),
      mock.getHistoryTable
    ),
    getAlerts: usar(() => get("/api/alertas"), mock.getAlerts),
    ackAlert: usar(
      (id, { user, note } = {}) => pedir("POST", `/api/alertas/${encodeURIComponent(id)}/reconocer`, { user: user || AS.session.user().name, note: note || "" }),
      mock.ackAlert
    ),
    getDevices: usar(() => get("/api/dispositivos"), mock.getDevices),
    addManualReading: usar(
      (lectura) => pedir("POST", "/api/mediciones/manual", Object.assign({ user: AS.session.user().name }, lectura)),
      mock.addManualReading
    ),
    getShiftSummary: usar(() => get("/api/turno"), mock.getShiftSummary),
    /** Solo con backend: guarda los límites de una variable en el servidor. */
    saveLimits: (key, thresholds) => pedir("PUT", `/api/limites/${encodeURIComponent(key)}`, { thresholds, user: AS.session.user().name }),
    /** Notifica cambios en vivo (SSE). Devuelve una función para cancelar. */
    subscribe(cb) {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
    ready: listo,
    statusOf: mock.statusOf,
  };
})();
