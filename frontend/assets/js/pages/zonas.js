(function () {
  AS.mountShell({ active: "zonas", title: "Mapa de la mina" });

  AS.qs("[data-head]").innerHTML = `<tr><th>Zona</th><th>Estado</th>${AS.VARIABLES.map((v) => `<th class="num">${v.short} <span class="subtle">${v.unit}</span></th>`).join("")}<th class="num">Personal</th><th></th></tr>`;

  function cell(key, value, status) {
    const cls = status === "crit" ? "cell-crit" : status === "warn" ? "cell-warn" : "";
    return `<td class="num ${cls}">${AS.fmt.value(key, value, false)}</td>`;
  }

  function refresh() {
    Promise.all([AS.api.getZonesStatus(), AS.api.getMineLayout()]).then(([zones, layout]) => {
      AS.charts.mineMap(AS.qs("[data-map]"), zones, layout);
      AS.qs("[data-rows]").innerHTML = zones
        .map((z) => {
          const r = z.reading;
          return `<tr data-status="${r.zoneStatus}">
            <td><a href="zona.html?id=${z.id}"><strong>${AS.escape(z.name)}</strong></a><div class="text-xs muted">${AS.escape(z.level)}</div></td>
            <td>${AS.badge(r.zoneStatus)}</td>
            ${AS.VARIABLES.map((v) => cell(v.key, r.values[v.key], r.status[v.key])).join("")}
            <td class="num">${r.workers}</td>
            <td><a class="btn btn-sm btn-ghost" href="zona.html?id=${z.id}" aria-label="Ver ${AS.escape(z.name)}">${AS.icon("chevronRight", "icon-sm")}</a></td>
          </tr>`;
        })
        .join("");
      AS.qs("[data-updated]").textContent = `Actualizado ${AS.fmt.time(Date.now())}`;
    });
  }

  AS.live(refresh, 5000);
})();
