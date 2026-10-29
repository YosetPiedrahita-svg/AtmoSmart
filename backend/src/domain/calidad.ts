import type { Calidad, Dispositivo, Origen, Variable } from "./modelo";

/**
 * Clasifica la calidad de una lectura antes de evaluar el riesgo.
 * Una lectura dudosa no se descarta: se guarda marcada para que se vea.
 */
export function clasificarCalidad(params: {
  valor: number;
  variable: Variable;
  origen: Origen;
  dispositivo: Dispositivo | null;
  ahora: Date;
  /** últimos valores del mismo equipo y variable (para detectar sensor congelado) */
  recientes?: number[];
}): Calidad {
  const { valor, variable, origen, dispositivo, ahora, recientes = [] } = params;

  if (origen === "manual") return "manual";
  if ((variable.rangoMin != null && valor < variable.rangoMin) || (variable.rangoMax != null && valor > variable.rangoMax)) {
    return "fuera_de_rango";
  }
  if (dispositivo?.calibracionVence && dispositivo.calibracionVence < ahora.toISOString().slice(0, 10)) {
    return "calibracion_vencida";
  }
  // Un sensor analógico real siempre tiene algo de ruido: muchos valores
  // idénticos seguidos sugieren un sensor bloqueado. No aplica a variables
  // discretas como el estado del ventilador o el conteo de personas.
  if (variable.monitoreada && recientes.length >= 10 && recientes.slice(-10).every((v) => v === valor)) {
    return "congelada";
  }
  return "valida";
}

/**
 * Conversión a unidades canónicas.
 * El metano a veces se reporta en %LEL (porcentaje del límite inferior de
 * explosividad). Con LEL del metano = 5 % vol → 1 %LEL = 0,05 % vol.
 * Validar el factor con la ficha técnica y la calibración del equipo.
 */
export function aUnidadCanonica(variable: string, valor: number, unidad?: string): number {
  if (!unidad) return valor;
  const u = unidad.trim().toLowerCase();
  if (variable === "ch4" && (u === "%lel" || u === "lel")) return valor * 0.05;
  if (variable === "co2" && u === "ppm") return valor / 10_000; // ppm → % vol
  if (variable === "o2" && u === "ppm") return valor / 10_000;
  return valor;
}
