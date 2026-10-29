-- AtmoSmart — Límites y configuración (lo que muestra la pantalla "Límites y configuración").
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 001 y 002. Es repetible (usa "if not exists").
-- Los datos se cargan con:  npm run db:seed

-- 1) Límites normativos: variable, límite o condición, cómo se evalúa y su referencia.
create table if not exists limites_normativos (
  id              text primary key,        -- p. ej. 'o2', 'ch4-frente', 'co'
  variable        text not null,           -- "O₂ Oxígeno", "CH₄ Metano — Frente de explotación o avance"
  limite          text not null,           -- límite / condición
  como_se_evalua  text not null,           -- "Lectura instantánea", "Promedio de la jornada (TWA)..."
  referencia      text not null,           -- artículo del Decreto 1886 de 2015
  orden           int  not null default 0,
  actualizado_en  timestamptz not null default now()
);

-- 2) Límites por zona: sitio de la labor (Art. 53, metano) y tipo de vía (Art. 56, velocidad del aire).
create table if not exists limites_zona (
  zona_id                 text primary key references zonas(id) on delete cascade,
  sitio_labor             text not null,
  labor_clave             text not null,
  ch4_max                 numeric not null,          -- % de metano que obliga a evacuar
  labor_criterio_interno  boolean not null default false,
  tipo_via                text not null,
  vent_clave              text not null,
  aire_min                numeric,                   -- m/s (null = sin mínimo)
  aire_max                numeric,                   -- m/s (null = exceptuado del máximo)
  via_criterio_interno    boolean not null default false,
  actualizado_en          timestamptz not null default now()
);

-- 3) Criterios internos: los define el equipo (NO son límites legales). Editables desde la pantalla.
create table if not exists criterios_internos (
  clave           text primary key,
  etiqueta        text not null,
  unidad          text not null default '',
  valor           text not null,                     -- número o texto ('arriba' / 'cercano')
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- Igual que el resto: RLS activo y SIN políticas. Solo el backend (clave de servicio) accede.
alter table limites_normativos enable row level security;
alter table limites_zona       enable row level security;
alter table criterios_internos enable row level security;
