import { describe, expect, it } from "vitest";
import { evaluarValor, umbralesValidos } from "../src/domain/umbrales";
import { analizarTendencia } from "../src/domain/tendencia";
import { aUnidadCanonica, clasificarCalidad } from "../src/domain/calidad";
import { evaluarZona } from "../src/domain/reglas";
import type { Variable, Zona } from "../src/domain/modelo";

const ch4: Variable = {
  clave: "ch4", nombre: "Metano", simbolo: "CH₄", unidad: "%", decimales: 2, rangoMin: 0, rangoMax: 100,
  umbrales: { lowCrit: null, lowWarn: null, highWarn: 0.5, highCrit: 1.0 }, referencia: null, monitoreada: true,
};
const o2: Variable = { ...ch4, clave: "o2", nombre: "Oxígeno", umbrales: { lowCrit: 19.5, lowWarn: 20, highWarn: 22.5, highCrit: 23.5 } };
const ventilador: Variable = { ...ch4, clave: "ventilador", monitoreada: false, umbrales: { lowCrit: null, lowWarn: null, highWarn: null, highCrit: null } };
const personas: Variable = { ...ventilador, clave: "personas" };
const frente: Zona = { id: "frente-2", nombre: "Frente 2", nivel: "N2", tipo: "Frente", tipoLabor: "frente_ciego", orden: 0 };

const serieLineal = (desde: number, pendientePorMin: number, minutos: number) =>
  Array.from({ length: minutos + 1 }, (_, i) => ({ t: i * 60_000, v: desde + pendientePorMin * i }));

describe("umbrales", () => {
  it("clasifica por exceso y por defecto", () => {
    expect(evaluarValor(0.3, ch4.umbrales)).toBe("ok");
    expect(evaluarValor(0.5, ch4.umbrales)).toBe("warn");
    expect(evaluarValor(1.2, ch4.umbrales)).toBe("crit");
    expect(evaluarValor(19.8, o2.umbrales)).toBe("warn");
    expect(evaluarValor(19.0, o2.umbrales)).toBe("crit");
    expect(evaluarValor(null, ch4.umbrales)).toBe("off");
  });

  it("exige límites ordenados de menor a mayor", () => {
    expect(umbralesValidos(o2.umbrales)).toBe(true);
    expect(umbralesValidos({ lowCrit: null, lowWarn: null, highWarn: 2, highCrit: 1 })).toBe(false);
  });
});

describe("tendencia", () => {
  it("estima los minutos hasta la alarma en una subida sostenida", () => {
    const t = analizarTendencia(serieLineal(0.6, 0.02, 10), ch4.umbrales);
    expect(t.direccion).toBe("up");
    expect(t.minutosHastaAlarma).toBe(10); // (1,0 - 0,8) / 0,02
  });

  it("no confunde ruido con tendencia", () => {
    const ruido = Array.from({ length: 12 }, (_, i) => ({ t: i * 60_000, v: 0.3 + (i % 2 ? 0.02 : -0.02) }));
    expect(analizarTendencia(ruido, ch4.umbrales).direccion).toBe("flat");
  });
});

describe("calidad del dato", () => {
  it("marca valores imposibles y convierte %LEL a % vol", () => {
    expect(clasificarCalidad({ valor: 150, variable: ch4, origen: "sensor_fijo", dispositivo: null, ahora: new Date() })).toBe("fuera_de_rango");
    expect(aUnidadCanonica("ch4", 20, "%LEL")).toBeCloseTo(1.0);
  });

  it("detecta un sensor congelado", () => {
    const recientes = Array(10).fill(0.42);
    expect(clasificarCalidad({ valor: 0.42, variable: ch4, origen: "sensor_fijo", dispositivo: null, ahora: new Date(), recientes })).toBe("congelada");
  });
});

describe("reglas de zona", () => {
  const base = { zona: frente, variables: [ch4, o2, ventilador, personas], series: {}, sinSenal: false, horizonteMin: 30 };

  it("genera alerta predictiva antes de llegar al límite", () => {
    const r = evaluarZona({ ...base, actuales: { ch4: 0.8, o2: 20.8 }, series: { ch4: serieLineal(0.6, 0.02, 10) } });
    expect(r.condiciones.map((c) => c.tipo)).toContain("Tendencia predictiva");
    expect(r.estadoZona).toBe("warn");
  });

  it("dispara alarma si el ventilador auxiliar se detiene con personal en el frente", () => {
    const r = evaluarZona({ ...base, actuales: { ch4: 0.1, o2: 20.8, ventilador: 0, personas: 5 } });
    const c = r.condiciones.find((x) => x.clave === "ventilacion:frente-2:ventilador");
    expect(c?.severidad).toBe("crit");
    expect(r.estadoZona).toBe("crit");
  });

  it("una zona sin señal nunca se muestra como normal", () => {
    const r = evaluarZona({ ...base, actuales: { ch4: 0.1, o2: 20.8 }, sinSenal: true });
    expect(r.estadoZona).toBe("off");
    expect(r.condiciones).toHaveLength(0);
  });
});
