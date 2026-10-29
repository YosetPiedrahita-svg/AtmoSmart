(function () {
  AS.mountShell({ active: "dispositivos", title: "Sensores y equipos" });
  AS.qs("[data-manual]").insertAdjacentHTML("afterbegin", AS.icon("clipboard", "icon-sm"));
  AS.qs("[data-manual]").addEventListener("click", () => AS.openManualEntry("bombeo"));

  let devices = [];
  const typeSel = AS.qs("#f-type");

  function battery(level) {
    if (level == null) return '<span class="muted text-xs">Red eléctrica</span>';
    const cls = level < 20 ? "low" : level < 40 ? "mid" : "ok";
    return `<span class="battery" data-level="${cls}"><span class="battery-bar"><span style="width:${level}%"></span></span>${level}%</span>`;
  }

  function calibration(days) {
    if (days == null) return '<span class="muted text-xs">N/A</span>';
    if (days < 0) return AS.badge("crit", `Vencida hace ${-days} d`);
    if (days <= 7) return AS.badge("warn", `En ${days} d`);
    return `<span class="text-sm">En ${days} d</span>`;
  }

  function render() {
    const type = typeSel.value;
    const list = devices.filter((d) => type === "all" || d.type === type);
    AS.qs("[data-rows]").innerHTML = list
      .map((d) => {
        const zone = AS.getZone(d.zoneId);
        const measures = d.vars.length ? d.vars.map((k) => AS.getVariable(k).short).join(", ") : "—";
        return `<tr data-status="${d.status === "off" ? "crit" : d.calDays != null && d.calDays < 0 ? "warn" : ""}">
          <td><strong class="mono">${d.id}</strong>${d.holder ? `<div class="text-xs muted">${AS.escape(d.holder)}</div>` : ""}</td>
          <td>${AS.escape(d.type)}</td>
          <td class="nowrap"><a href="zona.html?id=${d.zoneId}">${AS.escape(zone ? zone.name : "")}</a></td>
          <td class="text-xs">${measures}</td>
          <td>${d.status === "off" ? AS.badge("off", "Sin señal") : AS.badge("ok", "En línea")}</td>
          <td>${battery(d.battery)}</td>
          <td>${calibration(d.calDays)}</td>
          <td class="nowrap text-xs muted">${AS.fmt.ago(d.lastSeen)}</td>
        </tr>`;
      })
      .join("");
  }

  function load() {
    AS.api.getDevices().then((data) => {
      devices = data;
      if (!typeSel.options.length) {
        const types = [...new Set(devices.map((d) => d.type))];
        typeSel.innerHTML = `<option value="all">Todos los tipos</option>` + types.map((t) => `<option>${AS.escape(t)}</option>`).join("");
      }
      AS.qs('[data-k="online"]').textContent = devices.filter((d) => d.status === "ok").length;
      AS.qs('[data-k="off"]').textContent = devices.filter((d) => d.status === "off").length;
      AS.qs('[data-k="battery"]').textContent = devices.filter((d) => d.battery != null && d.battery < 20).length;
      AS.qs('[data-k="cal"]').textContent = devices.filter((d) => d.calDays != null && d.calDays <= 7).length;
      render();
    });
  }

  typeSel.addEventListener("change", render);
  AS.live(load, 10000);
})();
