/**
 * Puertos de SALIDA: lo que el núcleo necesita del mundo exterior.
 * El núcleo solo conoce estas interfaces; los adaptadores (memoria, Supabase,
 * SSE...) las implementan. Cambiar de base de datos = cambiar de adaptador.
 */
import type { Alerta, CondicionDeAlerta, ConfiguracionLimites, Dispositivo, Medicion, Plano, Turno, Umbrales, Variable, Zona } from "../../domain/modelo";

export interface CatalogoRepositorio {
  zonas(): Promise<Zona[]>;
  variables(): Promise<Variable[]>;
  planoVigente(): Promise<Plano | null>;
  dispositivos(): Promise<Dispositivo[]>;
  turno(): Promise<Turno>;
  actualizarDispositivo(id: string, cambios: { bateria?: number | null; ultimaComunicacion?: Date }): Promise<void>;
  guardarUmbrales(clave: string, umbrales: Umbrales, usuario: string): Promise<void>;
  /** Límites normativos, límites por zona y criterios internos (pantalla "Límites y configuración"). */
  limitesConfiguracion(): Promise<ConfiguracionLimites>;
  guardarCriterios(valores: Record<string, number | string>, usuario: string): Promise<void>;
}

/** Punto agregado (promedio) de una serie temporal. */
export interface PuntoAgregado {
  t: Date;
  zonaId: string;
  variable: string;
  valor: number;
}

export interface MedicionesRepositorio {
  guardar(mediciones: Medicion[]): Promise<void>;
  /** Promedios por intervalo de `pasoMin` minutos. Excluye registros manuales. */
  agregadas(filtro: { zonaId?: string; variable?: string; desde: Date; hasta: Date; pasoMin: number }): Promise<PuntoAgregado[]>;
  /** Registros manuales (contingencia) en un periodo. */
  manuales(filtro: { zonaId?: string; desde: Date }): Promise<Medicion[]>;
  /** Mediciones crudas desde un instante (para recuperar estado al reiniciar). */
  desde(instante: Date): Promise<Medicion[]>;
}

export interface AlertasRepositorio {
  activas(): Promise<Alerta[]>;
  listar(desde: Date): Promise<Alerta[]>;
  porId(id: string): Promise<Alerta | null>;
  crear(condicion: CondicionDeAlerta, ahora: Date): Promise<Alerta>;
  actualizar(id: string, cambios: Partial<Omit<Alerta, "id" | "clave">>): Promise<void>;
}

export type EventoDominio =
  | { tipo: "mediciones"; zonas: string[] }
  | { tipo: "alerta"; accion: "creada" | "actualizada" | "resuelta" | "reconocida"; alertaId: string; zonaId: string | null };

export interface Publicador {
  publicar(evento: EventoDominio): void;
}

export interface Reloj {
  ahora(): Date;
}
