import type { Medicion } from "../domain/modelo";
import type { Punto } from "../domain/tendencia";

interface Ultimo {
  valor: number;
  instante: Date;
  origen: Medicion["origen"];
}

/**
 * Memoria de corto plazo del sistema: últimos N minutos por zona y variable.
 * Permite evaluar tendencias en cada lectura sin consultar la base de datos.
 * Se reconstruye al arrancar a partir de las mediciones recientes guardadas.
 */
export class VentanaReciente {
  private series = new Map<string, Punto[]>();
  private ultimos = new Map<string, Ultimo>();
  private porDispositivo = new Map<string, number[]>();
  /** última lectura de un sensor (no manual) por zona */
  private ultimaSensorZona = new Map<string, Date>();

  constructor(private readonly minutos = 30) {}

  agregar(m: Medicion): void {
    const k = `${m.zonaId}|${m.variable}`;
    const serie = this.series.get(k) ?? [];
    serie.push({ t: m.instante.getTime(), v: m.valor });
    serie.sort((a, b) => a.t - b.t);
    const limite = serie[serie.length - 1].t - this.minutos * 60_000;
    while (serie.length && serie[0].t < limite) serie.shift();
    this.series.set(k, serie);

    const previo = this.ultimos.get(k);
    if (!previo || previo.instante <= m.instante) this.ultimos.set(k, { valor: m.valor, instante: m.instante, origen: m.origen });

    if (m.dispositivoId) {
      const kd = `${m.dispositivoId}|${m.variable}`;
      const vals = this.porDispositivo.get(kd) ?? [];
      vals.push(m.valor);
      if (vals.length > 20) vals.shift();
      this.porDispositivo.set(kd, vals);
    }
    if (m.origen !== "manual") {
      const prev = this.ultimaSensorZona.get(m.zonaId);
      if (!prev || prev < m.instante) this.ultimaSensorZona.set(m.zonaId, m.instante);
    }
  }

  serie(zonaId: string, variable: string, minutos: number, ahora: Date): Punto[] {
    const desde = ahora.getTime() - minutos * 60_000;
    return (this.series.get(`${zonaId}|${variable}`) ?? []).filter((p) => p.t >= desde);
  }

  ultimo(zonaId: string, variable: string): Ultimo | null {
    return this.ultimos.get(`${zonaId}|${variable}`) ?? null;
  }

  recientesDispositivo(dispositivoId: string, variable: string): number[] {
    return this.porDispositivo.get(`${dispositivoId}|${variable}`) ?? [];
  }

  ultimaLecturaSensor(zonaId: string): Date | null {
    return this.ultimaSensorZona.get(zonaId) ?? null;
  }
}
