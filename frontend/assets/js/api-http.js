/* ==========================================================================
   AtmoSmart — Adaptador HTTP hacia el backend.

   Expone la misma interfaz de datos (AS.api) que usan las páginas, así las páginas no
   cambian. Los datos vienen SIEMPRE del backend (Supabase). Si el backend no
   responde, no se inventan datos: se muestra "Sin conexión con el servidor" y
   se reintenta cada 3 s hasta que vuelva.

   Dirección del backend: AS.BACKEND_URL (config.js) o ?backend=https://...
   ========================================================================== */

(function () {
  const mock = AS.api;
  const params = new URLSearchParams(location.search);
  if (params.get("backend")) AS.storage.set("backendUrl", params.get("backend"));

  const servidoPorBackend = location.protocol === "http:" || location.protocol === "https:";
  const BASE = String(AS.storage.get("backendUrl", null) || AS.BACKEND_URL || (servidoPorBackend ? location.origin : "http://localhost:3000")).replace(/\/$/, "");

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

  /** Conecta con el backend y adopta sus límites. Reintenta hasta lograrlo; resuelve true cuando hay backend. */
  const listo = (async () => {
    for (;;) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
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
        avisarModo();
        abrirEventos();
        return true;
      } catch (e) {
        console.warn(`[AtmoSmart] Sin respuesta del backend en ${BASE}; reintentando…`, e);
        AS.dataMode = "backend-caido";
        avisarModo();
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    }
  })();

  /** Espera a que haya conexión con el backend y llama a su endpoint. Nunca hay datos locales de respaldo. */
  const usar = (http) => async (...args) => {
    await listo;
    return http(...args);
  };

  AS.api = {
    getMineLayout: usar(() => get("/api/mina/plano")),
    getZonesStatus: usar(() => get("/api/zonas/estado")),
    getZoneStatus: usar((id) => get(`/api/zonas/${encodeURIComponent(id)}/estado`).catch(() => null)),
    getSeries: usar(
      ({ zoneId, varKey, minutes = 60, step = 1 }) => get(`/api/mediciones/serie?${q({ zona: zoneId, variable: varKey, minutos: minutes, paso: step })}`)),
    getForecast: usar(
      ({ zoneId, varKey, minutes = 30 }) => get(`/api/mediciones/pronostico?${q({ zona: zoneId, variable: varKey, minutos: minutes })}`)),
    getHistoryTable: usar(
      ({ zoneId = "all", hours = 8, step = 10 }) => get(`/api/mediciones/historial?${q({ zona: zoneId, horas: hours, paso: step })}`)),
    getAlerts: usar(() => get("/api/alertas")),
    ackAlert: usar(
      (id, { user, note } = {}) => pedir("POST", `/api/alertas/${encodeURIComponent(id)}/reconocer`, { user: user || AS.session.user().name, note: note || "" })),
    getDevices: usar(() => get("/api/dispositivos")),
    addManualReading: usar(
      (lectura) => pedir("POST", "/api/mediciones/manual", Object.assign({ user: AS.session.user().name }, lectura))),
    getShiftSummary: usar(() => get("/api/turno")),
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
