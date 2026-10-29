/**
 * Simulador de sensores en vivo.
 *
 *   npm run simular                                   → operación normal
 *   npm run simular -- --escenario metano --velocidad 5
 *   npm run simular -- --escenario ventilador --zona frente-1
 *
 * Opciones:
 *   --url        dirección del backend          (por defecto http://localhost:3000)
 *   --escenario  normal | metano | ventilador | sin-senal | voladura | polvo
 *   --zona       zona afectada por el escenario (por defecto frente-2)
 *   --intervalo  segundos entre envíos           (por defecto 5)
 *   --velocidad  acelera el escenario (5 = cinco veces más rápido; útil para el pitch)
 *   --token      valor de x-api-key si el backend define INGESTA_TOKEN
 *
 * Durante la ejecución, presione 1-6 para cambiar de escenario y q para salir.
 */
import readline from "node:readline";
import { ClienteBackend, argumentos, simulables, type MensajeCanonico } from "./cliente";
import { ESCENARIOS, escenarioPorId, escenarioPorTecla } from "./escenarios";
import { generarValor, type EscenarioActivo } from "./generador";

const args = argumentos();
const url = (args.url ?? process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const intervalo = Math.max(1, Number(args.intervalo ?? 5));
const velocidad = Math.max(0.1, Number(args.velocidad ?? 1));
const zona = args.zona ?? "frente-2";
const cliente = new ClienteBackend(url, args.token ?? process.env.INGESTA_TOKEN);

let activo: EscenarioActivo = {
  escenario: escenarioPorId(args.escenario ?? "normal") ?? ESCENARIOS[0],
  zonaId: zona,
  inicio: Date.now(),
  velocidad,
};

const baterias = new Map<string, number>();
const bateria = (id: string) => {
  const b = Math.max(5, (baterias.get(id) ?? 60 + Math.random() * 40) - 0.01);
  baterias.set(id, b);
  return Math.round(b);
};

function cambiar(id: string) {
  const e = escenarioPorId(id) ?? escenarioPorTecla(id);
  if (!e) return;
  activo = { ...activo, escenario: e, inicio: Date.now() };
  console.log(`\n▶ Escenario: ${e.nombre} en ${activo.zonaId} — ${e.descripcion}\n`);
}

async function main() {
  const dispositivos = simulables(await cliente.dispositivos());
  console.log(`Simulando ${dispositivos.length} equipos → ${url}/api/ingesta cada ${intervalo}s (velocidad ×${velocidad})`);
  console.log("Teclas: " + ESCENARIOS.map((e) => `${e.tecla}=${e.id}`).join("  ") + "  q=salir");
  cambiar(activo.escenario.id);

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (_s, key) => {
      if (key?.name === "q" || (key?.ctrl && key?.name === "c")) process.exit(0);
      if (key?.sequence) cambiar(key.sequence);
    });
  }

  const tick = async () => {
    const ahora = Date.now();
    const mensajes: MensajeCanonico[] = dispositivos
      .filter((d) => !(d.zoneId === activo.zonaId && activo.escenario.silenciar?.(d.type)))
      .map((d) => ({
        dispositivoId: d.id,
        zonaId: d.zoneId,
        instante: new Date(ahora).toISOString(),
        origen: "simulado",
        bateria: d.type.includes("Contacto") || d.type.includes("lámparas") ? undefined : bateria(d.id),
        lecturas: d.vars.map((variable) => ({ variable, valor: generarValor(d.zoneId, variable, ahora, activo) })),
      }));
    try {
      const r = await cliente.enviar(mensajes);
      const z = mensajes.filter((m) => m.zonaId === activo.zonaId).flatMap((m) => m.lecturas);
      const val = (k: string) => z.find((l) => l.variable === k)?.valor ?? "—";
      const hora = new Date(ahora).toLocaleTimeString("es-CO", { hour12: false });
      console.log(`${hora}  ${activo.escenario.id.padEnd(10)} ${activo.zonaId}: CH₄ ${val("ch4")}%  O₂ ${val("o2")}%  CO ${val("co")}ppm  aire ${val("air")}m/s  polvo ${val("pm")}  VA ${val("ventilador")}  → ${r.aceptadas} lecturas aceptadas${r.rechazadas.length ? `, ${r.rechazadas.length} rechazadas` : ""}`);
    } catch (e) {
      console.error(`✖ No se pudo enviar al backend (${(e as Error).message}). ¿Está corriendo en ${url}?`);
    }
  };

  await tick();
  setInterval(tick, intervalo * 1000);
}

main().catch((e) => {
  console.error(`✖ ${e.message}\n  Inicie primero el backend: npm run backend`);
  process.exit(1);
});
