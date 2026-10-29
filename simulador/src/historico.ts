/**
 * Genera datos históricos para que los gráficos y el historial tengan
 * información desde el primer momento.
 *
 *   npm run historico                          → últimas 6 h, una lectura por minuto
 *   npm run historico -- --horas 24 --paso 2
 *
 * Incluye una voladura en la Galería principal N1 hace ~4,5 h para que se
 * vea un pico de CO/NO₂ en el historial. Usa POST /api/ingesta/historico,
 * que guarda las lecturas SIN generar alertas (son del pasado).
 */
import { ClienteBackend, argumentos, simulables, type MensajeCanonico } from "./cliente";
import { escenarioPorId } from "./escenarios";
import { generarValor, type EscenarioActivo } from "./generador";

const args = argumentos();
const url = (args.url ?? process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const horas = Math.min(72, Math.max(1, Number(args.horas ?? 6)));
const pasoMin = Math.max(1, Number(args.paso ?? 1));
const cliente = new ClienteBackend(url, args.token ?? process.env.INGESTA_TOKEN);

const LOTE = 400;

async function main() {
  const dispositivos = simulables(await cliente.dispositivos());
  const fin = Date.now() - 60_000;
  const inicio = fin - horas * 3_600_000;
  const voladura: EscenarioActivo = { escenario: escenarioPorId("voladura")!, zonaId: "galeria-1", inicio: Date.now() - 270 * 60_000, velocidad: 1 };

  let lote: MensajeCanonico[] = [];
  let total = 0;
  const pasos = Math.floor((fin - inicio) / (pasoMin * 60_000));
  console.log(`Generando ${horas} h de historia (cada ${pasoMin} min) para ${dispositivos.length} equipos → ${url}`);

  for (let i = 0; i <= pasos; i++) {
    const t = inicio + i * pasoMin * 60_000;
    for (const d of dispositivos) {
      lote.push({
        dispositivoId: d.id,
        zonaId: d.zoneId,
        instante: new Date(t).toISOString(),
        origen: "simulado",
        lecturas: d.vars.map((variable) => ({ variable, valor: generarValor(d.zoneId, variable, t, t >= voladura.inicio ? voladura : null) })),
      });
      if (lote.length >= LOTE) {
        total += (await cliente.enviar(lote, true)).aceptadas;
        lote = [];
        process.stdout.write(`\r  ${Math.round((i / pasos) * 100)} %  (${total} lecturas)`);
      }
    }
  }
  if (lote.length) total += (await cliente.enviar(lote, true)).aceptadas;
  console.log(`\r✔ ${total} lecturas históricas cargadas.          `);
}

main().catch((e) => {
  console.error(`✖ ${e.message}\n  Inicie primero el backend: npm run backend`);
  process.exit(1);
});
