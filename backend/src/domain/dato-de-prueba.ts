/**
 * Valor de prueba para provocar un nivel de riesgo en una variable.
 * Sirve para generar datos que disparen precauciones y alarmas (y para volver a normal) sin esperar
 * a un escenario completo. Se calcula SIEMPRE desde los límites vigentes de la variable.
 */
import type { Variable } from "./modelo";

export type NivelPrueba = "ok" | "warn" | "crit";
export const NIVELES_PRUEBA: NivelPrueba[] = ["ok", "warn", "crit"];

const redondear = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Devuelve el valor que cae en `nivel`, o null si la variable no tiene límites para ese nivel. */
export function valorParaNivel(v: Variable, nivel: NivelPrueba): number | null {
  const { lowCrit, lowWarn, highWarn, highCrit } = v.umbrales;
  // O₂ se prueba por deficiencia (lo habitual en mina); lo demás, por exceso. Sin límite superior, por defecto.
  const ladoBajo = v.clave === "o2" || (highWarn == null && highCrit == null);
  let x: number | null = null;

  if (nivel === "ok") {
    if (v.clave === "o2" && lowWarn != null && (highWarn == null || 20.9 < highWarn)) x = 20.9; // aire normal
    else if (lowWarn != null && highWarn != null) x = (lowWarn + highWarn) / 2;
    else if (highWarn != null) x = highWarn * 0.3;
    else if (highCrit != null) x = highCrit * 0.3;
    else if (lowWarn != null) x = lowWarn * 1.5;
    else if (lowCrit != null) x = lowCrit * 3;
  } else if (nivel === "warn") {
    if (ladoBajo && lowWarn != null) x = lowCrit != null ? (lowWarn + lowCrit) / 2 : lowWarn * 0.95;
    else if (highWarn != null) x = highCrit != null ? highWarn + 0.4 * (highCrit - highWarn) : highWarn * 1.1;
  } else {
    if (ladoBajo && lowCrit != null) x = lowCrit * 0.9;
    else if (highCrit != null) x = highCrit * 1.15;
    else if (lowCrit != null) x = lowCrit * 0.9;
  }

  if (x == null) return null;
  if (v.rangoMin != null) x = Math.max(v.rangoMin, x);
  if (v.rangoMax != null) x = Math.min(v.rangoMax, x);
  return redondear(x, Math.max(v.decimales, 2));
}
