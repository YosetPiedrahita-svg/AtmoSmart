(function () {
  const zoneId = AS.param("id") || "frente-2";
  const zone = AS.getZone(zoneId) || AS.ZONES[0];

  AS.mountShell({ active: "zonas", title: zone.name });
  document.title = `${zone.name} · AtmoSmart`;

  AS.qs("[data-crumb]").textContent = zone.name;
  AS.qs("[data-zone-name]").textContent = zone.name;
  AS.qs("[data-zone-meta]").textContent = `${zone.level} · ${zone.type} · ${AS.norma.labor(zone.id).label} (CH₄ máx. ${AS.fmt.number(AS.norma.labor(zone.id).ch4, 1)} %) · ${AS.norma.ventilacion(zone.id).label}`;
  AS.qs("[data-history-link]").href = `historial.html?zona=${zone.id}`;
  AS.qs("[data-manual]").addEventListener("click", () => AS.openManualEntry(zone.id, refresh));

  const select = AS.qs("#var-select");
  select.innerHTML = AS.VARIABLES.map((v) => `<option value="${v.key}">${v.label} (${v.unit})</option>`).join("");
  let state = { varKey: AS.param("var") || "ch4", minutes: 60 };
  select.value = state.varKey;

  select.addEventListener("change", () => {
    state.varKey = select.value;
    renderChart();
  });
  AS.qsa("[data-range] button").forEach((btn) =>
    btn.addEventListener("click", () => {
      AS.qsa("[data-range] button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      state.minutes = Number(btn.dataset.min);
      renderChart();
    })
  );

  /** Información normativa adicional de la variable: exposición, permanencia o calidad. */
  function extra(v, r) {
    const k = v.key;
    if (r.quality[k] === "calibracion_vencida") return `<span class="badge badge-off no-dot">Calibración vencida: lectura no válida</span>`;
    if (k === "te" && r.permanencia) return `<span class="badge ${r.status.te === "ok" ? "badge-ok" : r.status.te === "warn" ? "badge-warn" : "badge-crit"} no-dot">Permanencia: ${AS.escape(r.permanencia.texto)}</span>`;
    const ex = r.exposure[k];
    if (ex) {
      const parts = [];
      if (ex.twaLim != null) parts.push(`Jornada ${AS.fmt.number(ex.twa, v.decimals)}/${AS.fmt.number(ex.twaLim, v.decimals)}`);
      if (ex.stelLim != null) parts.push(`15 min ${AS.fmt.number(ex.stel, v.decimals)}/${AS.fmt.number(ex.stelLim, v.decimals)}`);
      return `<span class="badge ${ex.status === "ok" ? "badge-ok" : ex.status === "warn" ? "badge-warn" : "badge-crit"} no-dot" style="white-space:normal;line-height:1.35;height:auto;padding-block:2px" title="Exposición (Art. 39): promedio de la jornada en curso y de los últimos 15 minutos frente al TLV">${parts.join(" · ")}</span>`;
    }
    return "";
  }

  function tile(v, r) {
    const value = r.values[v.key];
    const status = r.status[v.key];
    const trend = r.trends[v.key];
    const badgeText = r.quality[v.key] === "calibracion_vencida" ? "No disponible" : v.role === "input" && status !== "off" ? "Dato" : undefined;
    const eta = trend.etaMin != null && trend.etaMin <= 60 && trend.direction !== "flat" && status !== "crit" && status !== "off"
      ? `<span class="badge badge-warn no-dot">≈ ${trend.etaMin} min a alarma</span>` : "";
    return `
      <button type="button" class="var-tile" data-status="${status}" data-var="${v.key}" style="text-align:left;cursor:pointer">
        <div class="var-tile-head"><span class="var-name">${v.short} <span>${v.label}</span></span>${AS.badge(status, badgeText)}</div>
        <div class="var-value">${AS.fmt.value(v.key, value, false)}<small>${v.unit}</small></div>
        <div class="meter" data-status="${status}"><div class="meter-fill" style="width:${AS.meterPct(v.key, value)}%"></div></div>
        <div class="spread"><span class="var-limit">${AS.escape(AS.fmt.limits(v.key, zone.id))}</span>${AS.trendHtml(trend)}</div>
        ${extra(v, r)}${eta}
      </button>`;
  }

  function renderChart() {
    const step = state.minutes > 480 ? 10 : state.minutes > 60 ? 4 : 1;
    Promise.all([
      AS.api.getSeries({ zoneId: zone.id, varKey: state.varKey, minutes: state.minutes, step }),
      AS.api.getForecast({ zoneId: zone.id, varKey: state.varKey, minutes: 30 }),
    ]).then(([points, forecast]) => {
      AS.charts.line(AS.qs("[data-chart]"), { points, forecast, varKey: state.varKey, zoneId: zone.id });
    });
  }

  function refresh() {
    Promise.all([AS.api.getZoneStatus(zone.id), AS.api.getAlerts(), AS.api.getDevices()]).then(([z, alerts, devices]) => {
      const r = z.reading;
      AS.qs("[data-zone-badge]").innerHTML = AS.badge(r.zoneStatus) +
        (r.fanRunning == null ? "" : ` ${r.fanRunning ? AS.badge("ok", "Ventilador auxiliar en marcha") : AS.badge("crit", "Ventilador auxiliar detenido")}`);

      AS.qs("[data-offline]").innerHTML = r.offline
        ? `<div class="banner banner-warn"><div class="banner-icon">${AS.icon("wifiOff", "icon-lg")}</div><div class="banner-body"><div class="banner-title">Zona sin monitoreo</div><div class="banner-text">El detector fijo no reporta desde ${AS.fmt.time(r.ts)}. Mida con detector portátil y use “Registro manual” mientras se restablece.</div></div></div>`
        : r.calibrationExpired
          ? `<div class="banner banner-warn"><div class="banner-icon">${AS.icon("alert", "icon-lg")}</div><div class="banner-body"><div class="banner-title">Gases sin lectura válida</div><div class="banner-text">Un sensor de gas tiene la calibración vencida hace ${r.calibrationExpired} días. Sus lecturas se muestran como “no disponible”, nunca como seguras. Mida con detector portátil calibrado y use “Registro manual”.</div></div></div>`
          : "";

      const tiles = AS.qs("[data-tiles]");
      tiles.innerHTML = AS.VARIABLES.map((v) => tile(v, r)).join("");
      AS.qsa("[data-var]", tiles).forEach((b) =>
        b.addEventListener("click", () => {
          state.varKey = b.dataset.var;
          select.value = state.varKey;
          renderChart();
          AS.qs("[data-chart]").scrollIntoView({ behavior: "smooth", block: "center" });
        })
      );

      const zoneAlerts = alerts.filter((a) => a.zoneId === zone.id).slice(0, 6);
      const box = AS.qs("[data-alerts]");
      box.innerHTML = zoneAlerts.length
        ? zoneAlerts.map((a) => AS.alertItemHtml(a, { compact: true })).join("")
        : `<div class="empty">${AS.icon("shield", "icon-lg")}Sin alertas en esta zona</div>`;
      AS.bindAlertButtons(box, alerts, refresh);

      AS.qs("[data-devices]").innerHTML = devices
        .filter((d) => d.zoneId === zone.id)
        .map((d) => `<tr><td><strong class="mono text-xs">${d.id}</strong><div class="text-xs muted">${AS.escape(d.type)}${d.holder ? ` · ${AS.escape(d.holder)}` : ""}</div></td><td>${d.status === "ok" ? AS.badge("ok", "En línea") : AS.badge("off", d.status === "pending" ? "Sin datos aún" : "Sin señal")}</td><td class="text-xs muted nowrap">${AS.fmt.ago(d.lastSeen)}</td></tr>`)
        .join("");
    });
    renderChart();
  }

  AS.live(refresh, 5000);
})();
