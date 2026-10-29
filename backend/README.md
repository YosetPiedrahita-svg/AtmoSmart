# AtmoSmart — Backend

Backend en **TypeScript / Node.js** con **arquitectura hexagonal** (puertos y adaptadores).
Recibe las lecturas de los sensores (o del simulador), aplica las reglas de seguridad,
guarda todo en **Supabase** y avisa en vivo al frontend.

```
Simulador / sensores ──POST /api/ingesta──► Backend ──► Supabase (almacenamiento)
                                              │
                                              └──► Frontend (API REST + eventos en vivo SSE)
```

El frontend **nunca** habla con Supabase: solo el backend tiene la clave.

## Cómo ejecutarlo

Desde la **raíz del repositorio**:

```bash
npm install
```

```bash
npm run backend
```

Abra <http://localhost:3000>: el backend también sirve el frontend.

Sin Supabase configurado, el backend arranca con **almacenamiento en memoria**. Todo funciona igual,
pero los datos se pierden al reiniciar.

En otra terminal, inicie el simulador de sensores (ver [`simulador/README.md`](../simulador/README.md)):

```bash
npm run historico
```

```bash
npm run simular -- --escenario metano --velocidad 5
```

## Conectar Supabase

1. Cree un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecute en orden los archivos de [`supabase/migrations/`](../supabase/migrations):
   `001_esquema.sql`, `002_funciones_agregadas.sql` y `003_limites_configuracion.sql` (tablas de la pantalla
   "Límites y configuración": `limites_normativos`, `limites_zona` y `criterios_internos`).
3. Copie `backend/.env.example` como `backend/.env` y complete `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` (en **Project Settings → API**).
   ⚠️ La clave de servicio da acceso total: **nunca** la suba al repositorio ni la ponga en el frontend.
4. Cargue el catálogo (zonas, variables y límites, plano, dispositivos):

   ```bash
   npm run db:seed
   ```

5. Reinicie el backend. Debe mostrar `almacenamiento: Supabase`.

**Seguridad:** todas las tablas tienen RLS activo y **ninguna política**. La clave pública
(`anon`) no puede leer ni escribir nada; solo el backend accede con la clave de servicio.

## Estructura

```
backend/
├── config/                      catálogo inicial (zonas, variables/límites, plano, dispositivos, turno)
├── scripts/seed-supabase.ts     carga el catálogo en Supabase
├── src/
│   ├── domain/                  REGLAS — sin dependencias externas
│   │   ├── modelo.ts            tipos: Zona, Variable, Medicion, Alerta...
│   │   ├── umbrales.ts          normal / precaución / alarma
│   │   ├── tendencia.ts         regresión lineal → minutos hasta la alarma
│   │   ├── calidad.ts           fuera de rango, sensor congelado, calibración, unidades
│   │   └── reglas.ts            evaluación de zona + reglas compuestas de ventilación
│   ├── application/
│   │   ├── ports/entrada.ts     lo que el mundo puede pedirle al núcleo
│   │   ├── ports/salida.ts      lo que el núcleo necesita (repositorios, publicador, reloj)
│   │   ├── ventana-reciente.ts  últimos 30 min en memoria para calcular tendencias
│   │   └── servicio-monitoreo.ts casos de uso: ingerir, evaluar, alertas, vigilancia, manual
│   ├── adapters/
│   │   ├── in/http/             Express: API REST, SSE y presentadores (formato del frontend)
│   │   └── out/
│   │       ├── supabase/        repositorios sobre Supabase
│   │       ├── memory/          repositorios en memoria (pruebas / sin red)
│   │       └── sse/             eventos en vivo al navegador
│   └── main.ts                  elige qué adaptadores se conectan
└── test/                        pruebas del dominio y del flujo completo
```

**Regla de dependencias:** `adapters → application → domain`. El dominio no importa nada de
Express ni de Supabase. Por eso se prueba sin red ni hardware, y cambiar de base de datos
solo exige escribir otro adaptador.

## Qué hace con cada lectura

1. **Valida:** el dispositivo debe estar registrado, la variable debe existir y el instante debe ser válido.
2. **Normaliza unidades:** por ejemplo, metano en %LEL → % vol.
3. **Clasifica la calidad:** válida, fuera de rango, sensor congelado o calibración vencida.
4. **Guarda en Supabase** y actualiza la ventana reciente.
5. **Evalúa la zona** (dominio):
   - **Umbral:** cada variable contra su límite.
   - **Tendencia:** si una variable avanza hacia la alarma y la alcanzaría en ≤ 30 min, genera una **alerta predictiva**.
   - **Ventilador auxiliar detenido en un frente:** alarma si hay personas.
   - **Metano en ascenso con velocidad del aire en descenso:** posible falla de ventilación.
6. **Sincroniza alertas:** crea las nuevas, actualiza las existentes y cierra las que desaparecen (con
   histéresis de 20 s para evitar parpadeo). Si una alerta empeora a alarma, exige un nuevo reconocimiento.
7. **Publica** un evento SSE: el frontend se refresca al instante.

Cada 10 s, una **vigilancia** revisa los equipos sin comunicación (más de 60 s) y las calibraciones
vencidas. **Una zona sin datos se muestra "sin señal", nunca "normal".**

## API

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/salud` | Estado del servicio y del almacenamiento |
| GET | `/api/config` | Variables con límites vigentes y zonas |
| GET | `/api/mina/plano` | Plano vigente (mapa) |
| GET | `/api/turno` | Turno y personal en interior |
| GET | `/api/zonas/estado` · `/api/zonas/:id/estado` | Estado actual, tendencias, personal y ventilador |
| GET | `/api/mediciones/serie?zona&variable&minutos&paso` | Serie para gráficos |
| GET | `/api/mediciones/pronostico?zona&variable&minutos` | Proyección según la tendencia |
| GET | `/api/mediciones/historial?zona&horas&paso` | Historial agregado + registros manuales |
| POST | `/api/mediciones/manual` | Registro de contingencia |
| POST | `/api/ingesta` | **Lecturas de sensores** (formato canónico, abajo) |
| POST | `/api/ingesta/historico` | Carga de datos pasados (sin alertas) |
| GET | `/api/alertas` · POST `/api/alertas/:id/reconocer` | Alertas y reconocimiento |
| GET | `/api/dispositivos` | Equipos, batería, calibración, última comunicación |
| PUT | `/api/limites/:variable` | Cambiar límites (queda en `limites_cambios`) |
| GET | `/api/stream` | Eventos en vivo (SSE) |

### Formato canónico de ingesta

Es el mismo para el simulador y para cualquier sensor real (un adaptador Modbus, MQTT o CSV debe producir esto):

```json
[
  {
    "dispositivoId": "MG-F2-01",
    "instante": "2026-10-29T13:45:05-05:00",
    "bateria": 87,
    "lecturas": [
      { "variable": "ch4", "valor": 0.83, "unidad": "%" },
      { "variable": "co", "valor": 7, "unidad": "ppm" },
      { "variable": "o2", "valor": 20.2, "unidad": "%" }
    ]
  }
]
```

Si se define `INGESTA_TOKEN` en `.env`, los sensores deben enviar la cabecera `x-api-key`.

## Pruebas

```bash
npm test
```

Cubren las reglas del dominio y un flujo completo con reloj simulado: metano en ascenso → alerta
predictiva → ventilador detenido → sensor sin señal → reconocimiento por la API → registro manual.

> ⚠️ Los límites de `config/variables.json` son **valores de referencia**. Ingeniería de Minas debe
> validarlos contra el **Decreto 1886 de 2015** antes de cualquier uso real.

## Límites y configuración, alertas y datos de prueba

| Método y ruta | Qué hace |
| --- | --- |
| `GET /api/limites/configuracion` | Límites normativos (variable, límite, cómo se evalúa, referencia), límites por zona y criterios internos, leídos de Supabase |
| `PUT /api/limites/criterios` | Guarda los criterios internos que cambió el equipo (`{ criterios: { jornadaHoras: 10 }, user }`) |
| `POST /api/alertas/evaluar` | Reevalúa todas las zonas con los límites vigentes y genera / actualiza las alertas |
| `POST /api/simulacion/generar` | Genera lecturas que provocan `ok`, `warn` o `crit` (`{ zoneId, variable, level }`); la alerta se crea por el flujo normal |

`npm run db:seed` carga estas tablas desde `backend/config/limites-*.json` y `criterios-internos.json`
(los criterios ya guardados no se pisan). `PERMITIR_SIMULACION=0` desactiva `/api/simulacion/generar`.
