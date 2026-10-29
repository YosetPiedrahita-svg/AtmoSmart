/**
 * Punto de composición: el ÚNICO lugar que decide qué adaptadores se conectan
 * al núcleo. Para pasar de memoria a Supabase (o a otra base de datos) solo
 * cambia este archivo, no el dominio ni los casos de uso.
 */
import { ServicioMonitoreo } from "./application/servicio-monitoreo";
import type { AlertasRepositorio, CatalogoRepositorio, MedicionesRepositorio } from "./application/ports/salida";
import { AlertasEnMemoria, CatalogoEnMemoria, MedicionesEnMemoria } from "./adapters/out/memory/repositorios-memoria";
import { AlertasSupabase, CatalogoSupabase, MedicionesSupabase, crearClienteSupabase } from "./adapters/out/supabase/repositorios-supabase";
import { PublicadorSSE } from "./adapters/out/sse/publicador-sse";
import { crearServidor } from "./adapters/in/http/servidor";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const usarSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

let catalogo: CatalogoRepositorio;
let mediciones: MedicionesRepositorio;
let alertas: AlertasRepositorio;

if (usarSupabase) {
  const db = crearClienteSupabase(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  catalogo = new CatalogoSupabase(db);
  mediciones = new MedicionesSupabase(db);
  alertas = new AlertasSupabase(db);
} else {
  console.warn("⚠ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados: usando almacenamiento EN MEMORIA (los datos se pierden al reiniciar).");
  catalogo = new CatalogoEnMemoria();
  mediciones = new MedicionesEnMemoria();
  alertas = new AlertasEnMemoria();
}

const sse = new PublicadorSSE();
const servicio = new ServicioMonitoreo(
  { catalogo, mediciones, alertas, publicador: sse, reloj: { ahora: () => new Date() } },
  {
    sinSenalSegundos: Number(env.SIN_SENAL_SEGUNDOS ?? 60),
    horizonteMin: Number(env.HORIZONTE_PREDICTIVO_MIN ?? 30),
    ventanaTendenciaMin: 10,
    histeresisSegundos: 20,
  },
);

await servicio.iniciar();

// Vigilancia periódica: equipos sin señal, calibraciones y re-evaluación.
setInterval(() => servicio.vigilar().catch((e) => console.error("vigilar:", e)), 10_000);

const puerto = Number(env.PORT ?? 3000);
crearServidor({ servicio, sse, tokenIngesta: env.INGESTA_TOKEN || undefined, almacenamiento: usarSupabase ? "supabase" : "memoria" }).listen(puerto, () => {
  console.log(`AtmoSmart backend en http://localhost:${puerto}  (almacenamiento: ${usarSupabase ? "Supabase" : "memoria"})`);
  console.log(`  Frontend:  http://localhost:${puerto}/`);
  console.log(`  API:       http://localhost:${puerto}/api/salud`);
});

/**
 * Simulador de sensores integrado (opcional). Con SIMULADOR=1 el servidor lanza el simulador del
 * repositorio, que envía lecturas a este mismo backend por POST /api/ingesta, igual que lo haría un
 * gateway real. Sirve para tener datos siempre en vivo sin dejar un computador encendido.
 *   SIMULADOR=1                  activa la simulación (rota los escenarios solos)
 *   SIMULADOR_MINUTOS=3          minutos por escenario (por defecto 3)
 *   SIMULADOR_HISTORICO=1        carga 6 h de historia al arrancar (hágalo UNA vez: repetirlo duplica el historial)
 */
if (env.SIMULADOR === "1") {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const direccion = `http://localhost:${puerto}`;
  const ejecutar = (guion: string, args: string[]) =>
    spawn(process.execPath, ["--import", "tsx", join(raiz, "simulador/src", guion), "--url", direccion, ...args], { cwd: raiz, stdio: "inherit", env });

  const lanzarSimulacion = () => {
    const hijo = ejecutar("simular.ts", ["--rotar", String(env.SIMULADOR_MINUTOS ?? 3), "--velocidad", String(env.SIMULADOR_VELOCIDAD ?? 3)]);
    hijo.on("exit", (codigo) => {
      console.warn(`Simulador detenido (código ${codigo}); se reinicia en 10 s`);
      setTimeout(lanzarSimulacion, 10_000);
    });
  };

  // Espera a que el servidor esté escuchando antes de enviar lecturas.
  setTimeout(() => {
    if (env.SIMULADOR_HISTORICO === "1") ejecutar("historico.ts", []).on("exit", lanzarSimulacion);
    else lanzarSimulacion();
  }, 3000);
}
