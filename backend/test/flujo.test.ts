import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { ServicioMonitoreo } from "../src/application/servicio-monitoreo";
import type { EventoDominio } from "../src/application/ports/salida";
import { AlertasEnMemoria, CatalogoEnMemoria, MedicionesEnMemoria } from "../src/adapters/out/memory/repositorios-memoria";
import { PublicadorSSE } from "../src/adapters/out/sse/publicador-sse";
import { crearServidor } from "../src/adapters/in/http/servidor";

/**
 * Prueba de punta a punta con adaptadores en memoria y un reloj controlado:
 * lecturas del frente → alertas → sensor sin señal → API HTTP.
 */
let ahora = new Date("2026-10-29T13:00:00Z");
const eventos: EventoDominio[] = [];
const sse = new PublicadorSSE();
const publicador = { publicar: (e: EventoDominio) => { eventos.push(e); sse.publicar(e); } };
const servicio = new ServicioMonitoreo(
  { catalogo: new CatalogoEnMemoria(), mediciones: new MedicionesEnMemoria(), alertas: new AlertasEnMemoria(), publicador, reloj: { ahora: () => ahora } },
  { sinSenalSegundos: 60, horizonteMin: 30, ventanaTendenciaMin: 10, histeresisSegundos: 20 },
);

const avanzar = (seg: number) => (ahora = new Date(ahora.getTime() + seg * 1000));
const lectura = (dispositivoId: string, lecturas: Record<string, number>) => ({
  dispositivoId,
  instante: ahora.toISOString(),
  lecturas: Object.entries(lecturas).map(([variable, valor]) => ({ variable, valor })),
});

let servidor: Server;
let base = "";

beforeAll(async () => {
  await servicio.iniciar();
  servidor = crearServidor({ servicio, sse, almacenamiento: "memoria", carpetaFrontend: null }).listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;
});
afterAll(() => servidor?.close());

describe("flujo del frente de explotación", () => {
  it("rechaza dispositivos no registrados", async () => {
    const r = await servicio.ingerir([lectura("SENSOR-FANTASMA", { ch4: 0.1 })]);
    expect(r.aceptadas).toBe(0);
    expect(r.rechazadas[0].motivo).toMatch(/no registrado/);
  });

  it("metano en ascenso genera alerta predictiva y luego de umbral", async () => {
    for (let i = 0; i <= 10; i++) {
      await servicio.ingerir([
        lectura("MG-F2-01", { o2: 20.8, ch4: 0.3 + 0.05 * i, co: 5 + (i % 2), co2: 0.2, h2s: 0.1, no2: 0.05 }),
        lectura("VA-F2-01", { ventilador: 1 }),
        lectura("LAM-F2", { personas: 7 }),
      ]);
      avanzar(60);
    }
    const tipos = (await servicio.alertas()).filter((a) => a.zonaId === "frente-2" && a.activa).map((a) => a.clave);
    expect(tipos).toContain("tendencia:frente-2:ch4");
    expect(tipos).toContain("umbral:frente-2:ch4");
    expect(servicio.estadoZona("frente-2")!.resultado!.estadoZona).toBe("warn");
  });

  it("ventilador auxiliar detenido con personal → alarma", async () => {
    await servicio.ingerir([lectura("VA-F2-01", { ventilador: 0 }), lectura("MG-F2-01", { o2: 20.8, ch4: 0.8, co: 5 })]);
    const alerta = (await servicio.alertas()).find((a) => a.clave === "ventilacion:frente-2:ventilador");
    expect(alerta?.severidad).toBe("crit");
    expect(alerta?.titulo).toMatch(/7 persona/);
    expect(eventos.some((e) => e.tipo === "alerta" && e.accion === "creada")).toBe(true);
  });

  it("si el detector deja de reportar, la zona queda sin señal y se alerta", async () => {
    avanzar(90);
    await servicio.vigilar();
    expect(servicio.estadoZona("frente-2")!.resultado!.estadoZona).toBe("off");
    const sinSenal = (await servicio.alertas()).find((a) => a.clave === "sensor:MG-F2-01");
    expect(sinSenal?.activa).toBe(true);
  });

  it("la API HTTP expone estado, alertas y permite reconocer", async () => {
    const zonas = await (await fetch(`${base}/zonas/estado`)).json();
    const f2 = zonas.find((z: { id: string }) => z.id === "frente-2");
    expect(f2.reading.zoneStatus).toBe("off");
    expect(f2.reading.workers).toBe(7);

    const alertas = await (await fetch(`${base}/alertas`)).json();
    const vent = alertas.find((a: { title: string }) => /Ventilador auxiliar/.test(a.title));
    const r = await fetch(`${base}/alertas/${vent.id}/reconocer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "Laura Méndez", note: "Se reinició el ventilador" }) });
    expect(r.status).toBe(200);
    const tras = await (await fetch(`${base}/alertas`)).json();
    expect(tras.find((a: { id: string }) => a.id === vent.id).ack.user).toBe("Laura Méndez");
  });

  it("acepta ingesta por HTTP y valida errores", async () => {
    const ok = await fetch(`${base}/ingesta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lectura("MG-F1-01", { ch4: 0.2, o2: 20.9, co: 4 })) });
    expect((await ok.json()).aceptadas).toBe(3);
    const mal = await fetch(`${base}/limites/ch4`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds: { highWarn: 2, highCrit: 1 } }) });
    expect(mal.status).toBe(400);
  });

  it("registro manual fuera de límite genera alerta aunque la zona esté sin señal", async () => {
    await servicio.registrarManual({ zonaId: "frente-2", valores: { ch4: 1.3 }, detector: "P-022", motivo: "Sensor fijo sin señal", usuario: "Laura" });
    const a = (await servicio.alertas()).find((x) => x.clave === "manual:frente-2:ch4");
    expect(a?.severidad).toBe("crit");
  });
});
