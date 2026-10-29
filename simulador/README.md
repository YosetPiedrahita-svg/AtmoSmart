# AtmoSmart — Simulador de sensores

Hace el papel de los **sensores del frente y del gateway de superficie**. Genera lecturas
aleatorias realistas y las envía al backend por `POST /api/ingesta`, en el mismo formato que
enviaría un equipo real. **No escribe en la base de datos.** Por eso, cuando lleguen sensores
reales, basta con reemplazar este módulo por su adaptador.

```
simulador ──POST /api/ingesta──► backend ──► Supabase
```

## Uso

Primero inicie el backend con `npm run backend`. Luego, desde la raíz del repositorio:

Cargar 6 horas de historia, para que los gráficos tengan datos (incluye una voladura hace unas 4,5 h):

```bash
npm run historico
```

Lecturas en vivo, en operación normal:

```bash
npm run simular
```

Demo del frente: metano en ascenso, cinco veces más rápido:

```bash
npm run simular -- --escenario metano --velocidad 5
```

Mientras corre, presione **1–6** para cambiar de escenario y **q** para salir.

| Tecla | Escenario | Qué debe mostrar AtmoSmart |
| --- | --- | --- |
| 1 | `normal` | Todo en verde |
| 2 | `metano` | Alerta **predictiva** ("alcanzaría la alarma en ~N min") antes del límite |
| 3 | `ventilador` | **Alarma** por ventilador auxiliar detenido con personal en el frente |
| 4 | `sin-senal` | La zona pasa a "sin señal" (nunca a "normal") y se alerta el equipo |
| 5 | `voladura` | Pico de CO, NO₂ y polvo que decae con la ventilación |
| 6 | `polvo` | Polvo de carbón respirable en aumento |

### Siempre en vivo (sin dejar un computador encendido)

`npm run simular -- --rotar 3` recorre solo los escenarios (3 min cada uno, con operación normal entre ellos).
En Render, el propio backend lanza el simulador si se define `SIMULADOR=1` (ya está en `render.yaml`);
`SIMULADOR_MINUTOS` fija los minutos por escenario y `SIMULADOR_HISTORICO=1` carga 6 h de historia
**una sola vez** (repetirlo duplica el historial). Es un reemplazo temporal de los sensores reales:
para producción se quita `SIMULADOR`.

### Opciones

| Opción | Por defecto | Descripción |
| --- | --- | --- |
| `--url` | `http://localhost:3000` | Dirección del backend |
| `--escenario` | `normal` | Escenario inicial |
| `--zona` | `frente-2` | Zona afectada por el escenario |
| `--intervalo` | `5` | Segundos entre envíos |
| `--velocidad` | `1` | Acelera el escenario (`5` = 5 veces más rápido; útil en el pitch) |
| `--token` | — | Valor de `x-api-key` si el backend define `INGESTA_TOKEN` |
| `--horas` / `--paso` | `6` / `1` | Solo para `historico`: horas hacia atrás y minutos entre lecturas |

> El backend necesita **al menos 3 minutos de datos** para afirmar que una variable sube o baja.
> Así evita confundir el ruido con una tendencia. Ejecute `npm run historico` antes de la demo.

## Cómo genera los valores

`valor = base de la zona + onda lenta + ruido aleatorio + efecto del escenario`

- `src/perfiles.ts`: valores normales y ruido por zona y variable.
- `src/escenarios.ts`: cómo cada escenario altera las variables con el paso del tiempo.
- `src/generador.ts`: combina lo anterior.
- `src/cliente.ts`: consulta los equipos registrados (`GET /api/dispositivos`) y envía las lecturas.

Los perfiles y escenarios son **ilustrativos**. Sus magnitudes deben revisarse con Ingeniería de Minas.
