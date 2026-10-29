/**
 * Genera el valor de una variable en una zona y un instante dados:
 *   valor = base de la zona + onda lenta + ruido aleatorio + efecto del escenario
 */
import { BASE, DECIMALES, PERFIL_ZONA, RUIDO } from "./perfiles";
import type { Escenario } from "./escenarios";

export interface EscenarioActivo {
  escenario: Escenario;
  zonaId: string;
  /** instante en que se activó (ms) */
  inicio: number;
  /** multiplica el paso del tiempo del escenario (5 = cinco veces más rápido) */
  velocidad: number;
}

/** Ruido con distribución aproximadamente normal (suma de uniformes). */
const ruidoNormal = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/** Pequeña firma por zona/variable para que cada serie tenga su propia onda. */
const fase = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 628 / 100;

export function generarValor(zonaId: string, variable: string, instante: number, activo?: EscenarioActivo | null): number {
  const perfil = PERFIL_ZONA[zonaId] ?? {};
  let v = perfil[variable] ?? BASE[variable] ?? 0;

  if (variable === "personas") {
    // Algún movimiento de personal (entradas/salidas) de vez en cuando.
    if (v > 0 && Math.random() < 0.02) v += Math.random() < 0.5 ? -1 : 1;
    return Math.max(0, Math.round(v));
  }

  const ruido = RUIDO[variable] ?? 0;
  v += Math.sin(instante / (47 * 60_000) + fase(zonaId + variable)) * ruido * 1.5;
  v += ruidoNormal() * ruido;

  if (activo && activo.zonaId === zonaId) {
    const min = Math.max(0, ((instante - activo.inicio) / 60_000) * activo.velocidad);
    const fijo = activo.escenario.fijar?.(variable, min);
    if (fijo !== undefined) v = fijo + (variable === "ventilador" ? 0 : ruidoNormal() * ruido * 0.5);
    v += activo.escenario.delta?.(variable, min) ?? 0;
  }

  if (variable === "ventilador") return v >= 0.5 ? 1 : 0;
  if (variable === "hr") v = Math.min(100, v);
  const d = DECIMALES[variable] ?? 2;
  return Math.round(Math.max(0, v) * 10 ** d) / 10 ** d;
}
