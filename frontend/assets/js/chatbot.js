/* ==========================================================================
   AtmoSmart — Asistente conversacional (por reglas, sin IA)

   Botón flotante que abre un chat. Responde preguntas sobre los datos que ya
   expone AS.api (zonas, alertas, sensores, turno) interpretando palabras clave.
   Solo lectura: no reconoce alertas ni modifica nada.

   Funciona sin Internet. Si luego se conecta un modelo de lenguaje, basta con
   reemplazar AS.chatbot.reply(texto, datos) por una llamada al backend.
   ========================================================================== */

(function () {
  "use strict";

  const STORE_KEY = "atmosmart:chat";
  const MAX_SAVED = 40;
  const SEV_RANK = { crit: 3, warn: 2, off: 1, info: 0 };

  /* ---------- Lenguaje: normalización y alias ---------- */

  const SUBSCRIPTS = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[₀-₉]/g, (c) => SUBSCRIPTS[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  const ZONE_ALIASES = {
    "bocamina": ["bocamina", "entrada", "portal"],
    "galeria-1": ["galeria principal", "galeria n1", "galeria 1", "principal n1"],
    "frente-1": ["frente 1", "frente1", "frente uno", "explotacion 1"],
    "inclinado": ["inclinado", "tambor"],
    "galeria-2": ["galeria n2", "galeria 2"],
    "frente-2": ["frente 2", "frente2", "frente dos", "explotacion 2"],
    "bombeo": ["bombeo", "bomba"],
    "retorno": ["chimenea", "retorno"],
  };

  // Frases (contenidas en el texto) y palabras exactas (para siglas cortas como "co")
  const VAR_PHRASES = {
    o2: ["oxigeno"],
    ch4: ["metano", "grisu"],
    co2: ["dioxido de carbono"],
    no2: ["dioxido de nitrogeno"],
    co: ["monoxido"],
    h2s: ["sulfuro", "sulfhidrico"],
    temp: ["temperatura", "calor"],
    hr: ["humedad"],
    air: ["velocidad del aire", "caudal", "ventilacion", "viento"],
    pm: ["polvo", "particulado"],
  };
  const VAR_WORDS = { o2: ["o2"], ch4: ["ch4"], co: ["co"], co2: ["co2"], h2s: ["h2s"], no2: ["no2"], temp: ["temp"], pm: ["pm"] };

  const has = (q, re) => re.test(q);

  function findZones(q) {
    const found = Object.keys(ZONE_ALIASES).filter((id) => ZONE_ALIASES[id].some((a) => q.includes(a)));
    if (!found.length && has(q, /\bfrentes\b/)) return ["frente-1", "frente-2"];
    return found;
  }

  function findVar(q) {
    const words = q.split(/[^a-z0-9]+/);
    return Object.keys(VAR_PHRASES).find(
      (k) => VAR_PHRASES[k].some((p) => q.includes(p)) || (VAR_WORDS[k] || []).some((w) => words.includes(w))
    ) || null;
  }

  /* ---------- Utilidades de respuesta ---------- */

  const esc = (s) => AS.escape(s);
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const zoneName = (id) => (AS.getZone(id) ? AS.getZone(id).name : id);
  const varLabel = (key) => (AS.getVariable(key) ? AS.getVariable(key).label : key);
  const val = (key, v) => AS.fmt.value(key, v);
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const link = (href, text) => `<a href="${href}">${esc(text)}</a>`;
  const sevBadge = (sev) => (AS.STATUS[sev] ? AS.badge(sev) : '<span class="badge">Aviso</span>');
  const bySeverity = (a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (b.ts - a.ts);
  const isPending = (a) => a.active && !a.ack && a.severity !== "info";

  function joinNames(ids) {
    const names = ids.map((id) => esc(zoneName(id)));
    if (names.length <= 1) return names.join("");
    return names.slice(0, -1).join(", ") + " y " + names[names.length - 1];
  }

  function trendText(tr) {
    if (!tr || tr.direction === "flat") return "estable";
    const way = tr.direction === "up" ? "subiendo" : "bajando";
    return tr.etaMin != null ? `${way}; alcanzaría la alarma en ~${tr.etaMin} min` : way;
  }

  /* ---------- Respuestas ---------- */

  function replyHelp() {
    return {
      html:
        "<p>Hola, soy el asistente de AtmoSmart. Leo los datos de la mina (zonas, alertas, sensores y personal) y te los explico.</p>" +
        "<p>Puedes preguntarme, por ejemplo, cómo está la mina, qué alertas hay, cómo está el Frente 2, dónde está más alto el metano o qué sensores fallan.</p>",
      chips: ["¿Cómo está la mina?", "¿Qué alertas hay?", "¿Hay tendencias peligrosas?", "¿Qué sensores fallan?"],
    };
  }

  function replySummary(d) {
    const zones = d.zones;
    const by = (s) => zones.filter((z) => z.reading.zoneStatus === s);
    const warn = by("warn"), crit = by("crit"), off = by("off"), ok = by("ok");
    const worst = crit.length ? "crit" : warn.length ? "warn" : off.length ? "off" : "ok";
    const parts = [`${ok.length} de ${zones.length} zonas están normales`];
    if (crit.length) parts.push(`${pl(crit.length, "en alarma", "en alarma")} (${joinNames(crit.map((z) => z.id))})`);
    if (warn.length) parts.push(`${pl(warn.length, "en precaución", "en precaución")} (${joinNames(warn.map((z) => z.id))})`);
    if (off.length) parts.push(`${pl(off.length, "sin señal", "sin señal")} (${joinNames(off.map((z) => z.id))})`);

    const pending = d.alerts.filter(isPending);
    const exposed = zones.filter((z) => z.reading.zoneStatus !== "ok").reduce((n, z) => n + z.reading.workers, 0);
    const online = d.devices.filter((x) => x.status === "ok").length;
    const eta = d.alerts.filter((a) => a.active && a.type === "Tendencia predictiva").sort(bySeverity)[0];

    const lines = [
      `${pl(pending.length, "alerta sin reconocer", "alertas sin reconocer")}.`,
      `${pl(exposed, "persona", "personas")} en zonas con riesgo o sin monitoreo, de ${d.shift.workersInside} en interior (${esc(d.shift.shift)}, ${d.shift.from}–${d.shift.to}).`,
      `${online} de ${d.devices.length} equipos en línea.`,
    ];
    if (eta) lines.unshift(`Ojo: ${esc(zoneName(eta.zoneId))}: ${esc(eta.title.toLowerCase())}.`);

    return {
      html: `<p><strong>Condición general: ${AS.badge(worst)}</strong></p><p>${parts.join("; ")}.</p>${list(lines)}`,
      chips: ["¿Qué alertas hay?", "¿Qué hago ahora?", "¿Dónde hay personas en riesgo?"],
    };
  }

  function replyAlerts(d, zoneIds, key) {
    let items = d.alerts.filter((a) => a.active);
    if (zoneIds.length) items = items.filter((a) => zoneIds.includes(a.zoneId));
    if (key) items = items.filter((a) => a.varKey === key);
    items.sort(bySeverity);
    const scopeParts = [zoneIds.length ? `en ${joinNames(zoneIds)}` : "", key ? `de ${esc(varLabel(key).toLowerCase())}` : ""].filter(Boolean);
    const scope = scopeParts.length ? " " + scopeParts.join(" ") : "";
    if (!items.length) {
      return { html: `<p>No hay alertas activas${scope}.</p>`, chips: ["¿Cómo está la mina?"] };
    }
    const shown = items.slice(0, 6).map(
      (a) =>
        `${sevBadge(a.severity)} <strong>${esc(zoneName(a.zoneId))}</strong>: ${esc(a.title)}. ${esc(a.detail || "")}` +
        ` <span class="muted">(${AS.fmt.ago(a.ts)}${a.ack ? ", reconocida" : ""})</span>`
    );
    const more = items.length > shown.length ? `<p>Y ${items.length - shown.length} más en ${link("alertas.html", "Alertas")}.</p>` : "";
    return {
      html: `<p>Hay ${pl(items.length, "alerta activa", "alertas activas")}${scope}, de la más grave a la menos grave:</p>` + list(shown) + more,
      chips: ["¿Qué hago ahora?", "¿Hay tendencias peligrosas?"],
    };
  }

  function zoneLine(z) {
    const r = z.reading;
    if (r.zoneStatus === "off") return `${AS.badge("off")} La zona no está siendo monitoreada; última lectura ${AS.fmt.ago(r.ts)}.`;
    const bad = AS.VARIABLES.filter((v) => r.status[v.key] === "warn" || r.status[v.key] === "crit");
    const detail = (bad.length ? bad : AS.VARIABLES.filter((v) => AS.KEY_VARIABLES.includes(v.key)))
      .map((v) => `${esc(v.short)} ${val(v.key, r.values[v.key])}`)
      .join(", ");
    return `${AS.badge(r.zoneStatus)} ${detail}.`;
  }

  function replyZone(d, zoneIds, key) {
    const zones = zoneIds.map((id) => d.zones.find((z) => z.id === id)).filter(Boolean);
    if (zones.length > 1 || (zones.length === 1 && key)) {
      const rows = zones.map((z) => {
        if (key) {
          const v = z.reading.values[key];
          if (v == null) return `<strong>${esc(z.name)}</strong>: sin lectura de ${esc(varLabel(key).toLowerCase())}.`;
          return `<strong>${esc(z.name)}</strong>: ${esc(varLabel(key))} ${val(key, v)} ${AS.badge(z.reading.status[key])}, ${trendText(z.reading.trends[key])}. Límite: ${esc(AS.fmt.limits(key))}.`;
        }
        return `<strong>${link("zona.html?id=" + z.id, z.name)}</strong>: ${zoneLine(z)}`;
      });
      return { html: list(rows), chips: ["¿Qué hago ahora?", "¿Qué alertas hay?"] };
    }
    const z = zones[0];
    const r = z.reading;
    const alerts = d.alerts.filter((a) => a.active && a.zoneId === z.id).sort(bySeverity);
    let html = `<p><strong>${link("zona.html?id=" + z.id, z.name)}</strong> · ${esc(z.level)} · ${esc(z.type)}</p><p>${zoneLine(z)}</p>`;
    if (r.zoneStatus !== "off") {
      const moving = AS.VARIABLES.filter((v) => r.trends[v.key].direction !== "flat");
      if (moving.length) html += `<p>Tendencias: ${moving.map((v) => `${esc(v.short)} ${trendText(r.trends[v.key])}`).join("; ")}.</p>`;
    }
    html += `<p>${pl(r.workers, "persona", "personas")} en la zona.</p>`;
    html += alerts.length ? `<p>Alertas activas:</p>` + list(alerts.map((a) => `${sevBadge(a.severity)} ${esc(a.title)}`)) : "<p>Sin alertas activas.</p>";
    return { html, chips: ["¿Qué hago ahora?", "¿Cómo está la mina?"] };
  }

  function replyVariable(d, key) {
    const v = AS.getVariable(key);
    const lowIsBad = AS.getThresholds(key).highWarn == null && AS.getThresholds(key).highCrit == null || key === "o2" || key === "air";
    const rows = d.zones
      .filter((z) => z.reading.values[key] != null)
      .sort((a, b) => (lowIsBad ? a.reading.values[key] - b.reading.values[key] : b.reading.values[key] - a.reading.values[key]));
    if (!rows.length) return { html: `<p>No hay lecturas de ${esc(v.label.toLowerCase())} en este momento.</p>`, chips: ["¿Qué sensores fallan?"] };
    const top = rows[0];
    const flagged = rows.filter((z) => z.reading.status[key] !== "ok");
    const head = flagged.length
      ? `<p>${esc(v.label)}: ${pl(flagged.length, "zona fuera de lo normal", "zonas fuera de lo normal")}. El valor más ${lowIsBad ? "bajo" : "alto"} está en <strong>${esc(top.name)}</strong>.</p>`
      : `<p>${esc(v.label)} está dentro de lo normal en todas las zonas con lectura. El valor más ${lowIsBad ? "bajo" : "alto"} está en <strong>${esc(top.name)}</strong>.</p>`;
    const lines = rows.slice(0, 3).map(
      (z) => `<strong>${esc(z.name)}</strong>: ${val(key, z.reading.values[key])} ${AS.badge(z.reading.status[key])}, ${trendText(z.reading.trends[key])}`
    );
    return {
      html: head + list(lines) + `<p>Límites de referencia: ${esc(AS.fmt.limits(key))}.</p>`,
      chips: ["¿Hay tendencias peligrosas?", "¿Qué alertas hay?"],
    };
  }

  function replyFlagged(d) {
    const rows = [];
    d.zones.forEach((z) => {
      AS.VARIABLES.forEach((v) => {
        const s = z.reading.status[v.key];
        if (s === "warn" || s === "crit") rows.push({ s, text: `<strong>${esc(z.name)}</strong>: ${esc(v.label)} ${val(v.key, z.reading.values[v.key])} ${AS.badge(s)}` });
      });
    });
    if (!rows.length) return { html: "<p>Ninguna variable está fuera de sus límites ahora mismo.</p>", chips: ["¿Cómo está la mina?"] };
    rows.sort((a, b) => SEV_RANK[b.s] - SEV_RANK[a.s]);
    return { html: `<p>Variables fuera de sus límites ahora:</p>` + list(rows.map((r) => r.text)), chips: ["¿Qué hago ahora?", "¿Hay tendencias peligrosas?"] };
  }

  function replyTrends(d, zoneIds, key) {
    const rows = [];
    d.zones.forEach((z) => {
      if (zoneIds.length && !zoneIds.includes(z.id)) return;
      AS.VARIABLES.forEach((v) => {
        if (key && v.key !== key) return;
        const tr = z.reading.trends[v.key];
        if (tr.direction !== "flat") rows.push({ eta: tr.etaMin, text: `<strong>${esc(z.name)}</strong>: ${esc(v.label)} ${trendText(tr)}. Valor actual ${val(v.key, z.reading.values[v.key])}.` });
      });
    });
    if (!rows.length) return { html: "<p>Ninguna variable muestra una tendencia significativa en los últimos 15 minutos.</p>", chips: ["¿Cómo está la mina?"] };
    rows.sort((a, b) => (a.eta == null) - (b.eta == null) || (a.eta || 0) - (b.eta || 0));
    return { html: `<p>Estas variables se están moviendo (ventana de 15 min), las más urgentes primero:</p>` + list(rows.slice(0, 6).map((r) => r.text)), chips: ["¿Qué hago ahora?", "¿Qué alertas hay?"] };
  }

  function replyPeople(d, zoneIds) {
    let zones = d.zones.filter((z) => z.reading.workers > 0);
    if (zoneIds.length) zones = zones.filter((z) => zoneIds.includes(z.id));
    const risky = zones.filter((z) => z.reading.zoneStatus !== "ok");
    const total = d.shift.workersInside;
    if (!risky.length) return { html: `<p>No hay personas en zonas con riesgo o sin monitoreo. En total hay ${total} en interior.</p>`, chips: ["¿Cómo está la mina?"] };
    const n = risky.reduce((s, z) => s + z.reading.workers, 0);
    const lines = risky.sort((a, b) => AS.STATUS_RANK[b.reading.zoneStatus] - AS.STATUS_RANK[a.reading.zoneStatus]).map((z) => `<strong>${esc(z.name)}</strong>: ${pl(z.reading.workers, "persona", "personas")} ${AS.badge(z.reading.zoneStatus)}`);
    return { html: `<p>${pl(n, "persona está", "personas están")} en zonas con riesgo o sin monitoreo (de ${total} en interior):</p>` + list(lines), chips: ["¿Qué hago ahora?", "¿Qué alertas hay?"] };
  }

  function replyDevices(d, zoneIds) {
    let devs = d.devices;
    if (zoneIds.length) devs = devs.filter((x) => zoneIds.includes(x.zoneId));
    const name = (x) => `<strong>${esc(x.id)}</strong> (${esc(x.type)}, ${esc(zoneName(x.zoneId))})`;
    const off = devs.filter((x) => x.status !== "ok");
    const low = devs.filter((x) => x.battery != null && x.battery < 20);
    const cal = devs.filter((x) => x.calDays != null && x.calDays <= 7);
    const lines = [];
    off.forEach((x) => lines.push(`Sin señal: ${name(x)}, última comunicación ${AS.fmt.ago(x.lastSeen)}.`));
    low.forEach((x) => lines.push(`Batería baja (${x.battery} %): ${name(x)}.`));
    cal.forEach((x) => lines.push(`Calibración ${x.calDays < 0 ? `vencida hace ${-x.calDays} días` : `en ${x.calDays} días`}: ${name(x)}.`));
    const head = `<p>${devs.filter((x) => x.status === "ok").length} de ${devs.length} equipos están en línea.</p>`;
    if (!lines.length) return { html: head + "<p>Ninguno tiene batería baja ni calibración vencida o próxima (7 días).</p>", chips: ["¿Cómo está la mina?"] };
    return { html: head + list(lines) + `<p>Detalle en ${link("dispositivos.html", "Sensores y equipos")}.</p>`, chips: ["¿Qué hago ahora?", "¿Qué alertas hay?"] };
  }

  function replyHistory(d, zoneIds) {
    let items = d.alerts.filter((a) => !a.active);
    if (zoneIds.length) items = items.filter((a) => zoneIds.includes(a.zoneId));
    if (!items.length) return { html: "<p>No hay eventos resueltos en el historial reciente.</p>", chips: ["¿Cómo está la mina?"] };
    const lines = items.sort((a, b) => b.ts - a.ts).map((a) => `${sevBadge(a.severity)} <strong>${esc(zoneName(a.zoneId))}</strong>: ${esc(a.title)}. ${esc(a.detail || "")} <span class="muted">(${AS.fmt.ago(a.ts)})</span>`);
    return { html: `<p>Eventos ya resueltos:</p>` + list(lines) + `<p>Más datos en ${link("historial.html", "Historial")}.</p>`, chips: ["¿Cómo está la mina?"] };
  }

  function replyLimits(key) {
    if (!key) {
      const rows = AS.VARIABLES.map((v) => `<strong>${esc(v.label)}</strong>: ${esc(AS.fmt.limits(v.key))}`);
      return { html: "<p>Límites de alarma de referencia por variable:</p>" + list(rows) + limitsNote(), chips: ["¿Qué alertas hay?"] };
    }
    const v = AS.getVariable(key);
    const t = AS.getThresholds(key);
    const f = (x) => AS.fmt.number(x, v.decimals);
    const rows = [];
    if (t.lowCrit != null) rows.push(`Alarma si baja de ${f(t.lowCrit)} ${esc(v.unit)}`);
    if (t.lowWarn != null) rows.push(`Precaución si baja de ${f(t.lowWarn)} ${esc(v.unit)}`);
    if (t.highWarn != null) rows.push(`Precaución desde ${f(t.highWarn)} ${esc(v.unit)}`);
    if (t.highCrit != null) rows.push(`Alarma desde ${f(t.highCrit)} ${esc(v.unit)}`);
    return { html: `<p>Límites de ${esc(v.label.toLowerCase())}:</p>` + list(rows) + limitsNote(), chips: ["¿Qué alertas hay?"] };
  }

  const limitsNote = () => '<p class="muted">Son valores de referencia del prototipo; Ingeniería de Minas debe validarlos contra el Decreto 1886 de 2015.</p>';

  function replyProtocol(d, zoneIds, key) {
    let items = d.alerts.filter((a) => a.active);
    if (zoneIds.length) items = items.filter((a) => zoneIds.includes(a.zoneId));
    if (key) items = items.filter((a) => a.varKey === key);
    items.sort(bySeverity);
    const a = items[0];
    if (!a) return { html: "<p>No hay alertas activas que requieran un protocolo en este momento.</p>", chips: ["¿Cómo está la mina?"] };
    const steps = (AS.PROTOCOLS[a.protocol] || AS.PROTOCOLS.default).filter((s) => typeof s === "string");
    return {
      html:
        `<p>Alerta más urgente: ${sevBadge(a.severity)} <strong>${esc(zoneName(a.zoneId))}</strong>: ${esc(a.title)}.</p><p>Protocolo de referencia:</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` +
        `<p class="muted">Es una guía de referencia: sigue el protocolo oficial de la mina y las instrucciones del supervisor. Para reconocer la alerta ve a ${link("alertas.html", "Alertas")}.</p>`,
      chips: ["¿Qué alertas hay?", "¿Dónde hay personas en riesgo?"],
    };
  }

  function replyFallback() {
    return {
      html: "<p>No estoy seguro de haber entendido. Puedo responder sobre el estado de la mina, una zona (por ejemplo, Frente 2), una variable (metano, CO, polvo…), alertas, tendencias, personal en riesgo, sensores, límites o el historial.</p>",
      chips: ["¿Cómo está la mina?", "¿Qué alertas hay?", "¿Qué sensores fallan?"],
    };
  }

  /* ---------- Intérprete ---------- */

  const ctx = { zoneIds: [], key: null };

  function reply(text, d) {
    const q = norm(text);
    let zoneIds = findZones(q);
    let key = findVar(q);

    // Seguimiento: "¿y ahí?", "¿y el metano allí?" reutiliza la última zona
    if (!zoneIds.length && has(q, /\b(ahi|alli|esa zona|ese frente|la misma|misma zona)\b/)) zoneIds = ctx.zoneIds;
    if (!key && has(q, /\b(eso|esa variable|el mismo gas)\b/)) key = ctx.key;
    if (zoneIds.length) ctx.zoneIds = zoneIds;
    if (key) ctx.key = key;

    if (has(q, /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ayuda|help)\b/) || has(q, /que (puedes|sabes|haces)|como funcionas|para que sirves/)) return replyHelp();
    if (has(q, /^(gracias|muchas gracias|vale|listo|ok|perfecto)\b/)) return { html: "<p>¡Con gusto! Si necesitas algo más de los datos de la mina, aquí estoy.</p>", chips: ["¿Cómo está la mina?"] };
    if (has(q, /protocolo|que hago|que debo hacer|como actuo|como actuar|recomend|que accion|que medidas/)) return replyProtocol(d, zoneIds, key);
    if (has(q, /tendencia|predic|ascenso|subiendo|aumentando|bajando|alcanzaria|cuanto tiempo|en cuantos minutos|proyecc|pronostic/)) return replyTrends(d, zoneIds, key);
    if (has(q, /personal|personas|trabajador|gente|minero|expuest|evacuar|evacuacion|cuantos hay/)) return replyPeople(d, zoneIds);
    if (has(q, /sensor|equipo|dispositivo|bateria|calibra|gateway|detector|sin senal|comunicacion|fallan?|falla/) && !has(q, /alerta/)) return replyDevices(d, zoneIds);
    if (has(q, /limite|umbral|permitido|maximo|minimo|norma\b/)) return replyLimits(key);
    if (has(q, /historial|resuelt|que paso|ocurrio|voladura|anterior|ultimas horas|ya paso/)) return replyHistory(d, zoneIds);
    if (has(q, /alerta|alarma|critic|urgente|prioridad|grave|peligro|aviso/)) {
      if (has(q, /que zona|cual zona|donde|mas critic|peor/) && !zoneIds.length) return replyFlagged(d);
      return replyAlerts(d, zoneIds, key);
    }
    if (has(q, /fuera de|excede|supera|gases|que variables|lecturas anormales|anormal/) && !zoneIds.length && !key) return replyFlagged(d);
    if (zoneIds.length) return replyZone(d, zoneIds, key);
    if (key) return replyVariable(d, key);
    if (has(q, /resumen|estado|como esta|como va|situacion|panorama|condicion|turno|mina|todo bien/)) return replySummary(d);
    return replyFallback();
  }

  function loadData() {
    return Promise.all([AS.api.getZonesStatus(), AS.api.getAlerts(), AS.api.getDevices(), AS.api.getShiftSummary()]).then(
      ([zones, alerts, devices, shift]) => ({ zones, alerts, devices, shift })
    );
  }

  AS.chatbot = { reply, norm };

  /* ---------- Interfaz ---------- */

  const CHAT_ICON =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  const CLOSE_ICON =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function readSaved() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function writeSaved(arr) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(-MAX_SAVED)));
    } catch (e) {
      /* almacenamiento no disponible: se ignora */
    }
  }

  AS.mountChatbot = function () {
    if (document.querySelector("[data-chatbot]")) return;

    const root = document.createElement("div");
    root.className = "chatbot";
    root.setAttribute("data-chatbot", "");
    root.innerHTML = `
      <button class="chatbot-fab" type="button" aria-label="Abrir asistente" aria-expanded="false" aria-controls="chatbot-panel">${CHAT_ICON}</button>
      <section class="chatbot-panel" id="chatbot-panel" role="dialog" aria-label="Asistente AtmoSmart" hidden>
        <header class="chatbot-head">
          <div><strong>Asistente AtmoSmart</strong><small>Responde con los datos de la mina</small></div>
          <div class="chatbot-head-actions">
            <button class="chatbot-link" type="button" data-chat-reset>Nueva conversación</button>
            <button class="icon-btn" type="button" aria-label="Cerrar asistente" data-chat-close>${CLOSE_ICON}</button>
          </div>
        </header>
        <div class="chatbot-log" role="log" aria-live="polite" tabindex="0"></div>
        <div class="chatbot-chips" data-chat-chips></div>
        <form class="chatbot-form" autocomplete="off">
          <input class="input" type="text" name="q" maxlength="200" placeholder="Pregunta sobre la mina…" aria-label="Escribe tu pregunta" enterkeyhint="send">
          <button class="btn btn-primary" type="submit">Enviar</button>
        </form>
        <p class="chatbot-note">Asistente por reglas: solo usa los datos de AtmoSmart y no reemplaza al supervisor ni a los protocolos.</p>
      </section>`;
    document.body.appendChild(root);

    const fab = root.querySelector(".chatbot-fab");
    const panel = root.querySelector(".chatbot-panel");
    const log = root.querySelector(".chatbot-log");
    const chips = root.querySelector("[data-chat-chips]");
    const form = root.querySelector("form");
    const input = form.elements.q;

    let saved = readSaved();

    function addMessage(role, html, { persist = true } = {}) {
      const el = document.createElement("div");
      el.className = `chatbot-msg chatbot-msg-${role}`;
      if (role === "user") el.textContent = html;
      else el.innerHTML = html;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      if (persist) {
        saved.push({ role, html });
        writeSaved(saved);
      }
      return el;
    }

    function setChips(labels) {
      chips.innerHTML = "";
      (labels || []).forEach((label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chatbot-chip";
        b.textContent = label;
        b.addEventListener("click", () => ask(label));
        chips.appendChild(b);
      });
    }

    function ask(text) {
      const clean = String(text || "").trim();
      if (!clean) return;
      addMessage("user", clean);
      setChips([]);
      const pending = addMessage("bot", "<p>Consultando los datos…</p>", { persist: false });
      loadData()
        .then((d) => reply(clean, d))
        .catch(() => ({ html: "<p>No pude leer los datos en este momento. Intenta de nuevo en unos segundos.</p>", chips: [] }))
        .then((res) => {
          pending.remove();
          addMessage("bot", res.html);
          setChips(res.chips);
        });
    }

    function start() {
      log.innerHTML = "";
      if (saved.length) {
        saved.forEach((m) => addMessage(m.role, m.html, { persist: false }));
        setChips(["¿Cómo está la mina?", "¿Qué alertas hay?"]);
      } else {
        const h = replyHelp();
        addMessage("bot", h.html);
        setChips(h.chips);
      }
    }

    function open() {
      panel.hidden = false;
      root.classList.add("is-open");
      fab.setAttribute("aria-expanded", "true");
      fab.setAttribute("aria-label", "Cerrar asistente");
      input.focus();
      log.scrollTop = log.scrollHeight;
    }
    function close() {
      panel.hidden = true;
      root.classList.remove("is-open");
      fab.setAttribute("aria-expanded", "false");
      fab.setAttribute("aria-label", "Abrir asistente");
      fab.focus();
    }

    fab.addEventListener("click", () => (panel.hidden ? open() : close()));
    root.querySelector("[data-chat-close]").addEventListener("click", close);
    root.querySelector("[data-chat-reset]").addEventListener("click", () => {
      saved = [];
      writeSaved(saved);
      ctx.zoneIds = [];
      ctx.key = null;
      start();
      input.focus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden && !document.querySelector(".modal-backdrop, .modal")) close();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value;
      input.value = "";
      ask(text);
    });

    start();
  };
})();
