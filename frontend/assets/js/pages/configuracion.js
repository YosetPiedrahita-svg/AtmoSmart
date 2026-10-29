(function () {
  AS.mountShell({ active: "configuracion", title: "Límites y configuración" });
  AS.qs("[data-callout]").insertAdjacentHTML("afterbegin", AS.icon("info", "icon-sm"));

  const n = (x, d = 2) => (x == null ? "—" : AS.fmt.number(x, d));

  function renderNorm() {
    const rows = [];
    rows.push(["O₂ Oxígeno", "No inferior a 19,5 ni superior a 23,5 % vol.", "Lectura instantánea", "Art. 38"]);
    Object.values(AS.LABORES).forEach((l) =>
      rows.push([`CH₄ Metano — ${l.label}`, `Suspender labores y evacuar al alcanzar ${n(l.ch4, 1)} % (${l.lel} % LEL)`, "Lectura instantánea", l.ref])
    );
    rows.push(["CH₄ Metano", `Por encima de ${n(AS.CH4_SALVAMENTO, 1)} %: solo personal de salvamento`, "Lectura instantánea", "Art. 53, par. 1"]);
    Object.entries(AS.VLP).forEach(([k, vlp]) => {
      const v = AS.getVariable(k);
      rows.push([`${v.short} ${v.label}`, vlp.ppm, "Promedio de la jornada (TWA) y de 15 min (STEL). No es un umbral instantáneo de evacuación.", `Art. 39${AS.norma.factorJornada() < 1 ? ` · Brief & Scala (Fc ${n(AS.norma.factorJornada(), 2)})` : ""}`]);
    });
    rows.push(["Te Temperatura efectiva", AS.TE_TABLA.map((r) => `${r.te} °C: ${r.texto}`).join(" · "), "Te = 0,7 · Th + 0,3 · Ts − V", "Arts. 217 y 218"]);
    rows.push(["V Velocidad del aire", "Mínimo y máximo según el tipo de vía (ver Límites por zona)", "Lectura instantánea", "Art. 56"]);
    rows.push(["Sensores", "Lectura ausente, inválida o con calibración vencida = “no disponible”, nunca estado seguro", "Calidad de la lectura", "Arts. 46, 51 y 52 · criterio de diseño"]);
    rows.push(["Polvo de carbón", "Precaución 0,5 · alarma 0,9 mg/m³", "Lectura instantánea", "Criterio interno (no incluido en Parámetros 1 y 2)"]);
    AS.qs("[data-norm-rows]").innerHTML = rows.map((r) => `<tr><td><strong>${AS.escape(r[0])}</strong></td><td>${AS.escape(r[1])}</td><td class="muted">${AS.escape(r[2])}</td><td class="nowrap">${AS.escape(r[3])}</td></tr>`).join("");

    AS.qs("[data-zone-rows]").innerHTML = AS.ZONES.map((z) => {
      const l = AS.norma.labor(z.id);
      const vt = AS.norma.ventilacion(z.id);
      return `<tr><td><strong>${AS.escape(z.name)}</strong><div class="text-xs muted">${AS.escape(z.type)}</div></td><td>${AS.escape(l.label)}${l.internal ? ' <span class="badge badge-info no-dot">criterio interno</span>' : ""}</td><td class="num">${n(l.ch4, 1)} %</td><td>${AS.escape(vt.label)}${vt.internal ? ' <span class="badge badge-info no-dot">mínimo por criterio interno</span>' : ""}</td><td class="num">${vt.min == null ? "—" : n(vt.min) + " m/s"}</td><td class="num">${vt.max == null ? "Exceptuado" : n(vt.max, 1) + " m/s"}</td></tr>`;
    }).join("");
  }

  function renderCriteria() {
    const c = AS.getCriterios();
    const fields = Object.entries(AS.CRITERIOS_INFO).map(([key, info]) => `
      <div class="field"><label for="c-${key}">${AS.escape(info.label)}</label>
        <div class="input-group"><input class="input num" id="c-${key}" name="${key}" type="number" step="any" inputmode="decimal" min="0" value="${c[key]}"><span class="addon">${info.unit}</span></div>
      </div>`);
    fields.push(`
      <div class="field"><label for="c-teRedondeo">Temperatura efectiva entre dos valores de la tabla (Art. 217)</label>
        <select class="select" id="c-teRedondeo" name="teRedondeo">
          <option value="arriba"${c.teRedondeo === "arriba" ? " selected" : ""}>Aplicar el valor siguiente (más conservador)</option>
          <option value="cercano"${c.teRedondeo === "cercano" ? " selected" : ""}>Aplicar el valor más cercano</option>
        </select>
      </div>`);
    AS.qs("[data-criteria-fields]").innerHTML = fields.join("");
  }

  AS.qs("#criteria-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const out = {};
    const errors = [];
    Object.keys(AS.CRITERIOS_INFO).forEach((key) => {
      const raw = data.get(key);
      const val = Number(raw);
      if (raw === "" || !Number.isFinite(val) || val < 0) errors.push(AS.CRITERIOS_INFO[key].label);
      else out[key] = val;
    });
    out.teRedondeo = data.get("teRedondeo");
    if (out.o2WarnLow != null && (out.o2WarnLow < 19.5 || out.o2WarnHigh > 23.5 || out.o2WarnLow >= out.o2WarnHigh)) errors.push("La precaución de O₂ debe quedar dentro del rango legal (19,5–23,5 %)");
    if (out.ch4WarnPct >= 100) errors.push("La precaución de metano debe ser menor al 100 % del límite");
    if (out.jornadaHoras < 1 || out.jornadaHoras > 24) errors.push("La jornada debe estar entre 1 y 24 horas");
    if (errors.length) {
      AS.toast(`Revise: ${errors.join("; ")}.`, "crit", 7000);
      return;
    }
    AS.storage.set("criterios", out);
    renderNorm();
    AS.toast("Criterios guardados. Las alertas se recalculan con los nuevos valores.", "ok");
    AS.refreshAlertCount();
  });

  AS.qs("[data-reset]").addEventListener("click", () => {
    AS.storage.remove("criterios");
    renderCriteria();
    renderNorm();
    AS.toast("Se restauraron los criterios por defecto.", "info");
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

  // Probar sonido y vibración de cada nivel
  AS.qsa("[data-test-alert]").forEach((btn) => btn.addEventListener("click", () => AS.alarm && AS.alarm.test(btn.dataset.testAlert)));

  renderNorm();
  document.addEventListener("as:zones", renderNorm); // las zonas llegan del servidor
  renderCriteria();
})();
