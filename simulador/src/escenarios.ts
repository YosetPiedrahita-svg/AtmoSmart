/**
 * Escenarios de la simulación. Cada uno altera las lecturas de UNA zona
 * (por defecto el Frente de explotación 2) en función de los minutos
 * transcurridos desde que se activó.
 *
 * Los valores son ilustrativos para la demo; las magnitudes y velocidades
 * reales deben validarse con Ingeniería de Minas.
 */

export interface Escenario {
  id: string;
  tecla: string;
  nombre: string;
  descripcion: string;
  /** cambio que se suma al valor normal de la variable */
  delta?(variable: string, min: number): number;
  /** valor que reemplaza al normal (p. ej. ventilador apagado) */
  fijar?(variable: string, min: number): number | undefined;
  /** tipos de equipo que dejan de transmitir */
  silenciar?(tipoDispositivo: string): boolean;
}

const sube = (ritmo: number, max: number, min: number) => Math.min(ritmo * min, max);
const decae = (pico: number, constanteMin: number, min: number) => pico * Math.exp(-min / constanteMin);

export const ESCENARIOS: Escenario[] = [
  {
    id: "normal",
    tecla: "1",
    nombre: "Operación normal",
    descripcion: "Todas las variables dentro de su rango habitual con ruido de sensor.",
  },
  {
    id: "metano",
    tecla: "2",
    nombre: "Metano en ascenso",
    descripcion: "El CH₄ sube de forma sostenida y el O₂ baja levemente: el sistema debe avisar ANTES de llegar a la alarma.",
    delta: (v, m) => (v === "ch4" ? sube(0.015, 1.1, m) : v === "o2" ? -sube(0.004, 0.4, m) : 0),
  },
  {
    id: "ventilador",
    tecla: "3",
    nombre: "Ventilador auxiliar detenido",
    descripcion: "Se detiene el ventilador del frente: cae la velocidad del aire y suben metano, temperatura y polvo.",
    fijar: (v) => (v === "ventilador" ? 0 : v === "air" ? 0.06 : undefined),
    delta: (v, m) => (v === "ch4" ? sube(0.03, 1.5, m) : v === "temp" ? sube(0.08, 4, m) : v === "pm" ? sube(0.015, 1, m) : 0),
  },
  {
    id: "sin-senal",
    tecla: "4",
    nombre: "Detector sin señal",
    descripcion: "El detector multigas fijo deja de transmitir: la zona debe pasar a 'sin señal', nunca a 'normal'.",
    silenciar: (tipo) => tipo === "Detector multigas fijo",
  },
  {
    id: "voladura",
    tecla: "5",
    nombre: "Gases post-voladura",
    descripcion: "Pico de CO, NO₂ y polvo después de una voladura, que decae con la ventilación.",
    delta: (v, m) =>
      v === "co" ? decae(70, 12, m) : v === "no2" ? decae(4, 12, m) : v === "pm" ? decae(1.4, 10, m) : v === "co2" ? decae(0.3, 15, m) : 0,
  },
  {
    id: "polvo",
    tecla: "6",
    nombre: "Polvo de carbón alto",
    descripcion: "Aumenta el polvo respirable (p. ej. corte en seco o falla del riego).",
    delta: (v, m) => (v === "pm" ? sube(0.04, 1.2, m) : 0),
  },
];

export const escenarioPorId = (id: string) => ESCENARIOS.find((e) => e.id === id);
export const escenarioPorTecla = (t: string) => ESCENARIOS.find((e) => e.tecla === t);
