(function () {
  AS.mountShell({ active: "dashboard", title: "Panel general" });
  AS.qsa("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", AS.icon(el.dataset.icon, "icon-sm")));

  const SEVERITY_ORDER = { crit: 0, off: 1, warn: 2, info: 3 };
  const sparkCache = {};

  function renderBanner(zones, alerts) {
    const crit = zones.filter((z) => z.reading.zoneStatus === "crit");
    const warn = zones.filter((z) => z.reading.zoneStatus === "warn");
    const off = zones.filter((z) => z.reading.zoneStatus === "off");
    const predictive = alerts.filter((a) => a.active && a.type === "Tendencia predictiva");

    let kind = "ok";
    let title = "Condición general: segura";
    let text = "Todas las zonas monitoreadas están dentro de los límites.";
    if (warn.length || off.length) {
      kind = "warn";
      title = "Condición general: precaución";
      text = [
        warn.length && `${warn.length} zona(s) en precaución: ${warn.map((z) => z.name).join(", ")}.`,
        off.length && `${off.map((z) => z.name).join(", ")} sin señal o sin lectura válida.`,
      ].filter(Boolean).join(" ");
    }
    if (crit.length) {
      kind = "crit";
      title = "Condición general: ALARMA";
      text = `Alarma en ${crit.map((z) => z.name).join(", ")}. Aplicar protocolo y evacuar si corresponde.`;
    }
    const forecast = predictive[0]
      ? `<a class="btn btn-sm ${kind === "crit" ? "btn-danger" : "btn-secondary"}" href="zona.html?id=${predictive[0].zoneId}">${AS.icon("trendUp", "icon-sm")} ${AS.escape(AS.getZone(predictive[0].zoneId).name)}: ${AS.escape(predictive[0].title.split(": ")[1] || "ver tendencia")}</a>`
      : "";

    AS.qs("[data-banner]").innerHTML = `
      <div class="banner banner-${kind}" role="status">
        <div class="banner-icon">${AS.icon(kind === "ok" ? "shield" : "alert", "icon-lg")}</div>
        <div class="banner-body"><div class="banner-title">${title}</div><div class="banner-text">${AS.escape(text)}</div></div>
        ${forecast}
      </div>`;
  }

  function renderKpis(zones, alerts, devices) {
    const safe = zones.filter((z) => z.reading.zoneStatus === "ok").length;
    const pending = alerts.filter((a) => a.active && !a.ack && a.severity !== "info");
    const risky = zones.filter((z) => z.reading.zoneStatus !== "ok");
    const exposed = risky.reduce((n, z) => n + z.reading.workers, 0);
    const online = devices.filter((d) => d.status === "ok").length;

    AS.qs('[data-kpi="zones"]').innerHTML = `${safe}<small> / ${zones.length}</small>`;
    AS.qs('[data-kpi-hint="zones"]').textContent = `${zones.length - safe} requieren atención`;
    AS.qs('[data-kpi="alerts"]').textContent = pending.length;
    AS.qs('[data-kpi-hint="alerts"]').textContent = `${pending.filter((a) => a.severity === "crit").length} de alarma · ${pending.filter((a) => a.type === "Tendencia predictiva").length} predictivas`;
    AS.qs('[data-kpi="exposed"]').textContent = exposed;
    AS.qs('[data-kpi-hint="exposed"]').textContent = risky.length ? risky.map((z) => `${z.name} (${z.reading.workers})`).join(", ") : "Nadie expuesto";
    AS.qs('[data-kpi="devices"]').innerHTML = `${online}<small> / ${devices.length}</small>`;
    AS.qs('[data-kpi-hint="devices"]').textContent = `${devices.length - online} sin comunicación`;
  }

  function renderAlerts(alerts) {
    const active = alerts
      .filter((a) => a.active && a.severity !== "info")
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.ts - a.ts)
      .slice(0, 5);
    const box = AS.qs("[data-alerts]");
    box.innerHTML = active.length
      ? active.map((a) => AS.alertItemHtml(a, { compact: true })).join("")
      : `<div class="empty">${AS.icon("shield", "icon-lg")}Sin alertas activas</div>`;
    AS.bindAlertButtons(box, alerts, refresh);
  }

  function zoneCard(z) {
    const r = z.reading;
    const worstVar = AS.KEY_VARIABLES.slice().sort((a, b) => AS.STATUS_RANK[r.status[b]] - AS.STATUS_RANK[r.status[a]])[0];
    const sparkKey = r.zoneStatus === "ok" ? "ch4" : worstVar;
    const minis = AS.KEY_VARIABLES.map((k) => {
      const v = AS.getVariable(k);
      return `<div class="mini-reading" data-status="${r.status[k]}"><dt>${v.short} · ${v.unit}</dt><dd>${AS.fmt.number(r.values[k], v.decimals)}</dd></div>`;
    }).join("");
    return `
      <a class="card zone-card" href="zona.html?id=${z.id}" data-status="${r.zoneStatus}">
        <div class="card-body">
          <div class="zone-card-title">
            <div><h3>${AS.escape(z.name)}</h3><p>${AS.escape(z.level)} · ${AS.escape(z.type)}</p></div>
            ${AS.badge(r.zoneStatus)}
          </div>
          <dl class="mini-readings">${minis}</dl>
          <div>
            <div class="text-xs muted">${AS.getVariable(sparkKey).short} · última hora</div>
            <div data-spark="${z.id}">${sparkCache[z.id] || ""}</div>
          </div>
          <div class="spread text-xs muted"><span>${r.offline ? `Última lectura ${AS.fmt.ago(r.ts)}` : `Actualizado ${AS.fmt.time(r.ts)}`}</span><span>${r.workers} persona(s)</span></div>
        </div>
      </a>`;
  }

  function renderZones(zones) {
    const sorted = zones.slice().sort((a, b) => AS.STATUS_RANK[b.reading.zoneStatus] - AS.STATUS_RANK[a.reading.zoneStatus]);
    AS.qs("[data-zones]").innerHTML = sorted.map(zoneCard).join("");
    sorted.forEach((z) => {
      const r = z.reading;
      const key = r.zoneStatus === "ok" ? "ch4" : AS.KEY_VARIABLES.slice().sort((a, b) => AS.STATUS_RANK[r.status[b]] - AS.STATUS_RANK[r.status[a]])[0];
      AS.api.getSeries({ zoneId: z.id, varKey: key, minutes: 60, step: 2 }).then((pts) => {
        sparkCache[z.id] = AS.charts.sparkline(pts, r.status[key]);
        const slot = AS.qs(`[data-spark="${z.id}"]`);
        if (slot) slot.innerHTML = sparkCache[z.id];
      });
    });
  }

  function refresh() {
    Promise.all([AS.api.getZonesStatus(), AS.refreshAlertCount(), AS.api.getDevices(), AS.api.getMineLayout()]).then(([zones, alerts, devices, layout]) => {
      renderBanner(zones, alerts);
      renderKpis(zones, alerts, devices);
      AS.charts.mineMap(AS.qs("[data-map]"), zones, layout);
      renderAlerts(alerts);
      renderZones(zones);
    });
  }

  AS.live(refresh, 5000);
})();
