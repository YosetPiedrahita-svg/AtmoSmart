(function () {
  AS.mountShell({ active: "configuracion", title: "Límites y configuración" });
  AS.qs("[data-callout]").insertAdjacentHTML("afterbegin", AS.icon("info", "icon-sm"));

  const FIELDS = ["lowCrit", "lowWarn", "highWarn", "highCrit"];

  function renderRows() {
    AS.qs("[data-rows]").innerHTML = AS.VARIABLES.map((v) => {
      const t = AS.getThresholds(v.key);
      const inputs = FIELDS.map(
        (f) => `<td class="num"><input class="input input-sm num" style="max-width:110px;margin-left:auto" type="number" step="any" inputmode="decimal" name="${v.key}.${f}" value="${t[f] ?? ""}" aria-label="${v.label} ${f}"></td>`
      ).join("");
      return `<tr><td><strong>${v.short}</strong> <span class="muted">${v.label}</span></td>${inputs}<td class="muted">${v.unit}</td></tr>`;
    }).join("");
  }

  AS.qs("#limits-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const custom = {};
    const errors = [];
    AS.VARIABLES.forEach((v) => {
      const t = {};
      FIELDS.forEach((f) => {
        const raw = data.get(`${v.key}.${f}`);
        t[f] = raw === "" || raw == null ? null : Number(raw);
      });
      const ordered = FIELDS.map((f) => t[f]).filter((x) => x != null);
      if (ordered.some((x, i) => i > 0 && x <= ordered[i - 1])) errors.push(v.label);
      custom[v.key] = t;
    });
    if (errors.length) {
      AS.toast(`Revise el orden de los límites en: ${errors.join(", ")} (deben ir de menor a mayor).`, "crit", 6000);
      return;
    }
    if (AS.dataMode === "backend") {
      // Solo se envían las variables que cambiaron; el servidor guarda el historial de cambios.
      const cambiadas = AS.VARIABLES.filter((v) => FIELDS.some((f) => (AS.getThresholds(v.key)[f] ?? null) !== custom[v.key][f]));
      Promise.all(cambiadas.map((v) => AS.api.saveLimits(v.key, custom[v.key])))
        .then(() => {
          cambiadas.forEach((v) => (v.thresholds = Object.assign({}, custom[v.key])));
          AS.toast(cambiadas.length ? `Límites guardados en el servidor (${cambiadas.length} variable/s). Las alertas se recalculan.` : "No hubo cambios.", "ok");
          AS.refreshAlertCount();
        })
        .catch((err) => AS.toast(`No se pudieron guardar: ${AS.escape(err.message)}`, "crit", 6000));
      return;
    }
    AS.storage.set("thresholds", custom);
    AS.toast("Límites guardados. Las alertas se recalculan con los nuevos valores.", "ok");
    AS.refreshAlertCount();
  });

  // Con backend, los valores por defecto se restauran desde el servidor (npm run db:seed).
  const ajustarModo = () => {
    AS.qs("[data-reset]").classList.toggle("hidden", AS.dataMode === "backend");
    AS.qs("[data-storage-note]").textContent =
      AS.dataMode === "backend" ? "Los cambios se guardan en el servidor y quedan registrados con su usuario." : "Los cambios se guardan en este navegador.";
    renderRows();
  };
  document.addEventListener("as:datamode", ajustarModo);

  AS.qs("[data-reset]").addEventListener("click", () => {
    AS.storage.remove("thresholds");
    renderRows();
    AS.toast("Se restauraron los límites por defecto.", "info");
    AS.refreshAlertCount();
  });

  // Preferencias
  const prefs = AS.storage.get("prefs", {});
  AS.qsa("[data-pref]").forEach((el) => {
    const key = el.dataset.pref;
    if (prefs[key] != null) el.type === "checkbox" ? (el.checked = prefs[key]) : (el.value = prefs[key]);
    el.addEventListener("change", () => {
      prefs[key] = el.type === "checkbox" ? el.checked : el.value;
      AS.storage.set("prefs", prefs);
      AS.toast("Preferencia guardada.", "ok", 2000);
    });
  });

  renderRows();
})();
