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
    const { points, forecast = [], varKey, zoneId } = opts;
    const variable = AS.getVariable(varKey);
    const t = AS.getThresholds(varKey, zoneId);

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
   * Mapa esquemático (corte vertical) de la mina, construido a partir del plano
   * (AS.MINE_LAYOUT o lo que entregue el backend). Los nodos con zona se colorean
   * por estado y enlazan al detalle; los tramos se dibujan según su tipo de
   * ventilación (entrada, retorno, frente ciego con manga, servicio).
   */
  function mineMap(el, zones, layout = AS.MINE_LAYOUT) {
    const nodes = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const byZone = Object.fromEntries(zones.map((z) => [z.id, z]));
    const seg = (s) => `M${nodes[s.from].x},${nodes[s.from].y} L${nodes[s.to].x},${nodes[s.to].y}`;
    const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    const tunnels = layout.segments.map((s) => `<path class="tunnel-edge" d="${seg(s)}"/>`).join("") +
      layout.segments.map((s) => `<path class="tunnel" d="${seg(s)}"/>`).join("");

    // Flujo de aire: azul = fresco (entrada), ocre = viciado (retorno)
    const flows = layout.segments
      .filter((s) => s.kind === "intake" || s.kind === "return")
      .map((s) => `<path class="airflow ${s.kind === "return" ? "airflow-return" : ""}" d="${seg(s)}"/>`)
      .join("");

    // Frentes ciegos: manga desde el ventilador auxiliar hasta cerca del tope
    const ducts = layout.segments
      .filter((s) => s.kind === "heading")
      .map((s) => {
        const a = nodes[s.from];
        const b = nodes[s.to];
        const p0 = along(a, b, 0.22);
        const p1 = along(a, b, 0.86);
        return `<path class="duct" d="M${p0.x},${p0.y} L${p1.x},${p1.y}"/>`;
      })
      .join("");

    const fans = (layout.fans || [])
      .map((f) => {
        if (f.kind === "main") {
          const n = nodes[f.node];
          return `<g class="fan fan-main"><rect x="${n.x - 9}" y="${n.y - 42}" width="18" height="18" rx="4"/><text class="fan-text" x="${n.x}" y="${n.y - 29}" text-anchor="middle">VP</text><title>${AS.escape(f.label || "Ventilador principal")}</title></g>`;
        }
        const p = along(nodes[f.segment[0]], nodes[f.segment[1]], 0.18);
        return `<g class="fan"><circle cx="${p.x}" cy="${p.y}" r="8"/><text class="fan-text" x="${p.x}" y="${p.y + 3}" text-anchor="middle">VA</text><title>Ventilador auxiliar ${AS.escape(f.id)}</title></g>`;
      })
      .join("");

    const label = (n, title, sub) => {
      const pos = n.label || "above";
      const x = pos === "right" ? n.x + 18 : n.x;
      const y = pos === "below" ? n.y + 30 : pos === "right" ? n.y - 2 : n.y - 30;
      const anchor = pos === "right" ? "start" : "middle";
      return `<text class="map-label" x="${x}" y="${y}" text-anchor="${anchor}">${AS.escape(title)}</text>` +
        (sub ? `<text class="map-sublabel" x="${x}" y="${y + 14}" text-anchor="${anchor}">${sub}</text>` : "");
    };

    const points = layout.nodes
      .map((n) => {
        const z = n.zoneId && byZone[n.zoneId];
        if (!z) {
          return `<g class="junction"><rect x="${n.x - 6}" y="${n.y - 6}" width="12" height="12" rx="2"/>${label(n, n.name || "", "Sin sensor")}</g>`;
        }
        const s = z.reading.zoneStatus;
        const sub = s === "off" ? "Sin señal" : `CH₄ ${AS.fmt.number(z.reading.values.ch4, 2)}% · CO ${AS.fmt.number(z.reading.values.co, 0)} ppm`;
        return `
          <a href="zona.html?id=${z.id}" class="zone-node" data-status="${s}" tabindex="0" aria-label="${AS.escape(z.name)}: ${AS.STATUS[s].label}">
            <circle class="halo" cx="${n.x}" cy="${n.y}" r="10"/>
            <circle class="core" cx="${n.x}" cy="${n.y}" r="10"/>
            ${label(n, z.name, sub)}
          </a>`;
      })
      .join("");

    el.innerHTML = `
      <svg class="mine-map" viewBox="0 0 800 440" role="img" aria-label="Mapa esquemático de la mina con estado por zona y circuito de ventilación">
        <rect class="rock" x="0" y="40" width="800" height="400" rx="12"/>
        <line class="surface-line" x1="0" y1="40" x2="800" y2="40"/>
        ${(layout.levels || []).map((l) => `<text class="map-sublabel" x="12" y="${l.y}"${l.y < 40 ? ' style="stroke:none"' : ""}>${AS.escape(l.name)}</text>`).join("")}
        ${tunnels}${flows}${ducts}${fans}${points}
      </svg>
      <div class="map-legend mt-2">
        <span><i class="line-in"></i>Aire fresco (entrada)</span>
        <span><i class="line-out"></i>Aire viciado (retorno)</span>
        <span><i class="line-duct"></i>Manga · ventilador auxiliar (VA)</span>
        <span class="subtle">Plano v${layout.version} · ${AS.escape(layout.updatedAt)} · ${AS.escape(layout.source)}</span>
      </div>`;
  }

  AS.charts = { line, sparkline, mineMap };
})();
