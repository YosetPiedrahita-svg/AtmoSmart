import type { Umbrales } from "./modelo";

export interface Punto {
  /** instante en milisegundos */
  t: number;
  v: number;
}

export interface Tendencia {
  /** unidades de la variable por minuto */
  pendiente: number;
  direccion: "up" | "down" | "flat";
  /** minutos estimados hasta el límite de alarma (null si no se acerca) */
  minutosHastaAlarma: number | null;
}

const MIN = 60_000;

/**
 * Regresión lineal por mínimos cuadrados sobre los puntos de la ventana.
 * Devuelve la pendiente (por minuto) y el coeficiente de determinación R²,
 * que indica qué tan "limpia" es la tendencia frente al ruido del sensor.
 */
export function regresion(puntos: Punto[]): { pendiente: number; r2: number } {
  const n = puntos.length;
  if (n < 2) return { pendiente: 0, r2: 0 };
  const t0 = puntos[0].t;
  const xs = puntos.map((p) => (p.t - t0) / MIN);
  const ys = puntos.map((p) => p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return { pendiente: 0, r2: 0 };
  const pendiente = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { pendiente, r2 };
}

/**
 * Analiza la tendencia de una variable y estima cuántos minutos faltan para
 * llegar al límite de alarma si el ritmo actual se mantiene.
 *
 * Se considera tendencia real (no ruido) cuando hay suficientes puntos, la
 * ventana cubre al menos `minMinutos` y R² ≥ `r2Minimo`.
 */
export function analizarTendencia(
  puntos: Punto[],
  u: Umbrales,
  opciones: { r2Minimo?: number; minPuntos?: number; minMinutos?: number } = {},
): Tendencia {
  const { r2Minimo = 0.6, minPuntos = 6, minMinutos = 3 } = opciones;
  const plano: Tendencia = { pendiente: 0, direccion: "flat", minutosHastaAlarma: null };
  if (puntos.length < minPuntos) return plano;
  if ((puntos[puntos.length - 1].t - puntos[0].t) / MIN < minMinutos) return plano;

  const { pendiente, r2 } = regresion(puntos);
  if (r2 < r2Minimo || pendiente === 0) return { ...plano, pendiente };

  const ultimo = puntos[puntos.length - 1].v;
  let minutos: number | null = null;
  if (u.highCrit != null && pendiente > 0 && ultimo < u.highCrit) minutos = (u.highCrit - ultimo) / pendiente;
  if (u.lowCrit != null && pendiente < 0 && ultimo > u.lowCrit) minutos = (ultimo - u.lowCrit) / -pendiente;

  return {
    pendiente,
    direccion: pendiente > 0 ? "up" : "down",
    minutosHastaAlarma: minutos != null ? Math.max(0, Math.round(minutos)) : null,
  };
}
