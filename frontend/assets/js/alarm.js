/* ==========================================================================
   AtmoSmart — Aviso sonoro y vibración de alertas

   Solo dos niveles avisan; cada uno con su propio carácter:

     Alarma (crit)      Tarjeta fija en pantalla + sirena de dos tonos, aguda,
                        rápida y fuerte, que suena sin parar hasta que se pulse
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
     - Las alertas que ya existían al abrir la sesión no suenan de nuevo al
       cambiar de página; una alarma sin reconocer sí se vuelve a escuchar.
   ========================================================================== */

(function () {
  "use strict";

  const POLL_MS = 2000;
  const STATE_KEY = "atmosmart:alarm-state";
  const RANK = { warn: 1, crit: 2 };

  const PROFILES = {
    crit: {
      label: "Alarma",
      wave: "square", // timbre áspero que se distingue del ruido de la mina
      freqs: [988, 784], // sirena alternando agudo / medio
      pulseMs: 240,
      gapMs: 80,
      pulses: 8,
      gain: 0.5,
      loopGapMs: 500, // pausa entre repeticiones: suena sin parar hasta silenciar o reconocer
      vibrate: [500, 120, 500, 120, 500, 120, 500],
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
    const cycle = profile.pulses * (profile.pulseMs + profile.gapMs) + profile.loopGapMs;
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

      const baseline = state === null; // primera lectura de la sesión
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
      const warns = fresh.filter((a) => a.severity === "warn" && !baseline);
      if (warns.length) {
        fire("warn");
        warns.slice(0, 2).forEach((a) => {
          const zone = AS.getZone(a.zoneId);
          AS.toast(`<strong>${PROFILES.warn.label}</strong> · ${AS.escape(zone ? zone.name : a.zoneId)}: ${AS.escape(a.title)}`, "warn", 6000);
        });
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
