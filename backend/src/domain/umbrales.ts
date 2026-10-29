import type { Estado, Umbrales } from "./modelo";

/**
 * Compara un valor con los umbrales de su variable.
 *   valor <= lowCrit  o  valor >= highCrit  → alarma
 *   valor <= lowWarn  o  valor >= highWarn  → precaución
 */
export function evaluarValor(valor: number | null | undefined, u: Umbrales): Estado {
  if (valor == null || Number.isNaN(valor)) return "off";
  if ((u.highCrit != null && valor >= u.highCrit) || (u.lowCrit != null && valor <= u.lowCrit)) return "crit";
  if ((u.highWarn != null && valor >= u.highWarn) || (u.lowWarn != null && valor <= u.lowWarn)) return "warn";
  return "ok";
}

/** Límite que se superó y en qué dirección, para explicar la alerta. */
export function limiteSuperado(valor: number, u: Umbrales, estado: Estado): { limite: number; direccion: "alto" | "bajo" } | null {
  if (estado === "crit") {
    if (u.highCrit != null && valor >= u.highCrit) return { limite: u.highCrit, direccion: "alto" };
    if (u.lowCrit != null && valor <= u.lowCrit) return { limite: u.lowCrit, direccion: "bajo" };
  }
  if (estado === "warn") {
    if (u.highWarn != null && valor >= u.highWarn) return { limite: u.highWarn, direccion: "alto" };
    if (u.lowWarn != null && valor <= u.lowWarn) return { limite: u.lowWarn, direccion: "bajo" };
  }
  return null;
}

/** Los umbrales deben ir de menor a mayor: lowCrit < lowWarn < highWarn < highCrit. */
export function umbralesValidos(u: Umbrales): boolean {
  const orden = [u.lowCrit, u.lowWarn, u.highWarn, u.highCrit].filter((x): x is number => x != null);
  return orden.every((x, i) => i === 0 || x > orden[i - 1]);
}
