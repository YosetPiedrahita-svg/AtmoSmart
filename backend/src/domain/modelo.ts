/**
 * Modelo del dominio de AtmoSmart.
 * Solo tipos y reglas puras: nada de HTTP, base de datos ni hardware.
 */

/** Estado de riesgo de una variable o zona. */
export type Estado = "ok" | "warn" | "crit" | "off";

export type Severidad = "crit" | "warn" | "off" | "info";

export type Origen = "sensor_fijo" | "portatil" | "manual" | "simulado";

export type Calidad = "valida" | "fuera_de_rango" | "congelada" | "calibracion_vencida" | "manual";

export type TipoLabor = "frente_ciego" | "galeria_entrada" | "galeria_retorno" | "chimenea" | "servicio" | "acceso" | "otra";

/** Umbrales de una variable. Cualquiera puede ser null (no aplica). */
export interface Umbrales {
  lowCrit: number | null;
  lowWarn: number | null;
  highWarn: number | null;
  highCrit: number | null;
}

export interface Variable {
  clave: string;
  nombre: string;
  simbolo: string;
  unidad: string;
  decimales: number;
  rangoMin: number | null;
  rangoMax: number | null;
  umbrales: Umbrales;
  referencia: string | null;
  /** false para variables de contexto (ventilador, personas) que no generan alertas por umbral. */
  monitoreada: boolean;
}

export interface Zona {
  id: string;
  nombre: string;
  nivel: string;
  tipo: string;
  tipoLabor: TipoLabor;
  orden: number;
}

export interface Dispositivo {
  id: string;
  tipo: string;
  zonaId: string;
  variables: string[];
  alimentacion: string | null;
  perfil: string | null;
  portador: string | null;
  calibracionVence: string | null; // AAAA-MM-DD
  bateria: number | null;
  ultimaComunicacion: Date | null;
}

export interface Medicion {
  zonaId: string;
  variable: string;
  valor: number;
  instante: Date;
  dispositivoId: string | null;
  origen: Origen;
  calidad: Calidad;
  detalle?: Record<string, unknown> | null;
}

export interface Reconocimiento {
  usuario: string;
  nota: string;
  instante: Date;
}

export interface Alerta {
  id: string;
  clave: string;
  severidad: Severidad;
  tipo: string;
  zonaId: string | null;
  variable: string | null;
  valor: number | null;
  limite: number | null;
  titulo: string;
  detalle: string;
  protocolo: string;
  activa: boolean;
  creadaEn: Date;
  actualizadaEn: Date;
  resueltaEn: Date | null;
  reconocimiento: Reconocimiento | null;
}

/** Condición de riesgo detectada por las reglas. Se convierte en Alerta al sincronizar. */
export interface CondicionDeAlerta {
  clave: string;
  severidad: Severidad;
  tipo: string;
  zonaId: string | null;
  variable: string | null;
  valor: number | null;
  limite: number | null;
  titulo: string;
  detalle: string;
  protocolo: string;
}

export interface Plano {
  version: number;
  actualizado: string;
  fuente: string;
  contenido: unknown;
}

export interface Turno {
  turno: string;
  desde: string;
  hasta: string;
  supervisor: string;
}

/** Tipos de alerta (texto que ve el usuario). */
export const TIPO = {
  umbral: "Umbral superado",
  tendencia: "Tendencia predictiva",
  ventilacion: "Falla de ventilación",
  sinSenal: "Sensor sin señal",
  calibracion: "Calibración vencida",
} as const;

export const RANGO_ESTADO: Record<Estado, number> = { ok: 0, off: 1, warn: 2, crit: 3 };

export function peorEstado(estados: Estado[]): Estado {
  return estados.reduce<Estado>((peor, e) => (RANGO_ESTADO[e] > RANGO_ESTADO[peor] ? e : peor), "ok");
}

/** Fila de la tabla de límites normativos (variable, límite, cómo se evalúa, referencia). */
export interface LimiteNormativo { id: string; variable: string; limite: string; comoSeEvalua: string; referencia: string; orden: number }

/** Límites de una zona: sitio de la labor (metano) y tipo de vía (velocidad del aire). */
export interface LimiteZona {
  zonaId: string; sitioLabor: string; laborClave: string; ch4Max: number; laborCriterioInterno: boolean;
  tipoVia: string; ventClave: string; aireMin: number | null; aireMax: number | null; viaCriterioInterno: boolean;
}

/** Criterio interno del equipo (no es un límite legal). `valor` es un número o un texto. */
export interface CriterioInterno { clave: string; etiqueta: string; unidad: string; valor: number | string }

export interface ConfiguracionLimites { normativos: LimiteNormativo[]; zonas: LimiteZona[]; criterios: CriterioInterno[] }
