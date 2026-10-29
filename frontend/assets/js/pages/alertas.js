(function () {
  AS.mountShell({ active: "alertas", title: "Alertas" });

  const zoneSel = AS.qs("#f-zone");
  zoneSel.innerHTML = `<option value="all">Todas</option>` + AS.ZONES.map((z) => `<option value="${z.id}">${AS.escape(z.name)}</option>`).join("");

  let tab = "pending";
  let alerts = [];

  const groups = {
    pending: (a) => a.active && !a.ack,
    acked: (a) => a.active && !!a.ack,
    history: (a) => !a.active,
  };

  function render() {
    const zone = zoneSel.value;
    const sev = AS.qs("#f-sev").value;
    const type = AS.qs("#f-type").value;

    ["crit", "warn", "off", "info"].forEach((s) => {
      AS.qs(`[data-count="${s}"]`).textContent = alerts.filter((a) => a.active && a.severity === s).length;
    });
    Object.keys(groups).forEach((g) => (AS.qs(`[data-tab-count="${g}"]`).textContent = alerts.filter(groups[g]).length));

    const list = alerts
      .filter(groups[tab])
      .filter((a) => zone === "all" || a.zoneId === zone)
      .filter((a) => sev === "all" || a.severity === sev)
      .filter((a) => type === "all" || a.type === type);

    const box = AS.qs("[data-list]");
    box.innerHTML = list.length
      ? list.map((a) => AS.alertItemHtml(a)).join("")
      : `<div class="empty">${AS.icon("shield", "icon-lg")}No hay alertas con estos filtros</div>`;
    AS.bindAlertButtons(box, alerts, load);
  }

  function load() {
    AS.refreshAlertCount().then((data) => {
      alerts = data;
      render();
    });
  }

  AS.qsa("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      AS.qsa("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      render();
    })
  );
  ["#f-zone", "#f-sev", "#f-type"].forEach((id) => AS.qs(id).addEventListener("change", render));

  AS.live(load, 10000);
})();
