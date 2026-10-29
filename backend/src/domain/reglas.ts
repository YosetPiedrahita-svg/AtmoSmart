import { evaluarValor, limiteSuperado } from "./umbrales";
import { analizarTendencia, type Punto, type Tendencia } from "./tendencia";
import { TIPO, peorEstado, type CondicionDeAlerta, type Estado, type Variable, type Zona } from "./modelo";

export interface EntradaEvaluacion {
  zona: Zona;
  variables: Variable[];
  /** último valor conocido por variable (incluye contexto: ventilador, personas) */
  actuales: Record<string, number | null>;
  /** serie reciente por variable monitoreada (para tendencias) */
  series: Record<string, Punto[]>;
  /** true si los sensores de gases de la zona no reportan */
  sinSenal: boolean;
  /** minutos de anticipación para alertas predictivas */
  horizonteMin: number;
}

export interface ResultadoEvaluacion {
  estadoZona: Estado;
  estados: Record<string, Estado>;
  tendencias: Record<string, Tendencia>;
  condiciones: CondicionDeAlerta[];
}

const fmt = (v: number, d: number) => v.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Evalúa el riesgo atmosférico de una zona y devuelve las condiciones que
 * deben convertirse en alertas.
 *
 *  1. Umbral: cada variable contra su límite vigente.
 *  2. Tendencia: si una variable avanza hacia la alarma y la alcanzaría antes
 *     del horizonte configurado → alerta predictiva.
 *  3. Reglas compuestas (contexto de la operación):
 *     - Ventilador auxiliar detenido en un frente ciego (alarma si hay personas).
 *     - Metano en ascenso mientras cae la velocidad del aire → falla de ventilación probable.
 *
 * Si la zona no tiene señal, NUNCA se reporta como normal: su estado es "off".
 */
export function evaluarZona(e: EntradaEvaluacion): ResultadoEvaluacion {
  const estados: Record<string, Estado> = {};
  const tendencias: Record<string, Tendencia> = {};
  const condiciones: CondicionDeAlerta[] = [];
  const z = e.zona;

  for (const v of e.variables.filter((x) => x.monitoreada)) {
    const valor = e.actuales[v.clave] ?? null;
    const estado = evaluarValor(valor, v.umbrales);
    const tendencia = analizarTendencia(e.series[v.clave] ?? [], v.umbrales);
    estados[v.clave] = estado;
    tendencias[v.clave] = tendencia;
    if (e.sinSenal || valor == null) continue;

    if (estado === "warn" || estado === "crit") {
      const sup = limiteSuperado(valor, v.umbrales, estado)!;
      condiciones.push({
        clave: `umbral:${z.id}:${v.clave}`,
        severidad: estado,
        tipo: TIPO.umbral,
        zonaId: z.id,
        variable: v.clave,
        valor,
        limite: sup.limite,
        titulo: `${v.nombre} ${sup.direccion === "alto" ? "por encima" : "por debajo"} del límite de ${estado === "crit" ? "alarma" : "precaución"}`,
        detalle: `${fmt(valor, v.decimales)} ${v.unidad} (límite ${fmt(sup.limite, v.decimales)} ${v.unidad})`,
        protocolo: v.clave,
      });
    }

    if (estado !== "crit" && tendencia.direccion !== "flat" && tendencia.minutosHastaAlarma != null && tendencia.minutosHastaAlarma <= e.horizonteMin) {
      condiciones.push({
        clave: `tendencia:${z.id}:${v.clave}`,
        severidad: "warn",
        tipo: TIPO.tendencia,
        zonaId: z.id,
        variable: v.clave,
        valor,
        limite: tendencia.direccion === "up" ? v.umbrales.highCrit : v.umbrales.lowCrit,
        titulo: `${v.nombre} en ${tendencia.direccion === "up" ? "ascenso" : "descenso"}: alcanzaría la alarma en ~${tendencia.minutosHastaAlarma} min`,
        detalle: `Ritmo ${tendencia.pendiente > 0 ? "+" : ""}${fmt(tendencia.pendiente, Math.max(2, v.decimales + 1))} ${v.unidad}/min en la ventana reciente.`,
        protocolo: v.clave,
      });
    }
  }

  // --- Reglas compuestas -----------------------------------------------------
  const ventilador = e.actuales["ventilador"];
  const personas = e.actuales["personas"] ?? 0;
  if (!e.sinSenal && z.tipoLabor === "frente_ciego" && ventilador === 0) {
    const conPersonal = personas > 0;
    condiciones.push({
      clave: `ventilacion:${z.id}:ventilador`,
      severidad: conPersonal ? "crit" : "warn",
      tipo: TIPO.ventilacion,
      zonaId: z.id,
      variable: "ventilador",
      valor: 0,
      limite: null,
      titulo: conPersonal
        ? `Ventilador auxiliar detenido con ${personas} persona(s) en el frente`
        : "Ventilador auxiliar detenido (frente sin personal)",
      detalle: "Un frente ciego sin ventilación auxiliar acumula gases rápidamente, aunque las lecturas aún estén bajas.",
      protocolo: "air",
    });
  }

  if (!e.sinSenal && tendencias["ch4"]?.direccion === "up" && tendencias["air"]?.direccion === "down") {
    condiciones.push({
      clave: `ventilacion:${z.id}:ch4-aire`,
      severidad: "crit",
      tipo: TIPO.ventilacion,
      zonaId: z.id,
      variable: "air",
      valor: e.actuales["air"] ?? null,
      limite: null,
      titulo: "Posible falla de ventilación: el metano sube mientras baja la velocidad del aire",
      detalle: "Revisar ventilador auxiliar, manga y puertas de ventilación.",
      protocolo: "air",
    });
  }

  let estadoZona: Estado = e.sinSenal ? "off" : peorEstado(Object.values(estados).filter((s) => s !== "off"));
  if (!e.sinSenal && condiciones.some((c) => c.severidad === "crit")) estadoZona = "crit";
  else if (!e.sinSenal && estadoZona === "ok" && condiciones.some((c) => c.severidad === "warn")) estadoZona = "warn";

  return { estadoZona, estados, tendencias, condiciones };
}
