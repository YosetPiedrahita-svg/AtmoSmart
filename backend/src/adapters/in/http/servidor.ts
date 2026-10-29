/**
 * Adaptador de entrada HTTP (Express): API REST + eventos en vivo (SSE).
 * Traduce peticiones HTTP a llamadas a los casos de uso y respuestas del
 * dominio a JSON. No contiene reglas de negocio.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorDeDominio, type ServicioMonitoreo } from "../../../application/servicio-monitoreo";
import type { MensajeCanonico } from "../../../application/ports/entrada";
import type { PublicadorSSE } from "../../out/sse/publicador-sse";
import { alertaDto, dispositivoDto, estadoZonaDto, variableDto } from "./presentadores";

export interface OpcionesServidor {
  servicio: ServicioMonitoreo;
  sse: PublicadorSSE;
  /** false desactiva POST /simulacion/generar (datos de prueba); por defecto está activo */
  permitirSimulacion?: boolean;
  /** si se define, los sensores deben enviarlo en la cabecera x-api-key */
  tokenIngesta?: string;
  /** carpeta del frontend para servirlo en la misma dirección (opcional) */
  carpetaFrontend?: string | null;
  almacenamiento: "supabase" | "memoria";
}

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const asincrono = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function crearServidor(o: OpcionesServidor) {
  const { servicio, sse } = o;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));

  // CORS: permite abrir el frontend desde otro origen (p. ej. file:// o Live Server).
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const api = express.Router();
  const monitoreadas = () => servicio.listarVariables().filter((v) => v.monitoreada).map((v) => v.clave);

  api.get("/salud", (_req, res) => res.json({ ok: true, almacenamiento: o.almacenamiento, clientesEnVivo: sse.conectados, hora: new Date().toISOString() }));

  // ---- Catálogo / configuración ---------------------------------------------
  api.get("/config", asincrono(async (_req, res) => {
    res.json({
      variables: servicio.listarVariables().map(variableDto),
      zones: servicio.listarZonas().map((z) => ({ id: z.id, name: z.nombre, level: z.nivel, type: z.tipo, laborType: z.tipoLabor })),
      storage: o.almacenamiento,
      offlineAfterSeconds: servicio.opciones.sinSenalSegundos,
      forecastHorizonMin: servicio.opciones.horizonteMin,
    });
  }));

  // Catálogo de zonas (Supabase → frontend). El estado en vivo está en /zonas/estado.
  api.get("/zonas", (_req, res) => {
    res.json(servicio.listarZonas().map((z) => ({ id: z.id, name: z.nombre, level: z.nivel, type: z.tipo, laborType: z.tipoLabor, order: z.orden })));
  });

  // Límites y configuración (guardados en Supabase). Deben ir ANTES de PUT /limites/:clave.
  api.get("/limites/configuracion", asincrono(async (_req, res) => {
    res.json(await servicio.limitesConfiguracion());
  }));

  api.put("/limites/criterios", asincrono(async (req, res) => {
    await servicio.guardarCriterios(req.body?.criterios ?? {}, req.body?.user ?? "desconocido");
    res.json({ ok: true });
  }));

  // Servicio de alertas: reevaluar con los límites vigentes y generar datos de prueba (precaución / alarma).
  api.post("/alertas/evaluar", asincrono(async (_req, res) => {
    res.json(await servicio.evaluarAhora());
  }));

  api.post("/simulacion/generar", asincrono(async (req, res) => {
    if (o.permitirSimulacion === false) return res.status(403).json({ error: "La generación de datos de prueba está desactivada" });
    res.status(201).json(await servicio.generarDatosPrueba({ zonaId: req.body?.zoneId, variable: req.body?.variable, nivel: req.body?.level }));
  }));

  api.get("/mina/plano", asincrono(async (_req, res) => {
    const plano = await servicio.plano();
    if (!plano) return res.status(404).json({ error: "No hay plano vigente" });
    res.json(plano.contenido);
  }));

  api.get("/turno", asincrono(async (_req, res) => {
    const t = await servicio.turno();
    const workersInside = servicio.estadoMina().reduce((n, z) => n + (z.personas ?? 0), 0);
    res.json({ shift: t.turno, from: t.desde, to: t.hasta, supervisor: t.supervisor, workersInside });
  }));

  // ---- Estado en tiempo real -------------------------------------------------
  api.get("/zonas/estado", (_req, res) => {
    const vars = monitoreadas();
    res.json(servicio.estadoMina().map((e) => estadoZonaDto(e, vars)));
  });

  api.get("/zonas/:id/estado", (req, res) => {
    const e = servicio.estadoZona(req.params.id);
    if (!e) return res.status(404).json({ error: "Zona no encontrada" });
    res.json(estadoZonaDto(e, monitoreadas()));
  });

  // ---- Mediciones ------------------------------------------------------------
  api.get("/mediciones/serie", asincrono(async (req, res) => {
    const { zona, variable } = req.query as Record<string, string>;
    if (!zona || !variable) return res.status(400).json({ error: "Parámetros requeridos: zona, variable" });
    res.json(await servicio.serie(zona, variable, num(req.query.minutos, 60, 5, 1440), num(req.query.paso, 1, 1, 120)));
  }));

  api.get("/mediciones/pronostico", (req, res) => {
    const { zona, variable } = req.query as Record<string, string>;
    res.json(servicio.pronostico(zona, variable, num(req.query.minutos, 30, 5, 120)));
  });

  api.get("/mediciones/historial", asincrono(async (req, res) => {
    const zona = req.query.zona && req.query.zona !== "all" ? String(req.query.zona) : undefined;
    const { agregadas, manuales } = await servicio.historial(zona, num(req.query.horas, 8, 1, 168), num(req.query.paso, 10, 1, 120));
    // Agrupa los promedios por (instante, zona) en una fila con todas las variables.
    const filas = new Map<string, { ts: number; zoneId: string; values: Record<string, number>; source: string }>();
    for (const p of agregadas) {
      const k = `${p.t.getTime()}|${p.zonaId}`;
      const f = filas.get(k) ?? { ts: p.t.getTime(), zoneId: p.zonaId, values: {}, source: "Sensor fijo" };
      f.values[p.variable] = p.valor;
      filas.set(k, f);
    }
    const manualesDto = manuales.map((m) => ({
      ts: m.instante.getTime(),
      zoneId: m.zonaId,
      values: { [m.variable]: m.valor },
      source: "Manual (contingencia)",
      device: (m.detalle?.detector as string) ?? "",
      reason: (m.detalle?.motivo as string) ?? "",
    }));
    res.json([...filas.values(), ...manualesDto].sort((a, b) => b.ts - a.ts));
  }));

  api.post("/mediciones/manual", asincrono(async (req, res) => {
    const b = req.body ?? {};
    const r = await servicio.registrarManual({ zonaId: b.zoneId, valores: b.values ?? {}, detector: b.device, motivo: b.reason ?? "", usuario: b.user ?? "desconocido" });
    res.status(201).json({ ...r, ts: Date.now(), zoneId: b.zoneId, values: b.values, source: "Manual (contingencia)", device: b.device, reason: b.reason });
  }));

  // ---- Ingesta de sensores (adaptadores de campo y simulador) ----------------
  const autorizarIngesta = (req: Request, res: Response, next: NextFunction) => {
    if (o.tokenIngesta && req.get("x-api-key") !== o.tokenIngesta) return res.status(401).json({ error: "x-api-key inválida" });
    next();
  };
  const lote = (body: unknown): MensajeCanonico[] => (Array.isArray(body) ? body : [body]) as MensajeCanonico[];

  api.post("/ingesta", autorizarIngesta, asincrono(async (req, res) => {
    res.status(202).json(await servicio.ingerir(lote(req.body)));
  }));

  api.post("/ingesta/historico", autorizarIngesta, asincrono(async (req, res) => {
    res.status(202).json(await servicio.ingerirHistorico(lote(req.body)));
  }));

  // ---- Alertas ---------------------------------------------------------------
  api.get("/alertas", asincrono(async (_req, res) => {
    res.json((await servicio.alertas()).map(alertaDto));
  }));

  api.post("/alertas/:id/reconocer", asincrono(async (req, res) => {
    await servicio.reconocer(req.params.id, req.body?.user, req.body?.note ?? "");
    res.json({ user: req.body?.user, note: req.body?.note ?? "", ts: Date.now() });
  }));

  // ---- Dispositivos y límites -------------------------------------------------
  api.get("/dispositivos", (_req, res) => {
    const ahora = new Date();
    res.json(servicio.listarDispositivos().map((d) => dispositivoDto(d, ahora, servicio.opciones.sinSenalSegundos)));
  });

  api.put("/limites/:clave", asincrono(async (req, res) => {
    const t = req.body?.thresholds ?? {};
    const n = (x: unknown) => (x === "" || x == null ? null : Number(x));
    await servicio.actualizarLimites(req.params.clave, { lowCrit: n(t.lowCrit), lowWarn: n(t.lowWarn), highWarn: n(t.highWarn), highCrit: n(t.highCrit) }, req.body?.user ?? "desconocido");
    res.json({ ok: true });
  }));

  // ---- Tiempo real -------------------------------------------------------------
  api.get("/stream", (_req, res) => sse.conectar(res));

  app.use("/api", api);

  // Sirve el frontend en la misma dirección: http://localhost:3000
  const carpeta = o.carpetaFrontend === undefined ? join(dirname(fileURLToPath(import.meta.url)), "../../../../../frontend") : o.carpetaFrontend;
  if (carpeta) app.use(express.static(carpeta));

  // Errores: los de dominio son 4xx; el resto 500 sin filtrar detalles internos.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErrorDeDominio) return res.status(err.codigo === "no_encontrado" ? 404 : 400).json({ error: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON inválido" });
    console.error(err);
    res.status(500).json({ error: "Error interno" });
  });

  return app;
}
