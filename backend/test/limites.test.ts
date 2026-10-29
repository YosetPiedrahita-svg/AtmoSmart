import { describe, expect, it } from "vitest";
import { ServicioMonitoreo } from "../src/application/servicio-monitoreo";
import { AlertasEnMemoria, CatalogoEnMemoria, MedicionesEnMemoria } from "../src/adapters/out/memory/repositorios-memoria";
import { valorParaNivel } from "../src/domain/dato-de-prueba";
import { catalogoJson, variableDesdeFila } from "../src/config/catalogo-inicial";

const crear = () =>
  new ServicioMonitoreo(
    { catalogo: new CatalogoEnMemoria(), mediciones: new MedicionesEnMemoria(), alertas: new AlertasEnMemoria(), publicador: { publicar: () => {} }, reloj: { ahora: () => new Date() } },
    { sinSenalSegundos: 60, horizonteMin: 30, ventanaTendenciaMin: 10, histeresisSegundos: 20 },
  );

describe("datos de prueba", () => {
  const variables = catalogoJson.variables().map(variableDesdeFila);
  const v = (k: string) => variables.find((x) => x.clave === k)!;

  it("calcula valores que caen en el nivel pedido", () => {
    expect(valorParaNivel(v("ch4"), "warn")).toBeGreaterThanOrEqual(v("ch4").umbrales.highWarn!);
    expect(valorParaNivel(v("ch4"), "warn")).toBeLessThan(v("ch4").umbrales.highCrit!);
    expect(valorParaNivel(v("ch4"), "crit")).toBeGreaterThanOrEqual(v("ch4").umbrales.highCrit!);
    expect(valorParaNivel(v("o2"), "warn")).toBeLessThan(v("o2").umbrales.lowWarn!);
    expect(valorParaNivel(v("o2"), "crit")).toBeLessThan(v("o2").umbrales.lowCrit!);
    expect(valorParaNivel(v("o2"), "ok")).toBe(20.9);
  });

  it("genera precaución y alarma reales por el flujo normal de alertas", async () => {
    const s = crear();
    await s.iniciar();
    const w = await s.generarDatosPrueba({ zonaId: "frente-2", variable: "ch4", nivel: "warn" });
    expect(w.estadoVariable).toBe("warn");
    expect((await s.alertas()).find((a) => a.clave === "umbral:frente-2:ch4")?.severidad).toBe("warn");
    const c = await s.generarDatosPrueba({ zonaId: "frente-2", variable: "ch4", nivel: "crit" });
    expect(c.estadoVariable).toBe("crit");
    expect((await s.alertas()).find((a) => a.clave === "umbral:frente-2:ch4")?.severidad).toBe("crit");
  });

  it("una variable que no es gas también genera alerta (la zona no queda sin señal)", async () => {
    const s = crear();
    await s.iniciar();
    const r = await s.generarDatosPrueba({ zonaId: "galeria-2", variable: "air", nivel: "crit" });
    expect(r.estadoZona).toBe("crit");
  });

  it("rechaza zona, variable o nivel inválidos", async () => {
    const s = crear();
    await s.iniciar();
    await expect(s.generarDatosPrueba({ zonaId: "x", variable: "ch4", nivel: "warn" })).rejects.toThrow(/Zona desconocida/);
    await expect(s.generarDatosPrueba({ zonaId: "frente-2", variable: "ch4", nivel: "zzz" })).rejects.toThrow(/nivel/);
  });
});

describe("límites y configuración", () => {
  it("expone límites normativos, por zona y criterios internos", async () => {
    const s = crear();
    await s.iniciar();
    const c = await s.limitesConfiguracion();
    expect(c.normativos.length).toBeGreaterThan(10);
    expect(c.zonas).toHaveLength(8);
    expect(c.criterios.find((x) => x.clave === "jornadaHoras")?.valor).toBe(8);
  });

  it("guarda criterios válidos y rechaza los inválidos", async () => {
    const s = crear();
    await s.iniciar();
    await s.guardarCriterios({ jornadaHoras: 10, teRedondeo: "cercano" }, "Laura");
    const c = (await s.limitesConfiguracion()).criterios;
    expect(c.find((x) => x.clave === "jornadaHoras")?.valor).toBe(10);
    expect(c.find((x) => x.clave === "teRedondeo")?.valor).toBe("cercano");
    await expect(s.guardarCriterios({ jornadaHoras: 99 }, "L")).rejects.toThrow(/jornada/);
    await expect(s.guardarCriterios({ foo: 1 }, "L")).rejects.toThrow(/desconocido/);
    await expect(s.guardarCriterios({ teRedondeo: "x" }, "L")).rejects.toThrow(/redondeo/);
  });
});
