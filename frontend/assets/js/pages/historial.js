(function () {
  AS.mountShell({ active: "historial", title: "Historial" });
  AS.qs("[data-export]").insertAdjacentHTML("afterbegin", AS.icon("download", "icon-sm"));

  const PAGE_SIZE = 25;
  const zoneSel = AS.qs("#f-zone");
  const fillZones = () => {
    const sel = zoneSel.value || AS.param("zona") || "all";
    zoneSel.innerHTML = `<option value="all">Todas las zonas</option>` + AS.ZONES.map((z) => `<option value="${z.id}">${AS.escape(z.name)}</option>`).join("");
    zoneSel.value = AS.ZONES.some((z) => z.id === sel) ? sel : "all";
  };
  fillZones();
  document.addEventListener("as:zones", fillZones); // las zonas llegan del servidor

  AS.qs("[data-head]").innerHTML = `<tr><th>Fecha / hora</th><th>Zona</th>${AS.VARIABLES.map((v) => `<th class="num">${v.short} <span class="subtle">${v.unit}</span></th>`).join("")}<th>Origen</th></tr>`;

  let rows = [];
  let page = 0;

  const rowStatus = (r) =>
    Object.entries(r.values)
      .filter(([, v]) => v != null)
      .map(([k, v]) => AS.api.statusOf(k, v, r.zoneId))
      .reduce((w, s) => (AS.STATUS_RANK[s] > AS.STATUS_RANK[w] ? s : w), "ok");

  function renderSummary() {
    AS.qs("[data-summary]").innerHTML = AS.VARIABLES.filter((v) => v.role !== "input")
      .map((v) => {
        const pairs = rows.filter((r) => r.values[v.key] != null);
        const vals = pairs.map((r) => r.values[v.key]);
        if (!vals.length) return "";
        const out = pairs.filter((r) => AS.api.statusOf(v.key, r.values[v.key], r.zoneId) !== "ok").length;
        const pct = Math.round((out / vals.length) * 100);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const status = pct > 10 ? "crit" : pct > 0 ? "warn" : "ok";
        return `
          <div class="card kpi" data-status="${status}" style="border-left-width:4px">
            <span class="kpi-label">${v.short} · ${v.label}</span>
            <span class="kpi-value" style="font-size:var(--text-2xl)">${AS.fmt.number(avg, v.decimals)}<small> ${v.unit} prom.</small></span>
            <span class="kpi-hint">mín ${AS.fmt.number(Math.min(...vals), v.decimals)} · máx ${AS.fmt.number(Math.max(...vals), v.decimals)} · ${pct}% fuera de límite</span>
          </div>`;
      })
      .join("");
  }

  function renderTable() {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    AS.qs("[data-rows]").innerHTML = slice.length
      ? slice
          .map((r) => {
            const zone = AS.getZone(r.zoneId);
            const cells = AS.VARIABLES.map((v) => {
              const s = r.values[v.key] == null ? "ok" : AS.api.statusOf(v.key, r.values[v.key], r.zoneId);
              return `<td class="num ${s === "crit" ? "cell-crit" : s === "warn" ? "cell-warn" : ""}">${AS.fmt.value(v.key, r.values[v.key], false)}</td>`;
            }).join("");
            const manual = r.source !== "Sensor fijo";
            return `<tr data-status="${rowStatus(r)}"><td class="nowrap">${AS.fmt.dateTime(r.ts)}</td><td class="nowrap">${AS.escape(zone ? zone.name : r.zoneId)}</td>${cells}<td>${manual ? `<span class="badge badge-info no-dot" title="${AS.escape(r.reason || "")}">Manual · ${AS.escape(r.device || "")}</span>` : '<span class="muted text-xs">Sensor fijo</span>'}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="${AS.VARIABLES.length + 3}"><div class="empty">Sin lecturas para estos filtros</div></td></tr>`;

    AS.qs("[data-total]").textContent = `${total.toLocaleString("es-CO")} registros`;
    AS.qs("[data-page-info]").textContent = `Página ${page + 1} de ${pages}`;
    AS.qs("[data-prev]").disabled = page === 0;
    AS.qs("[data-next]").disabled = page >= pages - 1;
  }

  function load() {
    AS.api
      .getHistoryTable({ zoneId: zoneSel.value, hours: Number(AS.qs("#f-range").value), step: Number(AS.qs("#f-step").value) })
      .then((data) => {
        const only = AS.qs("#f-only").value;
        rows = data.filter((r) => (only === "out" ? rowStatus(r) !== "ok" : only === "manual" ? r.source !== "Sensor fijo" : true));
        page = 0;
        renderSummary();
        renderTable();
      });
  }

  function exportCsv() {
    const header = ["fecha_hora", "zona", ...AS.VARIABLES.map((v) => `${v.key}_${v.unit.replace(/[^a-z%/]/gi, "")}`), "origen"];
    const lines = rows.map((r) =>
      [new Date(r.ts).toISOString(), AS.getZone(r.zoneId)?.name || r.zoneId, ...AS.VARIABLES.map((v) => r.values[v.key] ?? ""), r.source]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atmosmart_historial_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    AS.toast(`Exportados ${rows.length} registros.`, "ok");
  }

  ["#f-zone", "#f-range", "#f-step", "#f-only"].forEach((id) => AS.qs(id).addEventListener("change", load));
  AS.qs("[data-prev]").addEventListener("click", () => { page--; renderTable(); });
  AS.qs("[data-next]").addEventListener("click", () => { page++; renderTable(); });
  AS.qs("[data-export]").addEventListener("click", exportCsv);

  load();
})();
