-- ============================================================================
-- AtmoSmart — Funciones de consulta agregada
-- Promedian las mediciones por intervalos de N minutos dentro de PostgreSQL,
-- para que un gráfico de 24 h no tenga que descargar miles de filas crudas.
-- Solo las puede ejecutar el backend (clave de servicio).
-- ============================================================================

create or replace function serie_agregada(
  p_zona text, p_variable text, p_desde timestamptz, p_hasta timestamptz, p_paso_min int
) returns table (t timestamptz, zona_id text, variable text, v double precision)
language sql stable as $$
  select date_bin(make_interval(mins => p_paso_min), m.instante, timestamptz '2000-01-01') as t,
         m.zona_id, m.variable, avg(m.valor) as v
  from mediciones m
  where m.zona_id = p_zona and m.variable = p_variable
    and m.instante >= p_desde and m.instante <= p_hasta
    and m.origen <> 'manual'
  group by 1, 2, 3
  order by 1 desc;
$$;

create or replace function historial_agregado(
  p_zona text, p_desde timestamptz, p_hasta timestamptz, p_paso_min int
) returns table (t timestamptz, zona_id text, variable text, v double precision)
language sql stable as $$
  select date_bin(make_interval(mins => p_paso_min), m.instante, timestamptz '2000-01-01') as t,
         m.zona_id, m.variable, avg(m.valor) as v
  from mediciones m
  where (p_zona is null or m.zona_id = p_zona)
    and m.instante >= p_desde and m.instante <= p_hasta
    and m.origen <> 'manual'
  group by 1, 2, 3
  order by 1 desc;
$$;

revoke execute on function serie_agregada(text, text, timestamptz, timestamptz, int) from public, anon, authenticated;
revoke execute on function historial_agregado(text, timestamptz, timestamptz, int) from public, anon, authenticated;
