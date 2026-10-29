/* ==========================================================================
   AtmoSmart — Registro manual de contingencia.
   Solo para cuando un sensor fijo falla: el supervisor transcribe la lectura
   de un detector portátil. Exige justificación y queda marcado como "Manual".
   ========================================================================== */

AS.openManualEntry = function (zoneId, onSaved) {
  const zoneOptions = AS.ZONES.map((z) => `<option value="${z.id}"${z.id === zoneId ? " selected" : ""}>${AS.escape(z.name)}</option>`).join("");
  const varFields = AS.VARIABLES.filter((v) => ["o2", "ch4", "co", "co2", "h2s", "no", "no2", "so2", "temp", "tw", "air", "pm"].includes(v.key))
    .map((v) => `
      <div class="field">
        <label for="m-${v.key}">${v.short} <span class="muted">${v.label}</span></label>
        <div class="input-group"><input class="input num" id="m-${v.key}" name="${v.key}" type="number" inputmode="decimal" step="any" min="0"><span class="addon">${v.unit}</span></div>
      </div>`)
    .join("");

  AS.modal({
    title: "Registro manual de contingencia",
    body: `
      <div class="callout">${AS.icon("info", "icon-sm")}<div>Use este registro solo si el sensor fijo no reporta. La lectura queda marcada como <strong>manual</strong> y asociada a su usuario.</div></div>
      <form class="stack" id="manual-form" novalidate>
        <div class="form-grid">
          <div class="field"><label for="m-zone">Zona</label><select class="select" id="m-zone" name="zoneId">${zoneOptions}</select></div>
          <div class="field"><label for="m-device">Detector portátil usado</label><input class="input" id="m-device" name="device" placeholder="Ej.: P-022" required></div>
        </div>
        <div class="form-grid">${varFields}</div>
        <div class="field"><label for="m-reason">Motivo</label>
          <select class="select" id="m-reason" name="reason">
            <option>Sensor fijo sin señal</option>
            <option>Verificación de lectura dudosa</option>
            <option>Zona sin sensor fijo instalado</option>
            <option>Reingreso post-voladura</option>
          </select>
        </div>
        <p class="field-error hidden" data-error>Ingrese al menos una medición y el detector utilizado.</p>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>${AS.icon("check", "icon-sm")} Guardar lectura</button>`,
    onMount(dlg) {
      AS.qs("[data-save]", dlg).addEventListener("click", () => {
        const form = AS.qs("#manual-form", dlg);
        const data = new FormData(form);
        const values = {};
        AS.VARIABLES.forEach((v) => {
          const raw = data.get(v.key);
          values[v.key] = raw === null || raw === "" ? null : Number(raw);
        });
        const hasValue = Object.values(values).some((v) => v != null);
        const device = String(data.get("device") || "").trim();
        if (!hasValue || !device) {
          AS.qs("[data-error]", dlg).classList.remove("hidden");
          return;
        }
        AS.api
          .addManualReading({ zoneId: data.get("zoneId"), values, device, reason: data.get("reason"), user: AS.session.user().name })
          .then((row) => {
            dlg.close();
            const worst = Object.entries(row.values).filter(([, v]) => v != null).map(([k, v]) => AS.api.statusOf(k, v, row.zoneId));
            const kind = worst.includes("crit") ? "crit" : worst.includes("warn") ? "warn" : "ok";
            AS.toast(kind === "ok" ? "Lectura manual guardada. Valores dentro de límites." : "Lectura guardada. Hay valores fuera de límites: revise el protocolo.", kind);
            if (onSaved) onSaved(row);
          })
          .catch((e) => AS.toast(`No se pudo guardar: ${AS.escape(e.message)}`, "crit", 6000));
      });
    },
  });
};
