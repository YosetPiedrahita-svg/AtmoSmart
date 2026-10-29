# AtmoSmart

Sistema inteligente de monitoreo de atmósferas en minas subterráneas: registra niveles
de oxígeno, gases peligrosos, polvo de carbón, temperatura y ventilación por zona, evalúa
los valores frente a los límites establecidos y genera alertas preventivas (por umbral, por
tendencia y por reglas de ventilación).

```
simulador/ (sensores) ──► backend/ (reglas, hexagonal) ──► Supabase (almacenamiento)
                                   │
                                   └──► frontend/ (API REST + eventos en vivo)
```

## Inicio rápido

Requiere Node.js 20 o superior. Ejecute estos comandos desde la raíz del repositorio.

Instale las dependencias del backend y del simulador:

```bash
npm install
```

Inicie el backend y el frontend en http://localhost:3000:

```bash
npm run backend
```

En otra terminal, cargue 6 horas de datos para los gráficos:

```bash
npm run historico
```

Luego, en la misma terminal, inicie los sensores simulados (teclas 1–6 cambian el escenario):

```bash
npm run simular -- --escenario metano --velocidad 5
```

Sin Supabase configurado, el backend usa memoria. Para conectar Supabase, siga
[`backend/README.md`](backend/README.md#conectar-supabase).

## Contenido

- [`frontend/`](frontend/README.md): interfaz web en HTML, CSS y JS. Usa el backend si está disponible y,
  si no, datos simulados locales.
- [`backend/`](backend/README.md): API y reglas de seguridad con arquitectura hexagonal (TypeScript).
- [`simulador/`](simulador/README.md): simulador de sensores con los escenarios del demo del frente.
- [`supabase/`](supabase/migrations): esquema de base de datos (migraciones SQL).
- [`docs/arquitectura.md`](docs/arquitectura.md): arquitectura hexagonal (puertos y adaptadores),
  independiente de la marca del sensor, con el demo inicial centrado en el frente de explotación.
- [`docs/requerimientos-de-datos.md`](docs/requerimientos-de-datos.md): información que se necesita
  de la mina, la normativa, los sensores y la operación para usar el sistema en la vida real.
- [`docs/entregables/`](docs/entregables): entregables del reto (canvas F1).
