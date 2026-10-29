-- ============================================================================
-- AtmoSmart — Esquema de base de datos (Supabase / PostgreSQL)
--
-- Cómo aplicarlo: en el panel de Supabase → SQL Editor → pegar y ejecutar.
-- (o con la CLI: `supabase db push`).
--
-- Seguridad: todas las tablas tienen RLS activado y NINGUNA política.
-- Eso significa que la clave pública (anon) no puede leer ni escribir nada:
-- solo el backend, con la clave de servicio, accede a los datos. El frontend
-- nunca habla con Supabase; habla con el backend (arquitectura opción B).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo (cambia poco; se carga con `npm run db:seed`)
-- ---------------------------------------------------------------------------

create table if not exists zonas (
  id          text primary key,
  nombre      text not null,
  nivel       text,
  tipo        text,
  tipo_labor  text not null default 'otra',   -- frente_ciego | galeria_entrada | galeria_retorno | chimenea | servicio | acceso
  orden       int  not null default 0
);

-- Variables medidas y sus límites vigentes.
-- Los límites son de REFERENCIA hasta que Ingeniería de Minas los valide
-- contra el Decreto 1886 de 2015.
create table if not exists variables (
  clave        text primary key,              -- o2, ch4, co, ... , ventilador, personas
  nombre       text not null,
  simbolo      text,
  unidad       text,
  decimales    int  not null default 2,
  rango_min    double precision,              -- rango físico válido (calidad del dato)
  rango_max    double precision,
  low_crit     double precision,
  low_warn     double precision,
  high_warn    double precision,
  high_crit    double precision,
  referencia   text,                          -- fuente normativa del límite
  monitoreada  boolean not null default true, -- false: contexto (ventilador, personas)
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- Historial de cambios de límites (trazabilidad: quién cambió qué y cuándo).
create table if not exists limites_cambios (
  id          bigint generated always as identity primary key,
  variable    text not null references variables (clave),
  anterior    jsonb,
  nuevo       jsonb not null,
  usuario     text,
  creado_en   timestamptz not null default now()
);

-- Plano de la mina versionado (lo actualiza topografía).
create table if not exists planos (
  version     int primary key,
  actualizado date not null,
  fuente      text,
  contenido   jsonb not null,                 -- nodos, tramos, ventiladores, niveles
  vigente     boolean not null default false
);
create unique index if not exists planos_un_vigente on planos (vigente) where vigente;

create table if not exists dispositivos (
  id                  text primary key,
  tipo                text not null,
  zona_id             text not null references zonas (id),
  variables           text[] not null default '{}',
  alimentacion        text,
  perfil              text,                   -- perfil de dispositivo (marca/protocolo)
  portador            text,                   -- detectores portátiles personales
  calibracion_vence   date,
  bateria             int,
  ultima_comunicacion timestamptz
);

-- ---------------------------------------------------------------------------
-- Datos operativos
-- ---------------------------------------------------------------------------

create table if not exists mediciones (
  id             bigint generated always as identity primary key,
  zona_id        text not null references zonas (id),
  variable       text not null references variables (clave),
  valor          double precision not null,
  instante       timestamptz not null,
  dispositivo_id text,
  origen         text not null default 'sensor_fijo',  -- sensor_fijo | portatil | manual | simulado
  calidad        text not null default 'valida',       -- valida | fuera_de_rango | congelada | calibracion_vencida | manual
  detalle        jsonb                                  -- p. ej. motivo y detector en registros manuales
);
create index if not exists mediciones_zona_var_tiempo on mediciones (zona_id, variable, instante desc);
create index if not exists mediciones_tiempo on mediciones (instante desc);

create table if not exists alertas (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null,               -- identifica la condición (evita duplicados)
  severidad       text not null,               -- crit | warn | off | info
  tipo            text not null,               -- Umbral superado | Tendencia predictiva | Sensor sin señal | ...
  zona_id         text references zonas (id),
  variable        text,
  valor           double precision,
  limite          double precision,
  titulo          text not null,
  detalle         text,
  protocolo       text,
  activa          boolean not null default true,
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now(),
  resuelta_en     timestamptz,
  reconocida_por  text,
  reconocida_nota text,
  reconocida_en   timestamptz
);
-- Una misma condición solo puede tener una alerta activa a la vez.
create unique index if not exists alertas_una_activa_por_clave on alertas (clave) where activa;
create index if not exists alertas_creada on alertas (creada_en desc);

-- ---------------------------------------------------------------------------
-- Seguridad: RLS activo sin políticas → solo la clave de servicio accede.
-- ---------------------------------------------------------------------------
alter table zonas            enable row level security;
alter table variables        enable row level security;
alter table limites_cambios  enable row level security;
alter table planos           enable row level security;
alter table dispositivos     enable row level security;
alter table mediciones       enable row level security;
alter table alertas          enable row level security;
