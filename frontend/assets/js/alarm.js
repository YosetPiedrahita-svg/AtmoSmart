/* ==========================================================================
   AtmoSmart — Aviso sonoro y vibración de alertas

   Solo dos niveles avisan; cada uno con su propio carácter:

     Alarma (crit)      Sirena de dos tonos, aguda, rápida y fuerte (~2,5 s).
                        Se repite cada 20 s mientras siga sin reconocerse.
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

  const POLL_MS = 5000;
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
      repeatMs: 20000, // insiste hasta que se reconozca
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
      repeatMs: null, // una sola vez
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

  function playSound(profile) {
    const c = getCtx();
    if (!c) return false;
    if (c.state !== "running") {
      c.resume().catch(() => {});
      if (!blockedNotified) {
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
  function fire(sev, { force = false } = {}) {
    const p = prefs();
    const profile = PROFILES[sev];
    return {
      sound: force || p.sound ? playSound(profile) : false,
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

      // Al abrir la sesión, lo que ya estaba en precaución no suena; una alarma sí.
      const toAnnounce = fresh.filter((a) => !baseline || a.severity === "crit").sort((a, b) => RANK[b.severity] - RANK[a.severity]);
      let lastCrit = state ? state.lastCrit || 0 : 0;
      const now = Date.now();

      if (toAnnounce.length) {
        const top = toAnnounce[0].severity;
        fire(top);
        if (top === "crit") lastCrit = now;
        toAnnounce.slice(0, 2).forEach((a) => {
          const zone = AS.getZone(a.zoneId);
          AS.toast(`<strong>${PROFILES[a.severity].label}</strong> · ${AS.escape(zone ? zone.name : a.zoneId)}: ${AS.escape(a.title)}`, a.severity, a.severity === "crit" ? 10000 : 6000);
        });
      } else if (pending.some((a) => a.severity === "crit") && now - lastCrit >= PROFILES.crit.repeatMs) {
        fire("crit"); // la alarma insiste hasta que alguien la reconozca
        lastCrit = now;
      }

      state = { seen: next, lastCrit };
      writeState();
    });
  }

  function start() {
    if (timer) return;
    check().catch(() => {});
    timer = setInterval(() => check().catch(() => {}), POLL_MS);
  }

  /** Reinicia la memoria de alertas vistas (útil para pruebas). */
  function reset() {
    state = null;
    try { sessionStorage.removeItem(STATE_KEY); } catch (e) { /* noop */ }
  }

  AS.alarm = { start, check, test, reset, profiles: PROFILES };
})();
