/**
 * Carga el catálogo (zonas, variables, plano y dispositivos) en Supabase.
 * Uso: npm run db:seed   (requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env)
 *
 * Es idempotente: se puede ejecutar varias veces (hace upsert).
 * OJO: sobrescribe los límites de las variables con los de config/variables.json.
 */
import { crearClienteSupabase } from "../src/adapters/out/supabase/repositorios-supabase";
import { catalogoJson, limitesJson } from "../src/config/catalogo-inicial";

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
// Límites y configuración (requiere haber ejecutado supabase/migrations/003_limites_configuracion.sql).
await upsert("limites_normativos", limitesJson.normativos(), "id");
await upsert("limites_zona", limitesJson.zonas(), "zona_id");
{
  // Los criterios internos los edita el equipo: solo se crean los que faltan, no se pisan los valores guardados.
  const { data, error } = await db.from("criterios_internos").select("clave");
  if (error) throw new Error(`criterios_internos: ${error.message}`);
  const existentes = new Set((data ?? []).map((r: { clave: string }) => r.clave));
  const nuevos = limitesJson.criterios().filter((c) => !existentes.has(c.clave));
  if (nuevos.length) await upsert("criterios_internos", nuevos, "clave");
  else console.log("✔ criterios_internos: ya existen (no se modifican)");
}
// Retira los equipos que ya no están en el catálogo (p. ej. el antiguo detector multigas, ahora un sensor por gas).
{
  const vigentes = new Set(catalogoJson.dispositivos().map((d) => d.id));
  const { data, error } = await db.from("dispositivos").select("id");
  if (error) throw new Error(`dispositivos: ${error.message}`);
  const sobrantes = (data ?? []).map((r: { id: string }) => r.id).filter((id: string) => !vigentes.has(id));
  if (sobrantes.length) {
    const { error: e2 } = await db.from("dispositivos").delete().in("id", sobrantes);
    if (e2) throw new Error(`dispositivos: ${e2.message}`);
    console.log(`✔ dispositivos retirados (ya no están en el catálogo): ${sobrantes.join(", ")}`);
  }
}
// Un solo plano vigente: se desmarcan los anteriores antes de publicar este.
{
  const { error } = await db.from("planos").update({ vigente: false }).neq("version", plano.version);
  if (error) throw new Error(`planos: ${error.message}`);
}
await upsert("planos", [{ version: plano.version, actualizado: plano.actualizado, fuente: plano.fuente, contenido: plano.contenido, vigente: true }], "version");
console.log("Catálogo cargado en Supabase.");
