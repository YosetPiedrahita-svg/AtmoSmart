/**
 * Adaptadores de salida EN MEMORIA.
 * Se usan cuando no hay Supabase configurado (pruebas, desarrollo sin red).
 * Los datos se pierden al reiniciar el proceso.
 */
import { randomUUID } from "node:crypto";
import type { Alerta, CondicionDeAlerta, ConfiguracionLimites, Dispositivo, Medicion, Plano, Turno, Umbrales, Variable, Zona } from "../../../domain/modelo";
import type { AlertasRepositorio, CatalogoRepositorio, MedicionesRepositorio, PuntoAgregado } from "../../../application/ports/salida";
import { catalogoJson, dispositivoDesdeFila, limitesJson, variableDesdeFila, zonaDesdeFila } from "../../../config/catalogo-inicial";

export class CatalogoEnMemoria implements CatalogoRepositorio {
  private _zonas: Zona[] = catalogoJson.zonas().map(zonaDesdeFila);
  private _variables: Variable[] = catalogoJson.variables().map(variableDesdeFila);
  private _dispositivos: Dispositivo[] = catalogoJson.dispositivos().map(dispositivoDesdeFila);
  private _plano: Plano = catalogoJson.plano();
  private _turno: Turno = catalogoJson.turno();

  async zonas() { return this._zonas; }
  async variables() { return this._variables.map((v) => ({ ...v, umbrales: { ...v.umbrales } })); }
  async planoVigente() { return this._plano; }
  async dispositivos() { return this._dispositivos.map((d) => ({ ...d })); }
  async turno() { return this._turno; }

  async actualizarDispositivo(id: string, cambios: { bateria?: number | null; ultimaComunicacion?: Date }) {
    const d = this._dispositivos.find((x) => x.id === id);
    if (d) Object.assign(d, cambios);
  }

  async guardarUmbrales(clave: string, umbrales: Umbrales) {
    const v = this._variables.find((x) => x.clave === clave);
    if (v) v.umbrales = { ...umbrales };
  }

  private _limites: ConfiguracionLimites = limitesJson.configuracion();

  async limitesConfiguracion() {
    return JSON.parse(JSON.stringify(this._limites)) as ConfiguracionLimites;
  }

  async guardarCriterios(valores: Record<string, number | string>) {
    for (const c of this._limites.criterios) if (c.clave in valores) c.valor = valores[c.clave];
  }
}

export class MedicionesEnMemoria implements MedicionesRepositorio {
  private datos: Medicion[] = [];

  async guardar(mediciones: Medicion[]) {
    this.datos.push(...mediciones);
    // Límite de seguridad para no agotar la memoria en demos largas.
    if (this.datos.length > 600_000) this.datos.splice(0, this.datos.length - 600_000);
  }

  async agregadas(f: { zonaId?: string; variable?: string; desde: Date; hasta: Date; pasoMin: number }): Promise<PuntoAgregado[]> {
    const paso = f.pasoMin * 60_000;
    const grupos = new Map<string, { t: number; zonaId: string; variable: string; suma: number; n: number }>();
    for (const m of this.datos) {
      if (m.origen === "manual") continue;
      if (f.zonaId && m.zonaId !== f.zonaId) continue;
      if (f.variable && m.variable !== f.variable) continue;
      const t = m.instante.getTime();
      if (t < f.desde.getTime() || t > f.hasta.getTime()) continue;
      const balde = Math.floor(t / paso) * paso;
      const k = `${balde}|${m.zonaId}|${m.variable}`;
      const g = grupos.get(k) ?? { t: balde, zonaId: m.zonaId, variable: m.variable, suma: 0, n: 0 };
      g.suma += m.valor;
      g.n++;
      grupos.set(k, g);
    }
    return [...grupos.values()]
      .map((g) => ({ t: new Date(g.t), zonaId: g.zonaId, variable: g.variable, valor: g.suma / g.n }))
      .sort((a, b) => b.t.getTime() - a.t.getTime());
  }

  async manuales(f: { zonaId?: string; desde: Date }) {
    return this.datos.filter((m) => m.origen === "manual" && (!f.zonaId || m.zonaId === f.zonaId) && m.instante >= f.desde);
  }

  async desde(instante: Date) {
    return this.datos.filter((m) => m.instante >= instante);
  }
}

export class AlertasEnMemoria implements AlertasRepositorio {
  private datos: Alerta[] = [];

  async activas() { return this.datos.filter((a) => a.activa).map((a) => ({ ...a })); }
  async listar(desde: Date) { return this.datos.filter((a) => a.creadaEn >= desde || a.activa).map((a) => ({ ...a })); }
  async porId(id: string) { const a = this.datos.find((x) => x.id === id); return a ? { ...a } : null; }

  async crear(c: CondicionDeAlerta, ahora: Date): Promise<Alerta> {
    const a: Alerta = { ...c, id: randomUUID(), activa: true, creadaEn: ahora, actualizadaEn: ahora, resueltaEn: null, reconocimiento: null };
    this.datos.push(a);
    return { ...a };
  }

  async actualizar(id: string, cambios: Partial<Alerta>) {
    const a = this.datos.find((x) => x.id === id);
    if (a) Object.assign(a, cambios);
  }
}
