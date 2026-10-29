/**
 * Adaptadores de salida para SUPABASE (PostgreSQL).
 * Implementan los mismos puertos que los repositorios en memoria; el núcleo
 * no sabe cuál de los dos está usando.
 *
 * Usa la clave de servicio: este código solo corre en el backend.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Alerta, CondicionDeAlerta, Medicion, Umbrales } from "../../../domain/modelo";
import type { AlertasRepositorio, CatalogoRepositorio, MedicionesRepositorio, PuntoAgregado } from "../../../application/ports/salida";
import { catalogoJson, dispositivoDesdeFila, variableDesdeFila, zonaDesdeFila } from "../../../config/catalogo-inicial";

export function crearClienteSupabase(url: string, claveServicio: string): SupabaseClient {
  return createClient(url, claveServicio, { auth: { persistSession: false, autoRefreshToken: false } });
}

const PAGINA = 1000;

/** Supabase devuelve como máximo 1000 filas por consulta: se pagina. */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await consulta(i, i + PAGINA - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

function verificar<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  return r.data;
}

/** Igual que verificar() pero para listas: nunca devuelve null. */
function lista<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  return verificar(r) ?? [];
}

export class CatalogoSupabase implements CatalogoRepositorio {
  constructor(private readonly db: SupabaseClient) {}

  async zonas() {
    return lista(await this.db.from("zonas").select("*").order("orden")).map(zonaDesdeFila);
  }

  async variables() {
    return lista(await this.db.from("variables").select("*")).map(variableDesdeFila);
  }

  async planoVigente() {
    const fila = verificar(await this.db.from("planos").select("*").eq("vigente", true).maybeSingle());
    return fila ? { version: fila.version, actualizado: fila.actualizado, fuente: fila.fuente, contenido: fila.contenido } : null;
  }

  async dispositivos() {
    return lista(await this.db.from("dispositivos").select("*")).map(dispositivoDesdeFila);
  }

  async turno() {
    // Los turnos aún no tienen tabla: se leen de config/turno.json.
    return catalogoJson.turno();
  }

  async actualizarDispositivo(id: string, cambios: { bateria?: number | null; ultimaComunicacion?: Date }) {
    const fila: Record<string, unknown> = {};
    if (cambios.bateria !== undefined) fila.bateria = cambios.bateria;
    if (cambios.ultimaComunicacion) fila.ultima_comunicacion = cambios.ultimaComunicacion.toISOString();
    verificar(await this.db.from("dispositivos").update(fila).eq("id", id));
  }

  async guardarUmbrales(clave: string, u: Umbrales, usuario: string) {
    const anterior = verificar(await this.db.from("variables").select("low_crit, low_warn, high_warn, high_crit").eq("clave", clave).single());
    const nuevo = { low_crit: u.lowCrit, low_warn: u.lowWarn, high_warn: u.highWarn, high_crit: u.highCrit };
    verificar(await this.db.from("variables").update({ ...nuevo, actualizado_en: new Date().toISOString(), actualizado_por: usuario }).eq("clave", clave));
    verificar(await this.db.from("limites_cambios").insert({ variable: clave, anterior, nuevo, usuario }));
  }
}

export class MedicionesSupabase implements MedicionesRepositorio {
  constructor(private readonly db: SupabaseClient) {}

  async guardar(mediciones: Medicion[]) {
    const filas = mediciones.map((m) => ({
      zona_id: m.zonaId,
      variable: m.variable,
      valor: m.valor,
      instante: m.instante.toISOString(),
      dispositivo_id: m.dispositivoId,
      origen: m.origen,
      calidad: m.calidad,
      detalle: m.detalle ?? null,
    }));
    for (let i = 0; i < filas.length; i += PAGINA) {
      verificar(await this.db.from("mediciones").insert(filas.slice(i, i + PAGINA)));
    }
  }

  async agregadas(f: { zonaId?: string; variable?: string; desde: Date; hasta: Date; pasoMin: number }): Promise<PuntoAgregado[]> {
    type Fila = { t: string; zona_id: string; variable: string; v: number };
    const filas =
      f.zonaId && f.variable
        ? await todas<Fila>((a, b) =>
            this.db.rpc("serie_agregada", { p_zona: f.zonaId, p_variable: f.variable, p_desde: f.desde.toISOString(), p_hasta: f.hasta.toISOString(), p_paso_min: f.pasoMin }).range(a, b),
          )
        : await todas<Fila>((a, b) =>
            this.db.rpc("historial_agregado", { p_zona: f.zonaId ?? null, p_desde: f.desde.toISOString(), p_hasta: f.hasta.toISOString(), p_paso_min: f.pasoMin }).range(a, b),
          );
    return filas
      .filter((r) => !f.variable || r.variable === f.variable)
      .map((r) => ({ t: new Date(r.t), zonaId: r.zona_id, variable: r.variable, valor: r.v }));
  }

  async manuales(f: { zonaId?: string; desde: Date }) {
    const filas = await todas<FilaMedicion>((a, b) => {
      let q = this.db.from("mediciones").select("*").eq("origen", "manual").gte("instante", f.desde.toISOString());
      if (f.zonaId) q = q.eq("zona_id", f.zonaId);
      return q.order("instante", { ascending: false }).range(a, b);
    });
    return filas.map(medicionDesdeFila);
  }

  async desde(instante: Date) {
    const filas = await todas<FilaMedicion>((a, b) =>
      this.db.from("mediciones").select("*").gte("instante", instante.toISOString()).order("instante").range(a, b),
    );
    return filas.map(medicionDesdeFila);
  }
}

type FilaMedicion = {
  zona_id: string; variable: string; valor: number; instante: string; dispositivo_id: string | null;
  origen: Medicion["origen"]; calidad: Medicion["calidad"]; detalle: Record<string, unknown> | null;
};

const medicionDesdeFila = (r: FilaMedicion): Medicion => ({
  zonaId: r.zona_id,
  variable: r.variable,
  valor: r.valor,
  instante: new Date(r.instante),
  dispositivoId: r.dispositivo_id,
  origen: r.origen,
  calidad: r.calidad,
  detalle: r.detalle,
});

type FilaAlerta = {
  id: string; clave: string; severidad: Alerta["severidad"]; tipo: string; zona_id: string | null; variable: string | null;
  valor: number | null; limite: number | null; titulo: string; detalle: string | null; protocolo: string | null; activa: boolean;
  creada_en: string; actualizada_en: string; resuelta_en: string | null;
  reconocida_por: string | null; reconocida_nota: string | null; reconocida_en: string | null;
};

const alertaDesdeFila = (r: FilaAlerta): Alerta => ({
  id: r.id,
  clave: r.clave,
  severidad: r.severidad,
  tipo: r.tipo,
  zonaId: r.zona_id,
  variable: r.variable,
  valor: r.valor,
  limite: r.limite,
  titulo: r.titulo,
  detalle: r.detalle ?? "",
  protocolo: r.protocolo ?? "default",
  activa: r.activa,
  creadaEn: new Date(r.creada_en),
  actualizadaEn: new Date(r.actualizada_en),
  resueltaEn: r.resuelta_en ? new Date(r.resuelta_en) : null,
  reconocimiento: r.reconocida_por ? { usuario: r.reconocida_por, nota: r.reconocida_nota ?? "", instante: new Date(r.reconocida_en!) } : null,
});

export class AlertasSupabase implements AlertasRepositorio {
  constructor(private readonly db: SupabaseClient) {}

  async activas() {
    return lista(await this.db.from("alertas").select("*").eq("activa", true)).map(alertaDesdeFila);
  }

  async listar(desde: Date) {
    const filas = await todas<FilaAlerta>((a, b) =>
      this.db.from("alertas").select("*").gte("creada_en", desde.toISOString()).order("creada_en", { ascending: false }).range(a, b),
    );
    return filas.map(alertaDesdeFila);
  }

  async porId(id: string) {
    const fila = verificar(await this.db.from("alertas").select("*").eq("id", id).maybeSingle());
    return fila ? alertaDesdeFila(fila) : null;
  }

  async crear(c: CondicionDeAlerta, ahora: Date) {
    const fila = verificar(
      await this.db
        .from("alertas")
        .insert({
          clave: c.clave, severidad: c.severidad, tipo: c.tipo, zona_id: c.zonaId, variable: c.variable, valor: c.valor,
          limite: c.limite, titulo: c.titulo, detalle: c.detalle, protocolo: c.protocolo,
          creada_en: ahora.toISOString(), actualizada_en: ahora.toISOString(),
        })
        .select()
        .single(),
    );
    return alertaDesdeFila(fila);
  }

  async actualizar(id: string, c: Partial<Alerta>) {
    const fila: Record<string, unknown> = {};
    if (c.severidad !== undefined) fila.severidad = c.severidad;
    if (c.valor !== undefined) fila.valor = c.valor;
    if (c.titulo !== undefined) fila.titulo = c.titulo;
    if (c.detalle !== undefined) fila.detalle = c.detalle;
    if (c.activa !== undefined) fila.activa = c.activa;
    if (c.actualizadaEn) fila.actualizada_en = c.actualizadaEn.toISOString();
    if (c.resueltaEn !== undefined) fila.resuelta_en = c.resueltaEn?.toISOString() ?? null;
    if (c.reconocimiento !== undefined) {
      fila.reconocida_por = c.reconocimiento?.usuario ?? null;
      fila.reconocida_nota = c.reconocimiento?.nota ?? null;
      fila.reconocida_en = c.reconocimiento?.instante.toISOString() ?? null;
    }
    verificar(await this.db.from("alertas").update(fila).eq("id", id));
  }
}
