/* ==========================================================================
   AtmoSmart — Aviso sonoro y vibración de alertas

   Solo dos niveles avisan; cada uno con su propio carácter:

     Alarma (crit)      Tarjeta fija en pantalla + sirena de emergencia con
                        barrido (560–1250 Hz, timbre saturado y volumen alto)
                        que suena sin parar hasta que se pulse
                        "Silenciar" en la tarjeta. Silenciar no cierra la alarma:
                        la tarjeta sigue hasta que se reconozca en Alertas.
                        Vibración larga e insistente.
     Precaución (warn)  Dos tonos suaves y graves, una sola vez al aparecer
                        (o al escalar). Vibración corta (doble pulso).
                        Incluye las alertas predictivas (tendencia).

   NO avisan: "Sin señal" (off) y mantenimiento / calibración (info). Son
   fallas de equipo que se atienden con el protocolo, no una emergencia.

   Preferencias (Límites y configuración, AS.storage "prefs"):
     sound      sonido            (por defecto activo)
     vibrate    vibración         (por defecto activa)
     warnNotify avisar precaución (por defecto activo)

   Notas técnicas:
     - El navegador solo permite audio tras un gesto del usuario: el primer
       clic o toque en la página activa el sonido.
     - La vibración solo existe en móviles/tablets Android (no en iPhone ni
       en computador); en los demás el aviso es solo sonoro y visual.
     - Al abrir la sesión se avisa también de lo que ya existía (alarmas y
       precauciones sin reconocer); al cambiar de página las precauciones no
       se repiten, y una alarma sin silenciar sigue sonando.
   ========================================================================== */

(function () {
  "use strict";

  const POLL_MS = 2000;
  const STATE_KEY = "atmosmart:alarm-state";
  const RANK = { warn: 1, crit: 2 };

  const PROFILES = {
    crit: {
      label: "Alarma",
      kind: "siren", // sirena de emergencia con barrido (wail), no pitidos sueltos
      lowHz: 560,
      highHz: 1250,
      sweepMs: 1000, // un ciclo completo sube y baja en 1 s
      cycles: 3,
      durationMs: 3000,
      gain: 0.7,
      loopGapMs: 300, // casi sin pausa: suena hasta silenciar o reconocer
      vibrate: [600, 100, 600, 100, 600, 100, 600, 100, 600],
    },
    warn: {
      label: "Precaución",
      wave: "triangle", // timbre suave
      freqs: [660],
      pulseMs: 180,
      gapMs: 160,
      pulses: 2,
      gain: 0.18,
      vibrate: [160, 120, 160],
    },
  };

  let ctx = null;
  let timer = null;
  let blockedNotified = false;
  let retryWarn = false; // precaución pendiente de sonar cuando el navegador permita audio
  let state = readState();

  /* ---------- Preferencias ---------- */

  function prefs() {
    const p = AS.storage.get("prefs", {});
    return { sound: p.sound !== false, vibrate: p.vibrate !== false, warn: p.warnNotify !== false };
  }

  /* ---------- Audio ---------- */

  function getCtx() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    return ctx;
  }

  function unlock() {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    if (retryWarn && c) {
      retryWarn = false;
      c.resume().then(() => playSound(PROFILES.warn, true)).catch(() => {});
    }
  }
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));

  function playSound(profile, quiet) {
    const c = getCtx();
    if (!c) return false;
    if (c.state !== "running") {
      c.resume().catch(() => {});
      if (!blockedNotified && !quiet) {
        blockedNotified = true;
        AS.toast("El navegador bloqueó el sonido. Haga clic en cualquier parte de la página para activarlo.", "warn", 8000);
      }
      return false;
    }
    if (profile.kind === "siren") return playSiren(c, profile);
    const master = c.createGain();
    master.gain.value = profile.gain;
    master.connect(c.destination);
    const dur = profile.pulseMs / 1000;
    let t = c.currentTime + 0.03;
    for (let i = 0; i < profile.pulses; i++) {
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = profile.wave;
      osc.frequency.setValueAtTime(profile.freqs[i % profile.freqs.length], t);
      // Envolvente corta para evitar "clics" al encender y apagar cada pulso
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + 0.012);
      env.gain.setValueAtTime(1, t + dur - 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(env);
      env.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + profile.gapMs / 1000;
    }
    return true;
  }

  /** Sirena de emergencia: barrido continuo agudo-grave con timbre áspero y saturado, como una sirena industrial. */
  function playSiren(c, profile) {
    const t0 = c.currentTime + 0.03;
    const total = profile.durationMs / 1000;
    const half = profile.sweepMs / 2000;

    // Curva de frecuencia: sube y baja suavemente, ciclo tras ciclo
    const steps = 64;
    const curve = new Float32Array(profile.cycles * steps);
    for (let i = 0; i < curve.length; i++) {
      const ph = (i % steps) / steps; // 0..1 dentro del ciclo
      const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2; // triángulo 0..1
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * tri); // barrido suave
      curve[i] = profile.lowHz + (profile.highHz - profile.lowHz) * eased;
    }

    // Saturación suave: añade armónicos y el carácter "duro" de una sirena real
    const shaper = c.createWaveShaper();
    const k = 40, n = 512, sat = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; sat[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
    shaper.curve = sat;

    const comp = c.createDynamicsCompressor(); // mantiene el volumen alto y parejo
    comp.threshold.value = -24; comp.ratio.value = 10;
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(profile.gain, t0 + 0.06);
    master.gain.setValueAtTime(profile.gain, t0 + total - 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
    shaper.connect(comp); comp.connect(master); master.connect(c.destination);

    // Dos osciladores ligeramente desafinados + una octava arriba, como el batido de una sirena mecánica
    [["sawtooth", 1, 0.5], ["square", 1.012, 0.25], ["sawtooth", 2, 0.12]].forEach(([wave, mult, g]) => {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.type = wave;
      og.gain.value = g;
      osc.frequency.setValueCurveAtTime(curve.map((f) => f * mult), t0, total);
      osc.connect(og); og.connect(shaper);
      osc.start(t0);
      osc.stop(t0 + total + 0.02);
    });
    return true;
  }

  function vibrate(profile) {
    return typeof navigator.vibrate === "function" ? navigator.vibrate(profile.vibrate) : false;
  }

  /** Emite el aviso del nivel `sev` respetando las preferencias (salvo `force`, para pruebas). */
  function fire(sev, { force = false, quiet = false } = {}) {
    const p = prefs();
    const profile = PROFILES[sev];
    return {
      sound: force || p.sound ? playSound(profile, quiet) : false,
      vibration: force || p.vibrate ? vibrate(profile) : false,
    };
  }

  /** Prueba manual desde Límites y configuración. */
  function test(sev) {
    const profile = PROFILES[sev];
    const p = prefs();
    const r = fire(sev, { force: true });
    const sound = r.sound ? "sonido reproducido" : "sonido no disponible (haga clic en la página e intente de nuevo)";
    const vib = r.vibration ? "vibración enviada" : "este dispositivo no admite vibración";
    let msg = `Prueba de ${profile.label.toLowerCase()}: ${sound}; ${vib}.`;
    if (!p.sound || !p.vibrate) msg += " Hay avisos desactivados en las preferencias; esto fue solo una prueba.";
    AS.toast(msg, sev === "crit" ? "crit" : "warn", 7000);
    return r;
  }

  /* ---------- Estado entre páginas ---------- */

  function readState() {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      /* almacenamiento no disponible: se ignora */
    }
  }

  /* ---------- Tarjeta de alarma ---------- */

  let pendingCrit = []; // alarmas activas sin reconocer (última lectura)
  let lastLoop = 0;
  let loopTimer = null;
  const MAX_CARDS = 3;

  function region() {
    let r = AS.qs("[data-alarm-cards]");
    if (!r) {
      r = document.createElement("div");
      r.className = "alarm-region";
      r.setAttribute("data-alarm-cards", "");
      document.body.appendChild(r);
    }
    return r;
  }

  function isMuted(id) {
    return !!(state && state.muted && state.muted[id]);
  }

  function mute(id) {
    state = state || { seen: {}, muted: {} };
    state.muted = state.muted || {};
    state.muted[id] = true;
    writeState();
    if (navigator.vibrate) navigator.vibrate(0); // corta la vibración en curso
    if (ctx && !pendingCrit.some((a) => !isMuted(a.id))) ctx.suspend().catch(() => {}); // corta el sonido en curso
    render();
  }

  function render() {
    const r = region();
    const shown = pendingCrit.slice(0, MAX_CARDS);
    const keep = new Set(shown.map((a) => a.id));
    AS.qsa("[data-alarm-id]", r).forEach((el) => { if (!keep.has(el.dataset.alarmId)) el.remove(); });

    shown.forEach((a) => {
      const muted = isMuted(a.id);
      let el = AS.qs(`[data-alarm-id="${a.id}"]`, r);
      if (!el) {
        const zone = AS.getZone(a.zoneId);
        el = document.createElement("div");
        el.className = "alarm-card";
        el.dataset.alarmId = a.id;
        el.setAttribute("role", "alert");
        el.innerHTML = `
          <div class="alarm-card-head">${AS.icon("alert")}<strong>ALARMA · ${AS.escape(zone ? zone.name : a.zoneId)}</strong></div>
          <div class="alarm-card-title">${AS.escape(a.title)}</div>
          <div class="alarm-card-hint muted" data-alarm-hint></div>
          <div class="alarm-card-actions">
            <button class="btn btn-danger" type="button" data-alarm-mute>Silenciar</button>
            <a class="btn btn-secondary" href="alertas.html">Ver y reconocer</a>
          </div>`;
        AS.qs("[data-alarm-mute]", el).addEventListener("click", () => mute(a.id));
        r.appendChild(el);
      }
      el.classList.toggle("is-muted", muted);
      const btn = AS.qs("[data-alarm-mute]", el);
      btn.disabled = muted;
      btn.textContent = muted ? "Silenciada" : "Silenciar";
      const hint = AS.qs("[data-alarm-hint]", el);
      if (muted) hint.textContent = "Sin sonido. La alarma sigue activa hasta que se reconozca.";
      else if (ctx && ctx.state !== "running") hint.textContent = "Haga clic en la página para activar el sonido.";
      else hint.textContent = "Suena hasta que se silencie o se reconozca.";
    });

    let more = AS.qs("[data-alarm-more]", r);
    const extra = pendingCrit.length - shown.length;
    if (extra > 0) {
      if (!more) {
        more = document.createElement("a");
        more.className = "alarm-more";
        more.href = "alertas.html";
        more.setAttribute("data-alarm-more", "");
        r.appendChild(more);
      }
      more.textContent = `y ${extra} alarma${extra > 1 ? "s" : ""} más · ver Alertas`;
    } else if (more) more.remove();
  }

  /** Mientras haya una alarma sin silenciar ni reconocer, la sirena se repite sin pausa larga. */
  function loop() {
    if (!pendingCrit.some((a) => !isMuted(a.id))) return;
    const profile = PROFILES.crit;
    const cycle = profile.durationMs + profile.loopGapMs;
    const now = Date.now();
    if (now - lastLoop < cycle) return;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    const r = fire("crit", { quiet: true });
    if (r.sound || r.vibration) lastLoop = now;
    render(); // actualiza el aviso de "haga clic" si el navegador aún bloquea el audio
  }

  /* ---------- Vigilancia de alertas ---------- */

  function check() {
    return AS.api.getAlerts().then((alerts) => {
      const p = prefs();
      // Solo alarma y precaución, activas y sin reconocer. "off" e "info" nunca avisan.
      const pending = alerts.filter((a) => a.active && !a.ack && (a.severity === "crit" || (a.severity === "warn" && p.warn)));

      const seen = state ? state.seen : {};
      const next = {};
      const fresh = [];
      pending.forEach((a) => {
        next[a.id] = a.severity;
        const prev = seen[a.id];
        if (prev == null || RANK[prev] < RANK[a.severity]) fresh.push(a);
      });

      // Silencios: solo se conservan los de alarmas que siguen pendientes
      const muted = {};
      pending.forEach((a) => { if (a.severity === "crit" && state && state.muted && state.muted[a.id]) muted[a.id] = true; });

      pendingCrit = pending.filter((a) => a.severity === "crit");
      state = { seen: next, muted };
      writeState();
      render();

      // Alarma: tarjeta fija + sirena continua (la gestiona loop()). Precaución: toast y sonido una sola vez.
      if (fresh.some((a) => a.severity === "crit")) lastLoop = 0; // alarma nueva: suena de inmediato
      if (!pendingCrit.length) lastLoop = 0;
      // Precaución: al abrir la sesión también avisa por las que ya existían.
      const warns = fresh.filter((a) => a.severity === "warn");
      if (warns.length) {
        const r = fire("warn", { quiet: true });
        if (p.sound && !r.sound) retryWarn = true; // audio bloqueado: suena con el primer clic
        warns.slice(0, 2).forEach((a) => {
          const zone = AS.getZone(a.zoneId);
          AS.toast(`<strong>${PROFILES.warn.label}</strong> · ${AS.escape(zone ? zone.name : a.zoneId)}: ${AS.escape(a.title)}`, "warn", 6000);
        });
        if (warns.length > 2) AS.toast(`y ${warns.length - 2} precaución${warns.length - 2 > 1 ? "es" : ""} más · ver Alertas`, "warn", 6000);
      }
      loop();
    });
  }

  function start() {
    if (timer) return;
    check().catch(() => {});
    timer = setInterval(() => check().catch(() => {}), POLL_MS);
    loopTimer = setInterval(loop, 500);
  }

  /** Reinicia la memoria de alertas vistas y silencios (útil para pruebas). */
  function reset() {
    state = null;
    pendingCrit = [];
    lastLoop = 0;
    try { sessionStorage.removeItem(STATE_KEY); } catch (e) { /* noop */ }
    render();
  }

  AS.alarm = { start, check, test, reset, mute, profiles: PROFILES };
})();
