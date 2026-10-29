/**
 * Puertos de ENTRADA: lo que el mundo puede pedirle al núcleo.
 * Los adaptadores de entrada (HTTP, simulador, Modbus, MQTT, CSV...) solo
 * llaman a estas operaciones; nunca tocan el dominio ni la base de datos.
 */
import type { Origen } from "../../domain/modelo";

/** Mensaje canónico que todo adaptador de sensores debe entregar. */
export interface MensajeCanonico {
  dispositivoId: string;
  zonaId?: string;
  /** ISO 8601; si falta se usa la hora de recepción */
  instante?: string;
  origen?: Origen;
  bateria?: number | null;
  lecturas: { variable: string; valor: number; unidad?: string }[];
}

export interface ResultadoIngesta {
  aceptadas: number;
  rechazadas: { motivo: string; dispositivoId?: string; variable?: string }[];
}

export interface IngerirMediciones {
  /** Guarda, evalúa riesgo y sincroniza alertas. */
  ingerir(mensajes: MensajeCanonico[]): Promise<ResultadoIngesta>;
  /** Carga de datos históricos: guarda sin generar alertas. */
  ingerirHistorico(mensajes: MensajeCanonico[]): Promise<ResultadoIngesta>;
}

export interface RegistrarLecturaManual {
  registrarManual(cmd: { zonaId: string; valores: Record<string, number | null>; detector: string; motivo: string; usuario: string }): Promise<ResultadoIngesta>;
}

export interface GestionarAlertas {
  reconocer(alertaId: string, usuario: string, nota: string): Promise<void>;
}

export interface GestionarLimites {
  actualizarLimites(clave: string, umbrales: { lowCrit: number | null; lowWarn: number | null; highWarn: number | null; highCrit: number | null }, usuario: string): Promise<void>;
}
