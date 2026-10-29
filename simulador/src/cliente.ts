/**
 * Cliente HTTP hacia el backend. El simulador se comporta como un gateway de
 * campo: consulta qué equipos están registrados y envía sus lecturas en el
 * formato canónico (POST /api/ingesta). Nunca escribe en la base de datos.
 */

export interface DispositivoRemoto {
  id: string;
  type: string;
  zoneId: string;
  vars: string[];
}

export interface MensajeCanonico {
  dispositivoId: string;
  zonaId: string;
  instante: string;
  origen: "simulado";
  bateria?: number;
  lecturas: { variable: string; valor: number; unidad?: string }[];
}

export class ClienteBackend {
  constructor(private readonly url: string, private readonly token?: string) {}

  private headers() {
    return { "Content-Type": "application/json", ...(this.token ? { "x-api-key": this.token } : {}) };
  }

  async dispositivos(): Promise<DispositivoRemoto[]> {
    const r = await fetch(`${this.url}/api/dispositivos`);
    if (!r.ok) throw new Error(`GET /api/dispositivos → ${r.status}`);
    return r.json() as Promise<DispositivoRemoto[]>;
  }

  async enviar(mensajes: MensajeCanonico[], historico = false): Promise<{ aceptadas: number; rechazadas: unknown[] }> {
    const r = await fetch(`${this.url}/api/ingesta${historico ? "/historico" : ""}`, { method: "POST", headers: this.headers(), body: JSON.stringify(mensajes) });
    if (!r.ok) throw new Error(`POST /api/ingesta → ${r.status} ${await r.text()}`);
    return r.json() as Promise<{ aceptadas: number; rechazadas: unknown[] }>;
  }
}

/** Equipos que el simulador imita: fijos con variables (no portátiles ni gateway). */
export const simulables = (ds: DispositivoRemoto[]) => ds.filter((d) => d.vars.length > 0 && !d.type.includes("portátil"));

/** Lee argumentos tipo --clave valor. */
export function argumentos(): Record<string, string> {
  const a = process.argv.slice(2);
  const r: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) {
      const clave = a[i].slice(2);
      const valor = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "true";
      r[clave] = valor;
    }
  }
  return r;
}
