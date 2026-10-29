/**
 * Perfiles de la atmósfera "normal" de cada zona: valor base y ruido típico
 * por variable. Son valores ilustrativos para la simulación, no mediciones reales.
 */

/** Valor base por defecto de cada variable (unidades canónicas). */
export const BASE: Record<string, number> = {
  o2: 20.85, // % vol
  ch4: 0.06, // % vol
  co: 4, // ppm
  co2: 0.08, // % vol
  h2s: 0.1, // ppm
  no2: 0.05, // ppm
  temp: 22, // °C
  hr: 80, // %
  air: 1.2, // m/s
  pm: 0.15, // mg/m³
  ventilador: 1, // 1 = en marcha
  personas: 0,
};

/** Amplitud del ruido aleatorio de cada variable (similar a la de un sensor real). */
export const RUIDO: Record<string, number> = {
  o2: 0.05, ch4: 0.015, co: 1, co2: 0.015, h2s: 0.05, no2: 0.02, temp: 0.12, hr: 1.2, air: 0.05, pm: 0.03, ventilador: 0, personas: 0,
};

export const DECIMALES: Record<string, number> = {
  o2: 2, ch4: 3, co: 1, co2: 3, h2s: 2, no2: 2, temp: 2, hr: 1, air: 2, pm: 3, ventilador: 0, personas: 0,
};

/** Diferencias de cada zona respecto a la base. */
export const PERFIL_ZONA: Record<string, Partial<Record<string, number>>> = {
  "bocamina": { o2: 20.9, ch4: 0.0, co: 1, temp: 18, hr: 72, air: 2.2, personas: 4 },
  "galeria-1": { co: 6, no2: 0.08, temp: 22, air: 1.6, personas: 6 },
  "frente-1": { ch4: 0.22, co: 9, co2: 0.18, temp: 25.5, hr: 88, air: 0.6, pm: 0.35, personas: 9 },
  "inclinado": { ch4: 0.14, temp: 23, air: 1.0, personas: 2 },
  "galeria-2": { co: 6, temp: 24, air: 0.9, personas: 5 },
  "frente-2": { o2: 20.6, ch4: 0.28, co: 8, co2: 0.22, temp: 25, hr: 90, air: 0.55, pm: 0.3, personas: 7 },
  "bombeo": { temp: 23.5, hr: 94, air: 0.7, personas: 1 },
  "retorno": { o2: 20.6, ch4: 0.2, co: 11, co2: 0.25, temp: 25, hr: 92, air: 2.5, personas: 0 },
};
