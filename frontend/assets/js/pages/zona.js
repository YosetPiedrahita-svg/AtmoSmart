(function () {
  const zoneId = AS.param("id") || "frente-2";
  const zone = AS.getZone(zoneId) || AS.ZONES[0];

  AS.mountShell({ active: "zonas", title: zone.name });
  document.title = `${zone.name} · AtmoSmart`;

  AS.qs("[data-crumb]").textContent = zone.name;
  AS.qs("[data-zone-name]").textContent = zone.name;
  AS.qs("[data-zone-meta]").textContent = `${zone.level} · ${zone.type}`;
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

  function tile(v, r) {
    const value = r.values[v.key];
    const status = r.status[v.key];
    const trend = r.trends[v.key];
    const eta = trend.etaMin != null && trend.etaMin <= 60 && trend.direction !== "flat" && status !== "crit"
      ? `<span class="badge badge-warn no-dot">≈ ${trend.etaMin} min a alarma</span>` : "";
    return `
      <button type="button" class="var-tile" data-status="${status}" data-var="${v.key}" style="text-align:left;cursor:pointer">
        <div class="var-tile-head"><span class="var-name">${v.short} <span>${v.label}</span></span>${AS.badge(status)}</div>
        <div class="var-value">${AS.fmt.value(v.key, value, false)}<small>${v.unit}</small></div>
        <div class="meter" data-status="${status}"><div class="meter-fill" style="width:${AS.meterPct(v.key, value)}%"></div></div>
        <div class="spread"><span class="var-limit">${AS.fmt.limits(v.key)}</span>${AS.trendHtml(trend)}</div>
        ${eta}
      </button>`;
  }

  function renderChart() {
    const step = state.minutes > 480 ? 10 : state.minutes > 60 ? 4 : 1;
    Promise.all([
      AS.api.getSeries({ zoneId: zone.id, varKey: state.varKey, minutes: state.minutes, step }),
      AS.api.getForecast({ zoneId: zone.id, varKey: state.varKey, minutes: 30 }),
    ]).then(([points, forecast]) => {
      AS.charts.line(AS.qs("[data-chart]"), { points, forecast, varKey: state.varKey });
    });
  }

  function refresh() {
    Promise.all([AS.api.getZoneStatus(zone.id), AS.api.getAlerts(), AS.api.getDevices()]).then(([z, alerts, devices]) => {
      const r = z.reading;
      AS.qs("[data-zone-badge]").innerHTML = AS.badge(r.zoneStatus);

      AS.qs("[data-offline]").innerHTML = r.zoneStatus === "off"
        ? `<div class="banner banner-warn"><div class="banner-icon">${AS.icon("wifiOff", "icon-lg")}</div><div class="banner-body"><div class="banner-title">Zona sin monitoreo</div><div class="banner-text">El detector fijo no reporta desde ${AS.fmt.time(r.ts)}. Mida con detector portátil y use “Registro manual” mientras se restablece.</div></div></div>`
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
        .map((d) => `<tr><td><strong class="mono text-xs">${d.id}</strong><div class="text-xs muted">${AS.escape(d.type)}${d.holder ? ` · ${AS.escape(d.holder)}` : ""}</div></td><td>${AS.badge(d.status === "off" ? "off" : "ok", d.status === "off" ? "Sin señal" : "En línea")}</td><td class="text-xs muted nowrap">${AS.fmt.ago(d.lastSeen)}</td></tr>`)
        .join("");
    });
    renderChart();
  }

  AS.live(refresh, 5000);
})();
