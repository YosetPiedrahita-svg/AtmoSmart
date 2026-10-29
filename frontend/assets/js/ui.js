/* ==========================================================================
   AtmoSmart — UI compartida: íconos, shell (sidebar + topbar), formato,
   tema, sesión simulada, toasts y modales.
   ========================================================================== */

(function () {
  /* ---------- Íconos (trazos 24x24, estilo lineal) ---------- */

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    map: '<path d="M14.1 5.55a2 2 0 0 0 1.8 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9L8.1 3.45a2 2 0 0 1 1.8 0z"/><path d="M15 5.76v15"/><path d="M9 3.24v15"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    sensor: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><path d="m2 2 20 20"/>',
    wifi: '<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    minus: '<path d="M5 12h14"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  };

  AS.icon = function (name, cls = "icon") {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  };

  AS.logo = function (size = 20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18c2-6 5-9 9-9s7 3 9 9"/><path d="M7 18c1-3 2.6-5 5-5s4 2 5 5"/><circle cx="12" cy="18" r="1.4" fill="currentColor"/></svg>`;
  };

  /* ---------- Formato ---------- */

  const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateTimeFmt = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  AS.fmt = {
    number(value, decimals = 0) {
      if (value == null || Number.isNaN(value)) return "—";
      return Number(value).toLocaleString("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },
    value(key, value, withUnit = true) {
      const v = AS.getVariable(key);
      if (value == null) return "—";
      const n = AS.fmt.number(value, v.decimals);
      return withUnit ? `${n} ${v.unit}` : n;
    },
    time: (ts) => (ts == null ? "—" : timeFmt.format(new Date(ts))),
    dateTime: (ts) => (ts == null ? "—" : dateTimeFmt.format(new Date(ts))),
    ago(ts) {
      if (ts == null) return "sin datos";
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return `hace ${s} s`;
      const m = Math.round(s / 60);
      if (m < 60) return `hace ${m} min`;
      const h = Math.round(m / 60);
      if (h < 24) return `hace ${h} h`;
      return `hace ${Math.round(h / 24)} d`;
    },
    limits(key) {
      const v = AS.getVariable(key);
      const t = AS.getThresholds(key);
      const parts = [];
      if (t.lowCrit != null) parts.push(`mín ${AS.fmt.number(t.lowCrit, v.decimals)}`);
      if (t.highCrit != null) parts.push(`máx ${AS.fmt.number(t.highCrit, v.decimals)}`);
      if (!parts.length && t.highWarn != null) parts.push(`aviso ${AS.fmt.number(t.highWarn, v.decimals)}`);
      return parts.join(" · ") + ` ${v.unit}`;
    },
  };

  AS.escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  AS.badge = (status, text) => `<span class="badge ${AS.STATUS[status].badge}${status === "crit" ? " is-live" : ""}">${text || AS.STATUS[status].label}</span>`;

  AS.trendHtml = function (trend) {
    if (!trend || trend.direction === "flat") return `<span class="var-trend flat">${AS.icon("minus", "icon-sm")} Estable</span>`;
    const up = trend.direction === "up";
    return `<span class="var-trend ${up ? "up" : "down"}">${AS.icon(up ? "trendUp" : "trendDown", "icon-sm")} ${up ? "Subiendo" : "Bajando"}</span>`;
  };

  /** Porcentaje (0–100) para el medidor lineal según la escala de la variable. */
  AS.meterPct = function (key, value) {
    const [min, max] = AS.getVariable(key).scale;
    if (value == null) return 0;
    return Math.max(2, Math.min(100, ((value - min) / (max - min)) * 100));
  };

  AS.qs = (sel, root = document) => root.querySelector(sel);
  AS.qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  AS.param = (name) => new URLSearchParams(location.search).get(name);

  /* ---------- Sesión simulada ---------- */

  AS.ROLES = {
    operador: "Operador / Controlador",
    supervisor: "Supervisor de turno",
    hse: "Seguridad y salud (HSE)",
    admin: "Administrador",
  };

  AS.session = {
    user() {
      return AS.storage.get("session", { name: "Laura Méndez", role: "supervisor" });
    },
    login(name, role) {
      AS.storage.set("session", { name, role });
    },
    logout() {
      AS.storage.remove("session");
    },
  };

  /* ---------- Tema ---------- */

  AS.theme = {
    current() {
      const forced = document.documentElement.getAttribute("data-theme");
      if (forced) return forced;
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    toggle() {
      const next = AS.theme.current() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      AS.storage.set("theme", next);
      document.dispatchEvent(new CustomEvent("themechange"));
      return next;
    },
  };

  const savedTheme = AS.storage.get("theme", null);
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  /* ---------- Shell (sidebar + topbar) ---------- */

  const NAV = [
    { section: "Monitoreo" },
    { id: "dashboard", href: "dashboard.html", label: "Panel general", icon: "dashboard" },
    { id: "zonas", href: "zonas.html", label: "Mapa de la mina", icon: "map" },
    { id: "alertas", href: "alertas.html", label: "Alertas", icon: "alert", badge: true },
    { id: "historial", href: "historial.html", label: "Historial", icon: "history" },
    { section: "Operación" },
    { id: "dispositivos", href: "dispositivos.html", label: "Sensores y equipos", icon: "sensor" },
    { id: "configuracion", href: "configuracion.html", label: "Límites y configuración", icon: "settings" },
  ];

  /**
   * Monta el shell alrededor del contenido existente en <main data-page>.
   * Cada página solo define su <main class="page">; el resto se inyecta aquí.
   */
  AS.mountShell = function ({ active, title }) {
    const page = AS.qs("main.page");
    const user = AS.session.user();
    const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

    const nav = NAV.map((item) => {
      if (item.section) return `<div class="nav-label">${item.section}</div>`;
      const current = item.id === active ? ' aria-current="page"' : "";
      const badge = item.badge ? '<span class="badge badge-count hidden" data-alert-count></span>' : "";
      return `<a class="nav-link" href="${item.href}"${current}>${AS.icon(item.icon)}<span>${item.label}</span>${badge}</a>`;
    }).join("");

    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar" id="sidebar" aria-label="Navegación principal">
        <a class="brand" href="dashboard.html">
          <span class="brand-mark">${AS.logo(20)}</span>
          <span>AtmoSmart<small>Monitoreo de atmósfera minera</small></span>
        </a>
        <nav class="nav">${nav}</nav>
        <div class="sidebar-footer stack-sm">
          <div class="spread"><strong class="text-sm">Mina Demo</strong>${AS.badge("ok", "Operando")}</div>
          <div data-shift>Turno —</div>
          <a class="nav-link" href="index.html" data-logout style="min-height:36px;padding:0">${AS.icon("logout", "icon-sm")} Cerrar sesión</a>
        </div>
      </aside>
      <div class="sidebar-overlay" data-close-nav></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" type="button" aria-label="Abrir menú" aria-controls="sidebar" data-open-nav>${AS.icon("menu")}</button>
          <div class="topbar-title truncate">${AS.escape(title)}</div>
          <div class="topbar-actions">
            <span class="pill-status hide-mobile" data-datasource title=""><i></i><span>Conectando…</span></span>
            <span class="pill-status hide-mobile" data-connection><i></i><span>En línea</span></span>
            <span class="pill-status hide-mobile" title="Última sincronización con el gateway">${AS.icon("activity", "icon-sm")}<span data-last-sync>—</span></span>
            <a class="icon-btn" href="alertas.html" aria-label="Alertas activas">${AS.icon("bell")}<span class="dot-count hidden" data-alert-count></span></a>
            <button class="icon-btn" type="button" aria-label="Cambiar tema" data-theme-toggle>${AS.icon(AS.theme.current() === "dark" ? "sun" : "moon")}</button>
            <div class="user-chip hide-mobile"><span class="avatar">${initials}</span><span><strong>${AS.escape(user.name)}</strong><br><span class="muted">${AS.ROLES[user.role] || ""}</span></span></div>
          </div>
        </header>
      </div>
      <div class="toast-region" aria-live="polite" data-toasts></div>
    `;

    page.parentNode.insertBefore(app, page);
    AS.qs(".main", app).appendChild(page);

    // Navegación móvil
    AS.qs("[data-open-nav]", app).addEventListener("click", () => app.classList.add("is-nav-open"));
    AS.qs("[data-close-nav]", app).addEventListener("click", () => app.classList.remove("is-nav-open"));
    document.addEventListener("keydown", (e) => e.key === "Escape" && app.classList.remove("is-nav-open"));

    // Tema
    const themeBtn = AS.qs("[data-theme-toggle]", app);
    themeBtn.addEventListener("click", () => {
      const next = AS.theme.toggle();
      themeBtn.innerHTML = AS.icon(next === "dark" ? "sun" : "moon");
    });

    AS.qs("[data-logout]", app).addEventListener("click", () => AS.session.logout());

    // Conectividad (la app debe seguir funcionando sin Internet)
    const conn = AS.qs("[data-connection]", app);
    const updateConn = () => {
      const online = navigator.onLine;
      conn.classList.toggle("is-offline", !online);
      conn.lastElementChild.textContent = online ? "En línea" : "Sin conexión · datos locales";
    };
    addEventListener("online", updateConn);
    addEventListener("offline", updateConn);
    updateConn();

    // Fuente de datos: backend (sensores / simulador) o datos simulados locales
    const fuente = AS.qs("[data-datasource]", app);
    const updateFuente = () => {
      const modos = {
        backend: ["Backend · datos de sensores", false, `Conectado a ${AS.backendUrl}`],
        "backend-caido": ["Backend sin respuesta · reintentando", true, `No hay conexión en vivo con ${AS.backendUrl}`],
        mock: ["Modo demo · datos locales", true, "Sin backend: se usan datos simulados en el navegador"],
        conectando: ["Conectando…", false, ""],
      };
      const [texto, aviso, titulo] = modos[AS.dataMode] || modos.mock;
      fuente.classList.toggle("is-offline", aviso);
      fuente.lastElementChild.textContent = texto;
      fuente.title = titulo;
    };
    document.addEventListener("as:datamode", updateFuente);
    updateFuente();

    AS.api.getShiftSummary().then((s) => {
      AS.qs("[data-shift]", app).textContent = `${s.shift} · ${s.from}–${s.to} · ${s.workersInside} personas en interior`;
    });

    AS.refreshAlertCount();
    AS.markSynced();
  };

  AS.refreshAlertCount = function () {
    return AS.api.getAlerts().then((alerts) => {
      const n = alerts.filter((a) => a.active && !a.ack && a.severity !== "info").length;
      AS.qsa("[data-alert-count]").forEach((el) => {
        el.textContent = n;
        el.classList.toggle("hidden", n === 0);
      });
      return alerts;
    });
  };

  AS.markSynced = function () {
    const el = AS.qs("[data-last-sync]");
    if (el) el.textContent = `Sync ${AS.fmt.time(Date.now())}`;
  };

  /** Ejecuta `fn` ahora y cada `ms` mientras la pestaña esté visible (simula datos en vivo). */
  AS.live = function (fn, ms = 5000) {
    fn();
    // Con backend, además del sondeo periódico se refresca al llegar un evento en vivo (SSE).
    if (AS.api.subscribe) {
      let pendiente = null;
      AS.api.subscribe(() => {
        if (pendiente || document.visibilityState !== "visible") return;
        pendiente = setTimeout(() => {
          pendiente = null;
          fn();
          AS.markSynced();
        }, 400);
      });
    }
    return setInterval(() => {
      if (document.visibilityState === "visible") {
        fn();
        AS.markSynced();
      }
    }, ms);
  };

  /* ---------- Toasts ---------- */

  AS.toast = function (message, kind = "info", timeout = 4000) {
    const region = AS.qs("[data-toasts]");
    if (!region) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.dataset.kind = kind;
    const icon = kind === "ok" ? "check" : kind === "info" ? "info" : "alert";
    el.innerHTML = `${AS.icon(icon, "icon-sm")}<div>${message}</div>`;
    region.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  };

  /* ---------- Modales (<dialog>) ---------- */

  AS.modal = function ({ title, body, footer = "", onMount }) {
    const dlg = document.createElement("dialog");
    dlg.className = "modal";
    dlg.innerHTML = `
      <div class="modal-header"><h2 class="text-lg">${title}</h2><button class="icon-btn" type="button" aria-label="Cerrar" data-close>${AS.icon("x")}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
    `;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    });
    if (onMount) onMount(dlg);
    dlg.showModal();
    return dlg;
  };

  /** Modal con el protocolo de respuesta de una alerta y opción de reconocerla. */
  AS.openProtocol = function (alert, onAck) {
    const zone = AS.getZone(alert.zoneId);
    const steps = AS.PROTOCOLS[alert.protocol] || AS.PROTOCOLS.default;
    AS.modal({
      title: "Protocolo de respuesta",
      body: `
        <div class="stack-sm">
          <div class="cluster-sm">${AS.badge(alert.severity === "info" ? "ok" : alert.severity, alert.type)}<span class="muted text-sm">${AS.escape(zone ? zone.name : "")} · ${AS.fmt.dateTime(alert.ts)}</span></div>
          <strong>${AS.escape(alert.title)}</strong>
          <span class="muted text-sm">${AS.escape(alert.detail || "")}</span>
        </div>
        <ol class="checklist">${steps.map((s, i) => `<li><label><input type="checkbox" name="step${i}"><span>${AS.escape(s)}</span></label></li>`).join("")}</ol>
        ${alert.ack ? `<div class="callout">${AS.icon("check", "icon-sm")}<div>Reconocida por <strong>${AS.escape(alert.ack.user)}</strong> ${AS.fmt.ago(alert.ack.ts)}${alert.ack.note ? ` — “${AS.escape(alert.ack.note)}”` : ""}</div></div>` : `
        <div class="field"><label for="ack-note">Acción tomada / observación</label><textarea class="textarea" id="ack-note" placeholder="Ej.: se verificó ventilador auxiliar, lectura confirmada con detector portátil."></textarea></div>`}
      `,
      footer: alert.ack || !alert.active
        ? `<button class="btn btn-secondary" data-close>Cerrar</button>`
        : `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ack-btn>${AS.icon("check", "icon-sm")} Reconocer alerta</button>`,
      onMount(dlg) {
        const btn = AS.qs("[data-ack-btn]", dlg);
        if (!btn) return;
        btn.addEventListener("click", () => {
          const note = AS.qs("#ack-note", dlg).value.trim();
          AS.api.ackAlert(alert.id, { note }).then(() => {
            dlg.close();
            AS.toast("Alerta reconocida y registrada en la bitácora.", "ok");
            AS.refreshAlertCount();
            if (onAck) onAck();
          });
        });
      },
    });
  };

  /** Fila de alerta reutilizable (dashboard, alertas, detalle de zona). */
  AS.alertItemHtml = function (a, { compact = false } = {}) {
    const zone = AS.getZone(a.zoneId);
    const icon = a.severity === "off" ? "wifiOff" : a.type === "Tendencia predictiva" ? "trendUp" : a.severity === "info" ? "calendar" : "alert";
    const ackInfo = a.ack ? ` · Reconocida por ${AS.escape(a.ack.user)}` : "";
    const actions = compact
      ? `<button class="btn btn-sm btn-secondary" data-protocol="${a.id}">Ver</button>`
      : `<button class="btn btn-sm btn-secondary" data-protocol="${a.id}">Protocolo</button>${a.active && !a.ack ? `<button class="btn btn-sm btn-primary" data-protocol="${a.id}">Reconocer</button>` : ""}`;
    return `
      <div class="alert-item" data-severity="${a.severity}" data-ack="${!!a.ack}">
        <div class="alert-icon">${AS.icon(icon)}</div>
        <div>
          <div class="alert-title">${AS.escape(a.title)}</div>
          <div class="alert-meta">${AS.escape(zone ? zone.name : "")} · ${a.type} · ${AS.fmt.ago(a.ts)}${ackInfo}</div>
          ${!compact && a.detail ? `<div class="alert-meta">${AS.escape(a.detail)}</div>` : ""}
        </div>
        <div class="alert-actions">${actions}</div>
      </div>`;
  };

  /** Conecta los botones [data-protocol] de un contenedor con su alerta. */
  AS.bindAlertButtons = function (root, alerts, onAck) {
    AS.qsa("[data-protocol]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const alert = alerts.find((a) => a.id === btn.dataset.protocol);
        if (alert) AS.openProtocol(alert, onAck);
      });
    });
  };
})();
