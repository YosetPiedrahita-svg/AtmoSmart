/**
 * Catálogo inicial (zonas, variables, plano, dispositivos y turno) leído de
 * backend/config/*.json. Lo usan el adaptador en memoria y el script que
 * carga el catálogo en Supabase (`npm run db:seed`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dispositivo, Plano, TipoLabor, Turno, Variable, Zona } from "../domain/modelo";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../config");
const leer = <T>(archivo: string): T => JSON.parse(readFileSync(join(DIR, archivo), "utf8")) as T;

export interface ZonaJson { id: string; nombre: string; nivel: string; tipo: string; tipo_labor: TipoLabor; orden: number }
export interface VariableJson {
  clave: string; nombre: string; simbolo: string; unidad: string; decimales: number;
  rango_min: number | null; rango_max: number | null;
  low_crit: number | null; low_warn: number | null; high_warn: number | null; high_crit: number | null;
  referencia: string | null; monitoreada: boolean;
}
export interface DispositivoJson {
  id: string; tipo: string; zona_id: string; variables: string[]; alimentacion: string | null;
  perfil: string | null; portador?: string | null; calibracion_vence: string | null;
}

export const zonaDesdeFila = (z: ZonaJson): Zona => ({ id: z.id, nombre: z.nombre, nivel: z.nivel, tipo: z.tipo, tipoLabor: z.tipo_labor, orden: z.orden });

export const variableDesdeFila = (v: VariableJson): Variable => ({
  clave: v.clave,
  nombre: v.nombre,
  simbolo: v.simbolo,
  unidad: v.unidad,
  decimales: v.decimales,
  rangoMin: v.rango_min,
  rangoMax: v.rango_max,
  umbrales: { lowCrit: v.low_crit, lowWarn: v.low_warn, highWarn: v.high_warn, highCrit: v.high_crit },
  referencia: v.referencia,
  monitoreada: v.monitoreada,
});

export const dispositivoDesdeFila = (d: DispositivoJson & { bateria?: number | null; ultima_comunicacion?: string | null }): Dispositivo => ({
  id: d.id,
  tipo: d.tipo,
  zonaId: d.zona_id,
  variables: d.variables ?? [],
  alimentacion: d.alimentacion,
  perfil: d.perfil,
  portador: d.portador ?? null,
  calibracionVence: d.calibracion_vence,
  bateria: d.bateria ?? null,
  ultimaComunicacion: d.ultima_comunicacion ? new Date(d.ultima_comunicacion) : null,
});

export const catalogoJson = {
  zonas: () => leer<ZonaJson[]>("zonas.json"),
  variables: () => leer<VariableJson[]>("variables.json"),
  dispositivos: () => leer<DispositivoJson[]>("dispositivos.json"),
  turno: () => leer<Turno>("turno.json"),
  plano: (): Plano => {
    const p = leer<{ version: number; updatedAt: string; source: string }>("plano.json");
    return { version: p.version, actualizado: p.updatedAt, fuente: p.source, contenido: p };
  },
};
