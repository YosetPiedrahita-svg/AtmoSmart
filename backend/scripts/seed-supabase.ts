/**
 * Carga el catálogo (zonas, variables, plano y dispositivos) en Supabase.
 * Uso: npm run db:seed   (requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env)
 *
 * Es idempotente: se puede ejecutar varias veces (hace upsert).
 * OJO: sobrescribe los límites de las variables con los de config/variables.json.
 */
import { crearClienteSupabase } from "../src/adapters/out/supabase/repositorios-supabase";
import { catalogoJson } from "../src/config/catalogo-inicial";

const url = process.env.SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en backend/.env");
  process.exit(1);
}

const db = crearClienteSupabase(url, clave);

async function upsert(tabla: string, filas: unknown[], conflicto: string) {
  const { error } = await db.from(tabla).upsert(filas as never[], { onConflict: conflicto });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  console.log(`✔ ${tabla}: ${filas.length} fila(s)`);
}

const plano = catalogoJson.plano();
await upsert("zonas", catalogoJson.zonas(), "id");
await upsert("variables", catalogoJson.variables(), "clave");
await upsert("dispositivos", catalogoJson.dispositivos().map((d) => ({ ...d, portador: d.portador ?? null })), "id");
// Un solo plano vigente: se desmarcan los anteriores antes de publicar este.
{
  const { error } = await db.from("planos").update({ vigente: false }).neq("version", plano.version);
  if (error) throw new Error(`planos: ${error.message}`);
}
await upsert("planos", [{ version: plano.version, actualizado: plano.actualizado, fuente: plano.fuente, contenido: plano.contenido, vigente: true }], "version");
console.log("Catálogo cargado en Supabase.");
