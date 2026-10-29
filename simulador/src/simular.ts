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
 *   --apagar     sensores que no transmiten, separados por coma (p. ej. --apagar CH4-F2-01,CO-F2-01):
 *                sirve para mostrar la falla de UN solo sensor de gas
 *   --rotar      minutos por escenario: recorre solos normal → metano → voladura → ventilador →
 *                sin-señal → polvo, con operación normal entre cada uno (modo "siempre en vivo")
 *
 * Durante la ejecución, presione 1-6 para cambiar de escenario y q para salir.
 */
import readline from "node:readline";
import { ClienteBackend, argumentos, simulables, type MensajeCanonico } from "./cliente";
import { ESCENARIOS, escenarioPorId, escenarioPorTecla, esSensorDeGas } from "./escenarios";
import { generarValor, type EscenarioActivo } from "./generador";
import { RUIDO, DECIMALES } from "./perfiles";

const args = argumentos();
const url = (args.url ?? process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const intervalo = Math.max(1, Number(args.intervalo ?? 5));
const velocidad = Math.max(0.1, Number(args.velocidad ?? 1));
const zona = args.zona ?? "frente-2";
const rotarMin = Number(args.rotar ?? 0);
const SECUENCIA = ["normal", "metano", "normal", "voladura", "normal", "ventilador", "normal", "sin-senal", "normal", "polvo"];
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

const GASES: Record<string, string> = { o2: "O₂", ch4: "CH₄", co: "CO", co2: "CO₂", h2s: "H₂S", no2: "NO₂" };
const apagados = new Set((args.apagar ?? "").split(",").map((x) => x.trim()).filter(Boolean));

/** Pequeño error propio de cada sensor (calibración distinta): dos sensores del mismo gas no leen idéntico. */
const sesgo = (id: string, variable: string) => {
  const h = [...id + variable].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2003, 7);
  return ((h / 1001) - 1) * 0.6 * (RUIDO[variable] ?? 0);
};

async function main() {
  const todos = simulables(await cliente.dispositivos());
  const dispositivos = todos.filter((d) => !apagados.has(d.id));
  const sensoresGas = todos.filter((d) => esSensorDeGas(d.type));
  console.log("Sensores de gas (uno por cada gas):");
  for (const [clave, simbolo] of Object.entries(GASES)) {
    const ids = sensoresGas.filter((d) => d.vars.length === 1 && d.vars[0] === clave).map((d) => d.id);
    console.log(`  ${simbolo.padEnd(4)} ${String(ids.length).padStart(2)} sensores  ${ids.join(", ")}`);
  }
  if (apagados.size) console.log(`  Sin transmitir (--apagar): ${[...apagados].join(", ")}`);
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
        lecturas: d.vars.map((variable) => {
          const bruto = generarValor(d.zoneId, variable, ahora, activo);
          if (variable === "ventilador" || variable === "personas") return { variable, valor: bruto };
          const dec = DECIMALES[variable] ?? 2;
          return { variable, valor: Math.round(Math.max(0, bruto + sesgo(d.id, variable)) * 10 ** dec) / 10 ** dec };
        }),
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

  if (rotarMin > 0) {
    let paso = SECUENCIA.indexOf(activo.escenario.id);
    console.log(`Rotación automática de escenarios cada ${rotarMin} min: ${SECUENCIA.join(" → ")}`);
    setInterval(() => {
      paso = (paso + 1) % SECUENCIA.length;
      cambiar(SECUENCIA[paso]);
    }, rotarMin * 60_000);
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}\n  Inicie primero el backend: npm run backend`);
  process.exit(1);
});
