/* ==========================================================================
   AtmoSmart — Gráficos SVG sin dependencias (funcionan offline)
     AS.charts.line(el, opts)    serie temporal con bandas de límite y proyección
     AS.charts.sparkline(points) mini-tendencia para tarjetas
     AS.charts.mineMap(el, zones) mapa esquemático de la mina
   ========================================================================== */

(function () {
  const NS = "http://www.w3.org/2000/svg";

  function niceStep(range, ticks) {
    const raw = range / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  }

  /**
   * @param {HTMLElement} el contenedor con clase .chart
   * @param {{points:{t:number,v:number|null}[], forecast?:{t,v}[], varKey:string}} opts
   */
  function line(el, opts) {
    const { points, forecast = [], varKey } = opts;
    const variable = AS.getVariable(varKey);
    const t = AS.getThresholds(varKey);

    const render = () => {
      const W = el.clientWidth || 600;
      const H = el.clientHeight || 260;
      const pad = { top: 12, right: 16, bottom: 26, left: 46 };
      const iw = W - pad.left - pad.right;
      const ih = H - pad.top - pad.bottom;

      const valid = points.filter((p) => p.v != null);
      const all = valid.concat(forecast);
      if (!valid.length) {
        el.innerHTML = `<div class="empty">${AS.icon("wifiOff", "icon-lg")}<span>Sin datos del sensor en este rango</span></div>`;
        return;
      }

      const limits = [t.lowCrit, t.lowWarn, t.highWarn, t.highCrit].filter((x) => x != null);
      let yMin = Math.min(...all.map((p) => p.v));
      let yMax = Math.max(...all.map((p) => p.v));
      // Incluir límites cercanos para que el contexto sea visible
      limits.forEach((l) => {
        if (l >= yMin - (yMax - yMin) * 1.5 && l <= yMax + (yMax - yMin) * 1.5 + 1e-9) {
          yMin = Math.min(yMin, l);
          yMax = Math.max(yMax, l);
        }
      });
      if (t.highCrit != null && yMax < t.highCrit && t.highCrit - yMax < (yMax - yMin) * 0.6) yMax = t.highCrit;
      const span = yMax - yMin || Math.abs(yMax) * 0.1 || 1;
      yMin -= span * 0.1;
      yMax += span * 0.1;
      if (yMin < 0 && valid.every((p) => p.v >= 0)) yMin = 0;

      const tMin = points[0].t;
      const tMax = (forecast.length ? forecast[forecast.length - 1].t : points[points.length - 1].t);
      const x = (tt) => pad.left + ((tt - tMin) / (tMax - tMin || 1)) * iw;
      const y = (v) => pad.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

      const step = niceStep(yMax - yMin, 4);
      const yTicks = [];
      for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) yTicks.push(v);

      const xTickCount = Math.max(2, Math.floor(iw / 90));
      const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => tMin + ((tMax - tMin) * i) / xTickCount);

      // Bandas de riesgo
      const band = (from, to, cls) => {
        const y1 = y(Math.min(Math.max(to, yMin), yMax));
        const y2 = y(Math.min(Math.max(from, yMin), yMax));
        return y2 - y1 > 0 ? `<rect class="${cls}" x="${pad.left}" y="${y1}" width="${iw}" height="${y2 - y1}"/>` : "";
      };
      let bands = "";
      if (t.highWarn != null) bands += band(t.highWarn, t.highCrit ?? yMax, "band-warn");
      if (t.highCrit != null) bands += band(t.highCrit, yMax, "band-crit");
      if (t.lowWarn != null) bands += band(t.lowCrit ?? yMin, t.lowWarn, "band-warn");
      if (t.lowCrit != null) bands += band(yMin, t.lowCrit, "band-crit");

      const limitLine = (v, cls) => (v != null && v > yMin && v < yMax ? `<line class="${cls}" x1="${pad.left}" x2="${pad.left + iw}" y1="${y(v)}" y2="${y(v)}"/>` : "");

      // Línea (cortada en huecos sin datos)
      let d = "";
      let pen = false;
      points.forEach((p) => {
        if (p.v == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
        pen = true;
      });
      const first = valid[0];
      const last = valid[valid.length - 1];
      const area = `${d}L${x(last.t).toFixed(1)},${pad.top + ih}L${x(first.t).toFixed(1)},${pad.top + ih}Z`;
      const fc = forecast.length ? `<path class="forecast" d="M${x(forecast[0].t)},${y(forecast[0].v)}L${x(forecast[1].t)},${y(forecast[1].v)}"/>` : "";

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${variable.label} en el tiempo">
          ${bands}
          ${yTicks.map((v) => `<line class="grid-line" x1="${pad.left}" x2="${pad.left + iw}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${AS.fmt.number(v, step < 1 ? (step < 0.1 ? 2 : 1) : 0)}</text>`).join("")}
          ${xTicks.map((tt) => `<text class="axis-label" x="${x(tt)}" y="${H - 6}" text-anchor="middle">${AS.fmt.time(tt)}</text>`).join("")}
          ${limitLine(t.highWarn, "limit-warn")}${limitLine(t.highCrit, "limit-crit")}${limitLine(t.lowWarn, "limit-warn")}${limitLine(t.lowCrit, "limit-crit")}
          <path class="area" d="${area}"/>
          <path class="line" d="${d}"/>
          ${fc}
          <line class="cursor hidden" y1="${pad.top}" y2="${pad.top + ih}"/>
          <circle class="cursor-dot hidden" r="4"/>
          <rect x="${pad.left}" y="${pad.top}" width="${iw}" height="${ih}" fill="transparent" data-hit/>
        </svg>
        <div class="chart-tooltip hidden"></div>`;

      // Tooltip
      const svg = el.querySelector("svg");
      const hit = el.querySelector("[data-hit]");
      const cursor = el.querySelector(".cursor");
      const dot = el.querySelector(".cursor-dot");
      const tip = el.querySelector(".chart-tooltip");
      const hide = () => [cursor, dot, tip].forEach((n) => n.classList.add("hidden"));
      hit.addEventListener("pointerleave", hide);
      hit.addEventListener("pointermove", (e) => {
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const tt = tMin + ((px - pad.left) / iw) * (tMax - tMin);
        let best = valid[0];
        valid.forEach((p) => { if (Math.abs(p.t - tt) < Math.abs(best.t - tt)) best = p; });
        const cx = x(best.t);
        const cy = y(best.v);
        cursor.setAttribute("x1", cx);
        cursor.setAttribute("x2", cx);
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        tip.style.left = `${(cx / W) * 100}%`;
        tip.style.top = `${(cy / H) * 100}%`;
        tip.textContent = `${AS.fmt.time(best.t)} · ${AS.fmt.value(varKey, best.v)}`;
        [cursor, dot, tip].forEach((n) => n.classList.remove("hidden"));
      });
    };

    render();
    if (!el._resizeObserver) {
      el._resizeObserver = new ResizeObserver(() => el._render && el._render());
      el._resizeObserver.observe(el);
    }
    el._render = render;
  }

  function sparkline(points, status = "ok") {
    const valid = points.filter((p) => p.v != null);
    if (valid.length < 2) return `<svg class="sparkline" viewBox="0 0 100 36"></svg>`;
    const vs = valid.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const d = valid
      .map((p, i) => `${i ? "L" : "M"}${((i / (valid.length - 1)) * 100).toFixed(1)},${(32 - ((p.v - min) / span) * 28).toFixed(1)}`)
      .join("");
    return `<svg class="sparkline" data-status="${status}" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /**
   * Mapa esquemático (corte vertical) de la mina. Los nodos se colorean por estado
   * y enlazan al detalle de cada zona.
   */
  function mineMap(el, zones) {
    const pos = Object.fromEntries(AS.ZONES.map((z) => [z.id, z.map]));
    const tunnels = [
      ["bocamina", "galeria-1"],
      ["galeria-1", "frente-1"],
      ["galeria-1", "inclinado"],
      ["inclinado", "galeria-2"],
      ["galeria-2", "frente-2"],
      ["galeria-2", "bombeo"],
      ["frente-2", "retorno"],
    ];
    const path = ([a, b]) => `M${pos[a].x},${pos[a].y} L${pos[b].x},${pos[b].y}`;
    const airflow = "M90,70 L250,150 L330,245 L420,330 L640,330 L720,70";

    el.innerHTML = `
      <svg class="mine-map" viewBox="0 0 800 420" role="img" aria-label="Mapa esquemático de la mina con estado por zona">
        <rect class="rock" x="0" y="40" width="800" height="380" rx="12"/>
        <line class="surface-line" x1="0" y1="40" x2="800" y2="40"/>
        <text class="map-sublabel" x="12" y="30" style="stroke:none">Superficie</text>
        <text class="map-sublabel" x="12" y="160">Nivel 1</text>
        <text class="map-sublabel" x="12" y="340">Nivel 2</text>
        ${tunnels.map((t) => `<path class="tunnel-edge" d="${path(t)}"/>`).join("")}
        ${tunnels.map((t) => `<path class="tunnel" d="${path(t)}"/>`).join("")}
        <path class="airflow" d="${airflow}"/>
        ${zones.map((z) => {
          const p = pos[z.id];
          const s = z.reading.zoneStatus;
          const labelY = p.y < 100 ? p.y + 34 : p.y - 22;
          return `
            <a href="zona.html?id=${z.id}" class="zone-node" data-status="${s}" tabindex="0" aria-label="${AS.escape(z.name)}: ${AS.STATUS[s].label}">
              <circle class="halo" cx="${p.x}" cy="${p.y}" r="10"/>
              <circle class="core" cx="${p.x}" cy="${p.y}" r="10"/>
              <text class="map-label" x="${p.x}" y="${labelY}" text-anchor="middle">${AS.escape(z.name)}</text>
              <text class="map-sublabel" x="${p.x}" y="${labelY + 14}" text-anchor="middle">${s === "off" ? "Sin señal" : `CH₄ ${AS.fmt.number(z.reading.values.ch4, 2)}% · CO ${AS.fmt.number(z.reading.values.co, 0)} ppm`}</text>
            </a>`;
        }).join("")}
      </svg>`;
  }

  AS.charts = { line, sparkline, mineMap };
})();
