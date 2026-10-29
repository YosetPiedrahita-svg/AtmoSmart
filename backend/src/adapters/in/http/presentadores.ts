/**
 * Presentadores: traducen los objetos del dominio (en español) al formato
 * JSON que ya consume el frontend (assets/js/mock-api.js define ese contrato).
 * Así el frontend no cambia y el dominio no se contamina con detalles de la UI.
 */
import type { Alerta, Dispositivo, Variable } from "../../../domain/modelo";
import type { ServicioMonitoreo } from "../../../application/servicio-monitoreo";

export function variableDto(v: Variable) {
  return {
    key: v.clave,
    label: v.nombre,
    short: v.simbolo,
    unit: v.unidad,
    decimals: v.decimales,
    monitored: v.monitoreada,
    reference: v.referencia,
    thresholds: { lowCrit: v.umbrales.lowCrit, lowWarn: v.umbrales.lowWarn, highWarn: v.umbrales.highWarn, highCrit: v.umbrales.highCrit },
  };
}

export function estadoZonaDto(e: NonNullable<ReturnType<ServicioMonitoreo["estadoZona"]>>, monitoreadas: string[]) {
  const r = e.resultado;
  const values: Record<string, number | null> = {};
  const status: Record<string, string> = {};
  const trends: Record<string, { slope: number; etaMin: number | null; direction: string }> = {};
  const off = !r || r.estadoZona === "off";
  for (const k of monitoreadas) {
    values[k] = off ? null : e.actuales[k] ?? null;
    status[k] = off ? "off" : r?.estados[k] ?? "off";
    const t = r?.tendencias[k];
    trends[k] = { slope: t ? Number(t.pendiente.toFixed(4)) : 0, etaMin: t?.minutosHastaAlarma ?? null, direction: off ? "flat" : t?.direccion ?? "flat" };
  }
  return {
    id: e.zona.id,
    name: e.zona.nombre,
    level: e.zona.nivel,
    type: e.zona.tipo,
    laborType: e.zona.tipoLabor,
    reading: {
      zoneId: e.zona.id,
      ts: e.ultimaLectura ? e.ultimaLectura.getTime() : null,
      values,
      status,
      trends,
      zoneStatus: r?.estadoZona ?? "off",
      workers: e.personas ?? 0,
      fanRunning: e.actuales["ventilador"] == null ? null : e.actuales["ventilador"] === 1,
    },
  };
}

export function alertaDto(a: Alerta) {
  return {
    id: a.id,
    severity: a.severidad,
    type: a.tipo,
    zoneId: a.zonaId,
    varKey: a.variable,
    value: a.valor,
    limit: a.limite,
    title: a.titulo,
    detail: a.detalle,
    ts: a.creadaEn.getTime(),
    updatedTs: a.actualizadaEn.getTime(),
    resolvedTs: a.resueltaEn?.getTime() ?? null,
    protocol: a.protocolo,
    active: a.activa,
    ack: a.reconocimiento ? { user: a.reconocimiento.usuario, note: a.reconocimiento.nota, ts: a.reconocimiento.instante.getTime() } : null,
  };
}

export function dispositivoDto(d: Dispositivo, ahora: Date, sinSenalSegundos: number) {
  const silencio = d.ultimaComunicacion ? (ahora.getTime() - d.ultimaComunicacion.getTime()) / 1000 : null;
  const hoy = Date.parse(ahora.toISOString().slice(0, 10));
  const portatil = d.tipo.includes("portátil");
  return {
    id: d.id,
    type: d.tipo,
    zoneId: d.zonaId,
    vars: d.variables,
    power: d.alimentacion,
    profile: d.perfil,
    holder: d.portador,
    battery: d.bateria,
    calDays: d.calibracionVence ? Math.round((Date.parse(d.calibracionVence) - hoy) / 86_400_000) : null,
    // Los portátiles se descargan al final del turno: no se marcan "sin señal" en vivo.
    status: silencio == null ? (portatil ? "ok" : "pending") : silencio > sinSenalSegundos && !portatil ? "off" : "ok",
    lastSeen: d.ultimaComunicacion?.getTime() ?? null,
  };
}
