-- ═══════════════════════════════════════════════════════════════════════════
-- Alignment & Unblock · 0004 · Inversión, KPIs y Resultados
--
-- Ejecutar DESPUÉS de 0001, 0002 y 0003 (Supabase → SQL Editor → New query → Run)
-- y ANTES de publicar la versión de la app que trae el módulo.
-- Es idempotente: se puede volver a ejecutar sin perder información.
-- No borra ni modifica registros existentes y no cambia las políticas de seguridad.
--
-- Qué agrega (en la misma tabla au_records, como el resto de la información):
--   · 13 colecciones nuevas: objectives, kpis, kpiTargets, results, budgetLines,
--     budgetMovements, spend, budgetCommitments, budgetAllocations, projectKpis,
--     projectAreas, revenues, efficiencyScopes. Las relaciones son por id
--     (projectKpis, budgetAllocations y projectAreas son tablas de asociación).
--   · Permisos diferenciados (trigger, se suma a la RLS existente):
--       - Cifras financieras, KPIs, metas y alcances: sólo ADMIN / DIRECTOR.
--       - Resultados: las gerencias capturan «pendiente»; sólo Dirección confirma
--         y sólo Dirección modifica o borra un resultado confirmado.
--   · Controles de integridad en el servidor: sin duplicados (gasto por categoría
--     y mes, resultado por KPI y periodo, meta por KPI y periodo, vínculos), sin
--     asignaciones superiores al presupuesto vigente, transferencias con origen y
--     destino distintos, KPIs con fuente, sin colocación hipotecaria como ingreso.
--   · Restaurar respaldo incluye las colecciones nuevas.
--   · Vistas para reportes / Power BI: au_budget_v, au_kpis_v, au_results_v,
--     au_project_investment_v.
--
-- Si vuelves a ejecutar 0001 o 0002, ejecuta después 0003 y 0004.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Colecciones ───────────────────────────────────────────────────────────
alter table public.au_records drop constraint if exists au_records_collection_check;
alter table public.au_records add constraint au_records_collection_check check (collection in (
  'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
  'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings', 'priorityLog',
  'objectives', 'kpis', 'kpiTargets', 'results', 'budgetLines', 'budgetMovements', 'spend',
  'budgetCommitments', 'budgetAllocations', 'projectKpis', 'projectAreas', 'revenues', 'efficiencyScopes'
));

-- ─── Restaurar respaldo: todas las colecciones ─────────────────────────────
create or replace function public.au_replace_all(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  if not public.au_is_admin() then
    raise exception 'Sólo Dirección o Administración pueden restaurar respaldos.' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'Respaldo inválido.' using errcode = '22023';
  end if;
  -- Durante la restauración el orden de inserción no garantiza que la partida exista
  -- antes que su asignación: el tope de asignación se valida en la app al respaldar.
  perform set_config('au.restaurando', 'on', true);

  delete from public.au_records;

  insert into public.au_records (collection, id, data)
  select c.key, item ->> 'id', item
  from jsonb_each(payload) as c(key, value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.value) = 'array' then c.value else '[]'::jsonb end
  ) as item
  where c.key in (
    'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
    'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings', 'priorityLog',
    'objectives', 'kpis', 'kpiTargets', 'results', 'budgetLines', 'budgetMovements', 'spend',
    'budgetCommitments', 'budgetAllocations', 'projectKpis', 'projectAreas', 'revenues', 'efficiencyScopes'
  );

  get diagnostics total = row_count;
  perform set_config('au.restaurando', 'off', true);
  return total;
end
$$;

-- ─── Presupuesto vigente de una partida ────────────────────────────────────
-- Inicial + ampliaciones − reducciones ± transferencias CONFIRMADAS.
create or replace function public.au_linea_vigente(p_linea text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (data ->> 'original')::numeric from public.au_records where collection = 'budgetLines' and id = p_linea), 0)
       + coalesce((select sum((data ->> 'monto')::numeric) from public.au_records
                   where collection = 'budgetMovements' and data ->> 'estado' = 'CONFIRMADO'
                     and data ->> 'tipo' in ('ampliacion', 'transferencia') and data ->> 'aLineaId' = p_linea), 0)
       - coalesce((select sum((data ->> 'monto')::numeric) from public.au_records
                   where collection = 'budgetMovements' and data ->> 'estado' = 'CONFIRMADO'
                     and data ->> 'tipo' in ('reduccion', 'transferencia') and data ->> 'deLineaId' = p_linea), 0)
$$;

-- ¿Se ejecuta desde el SQL Editor (sin sesión de la app)?
create or replace function public.au_es_editor_sql()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' and session_user <> 'authenticator'
$$;

-- ─── Permisos diferenciados e integridad ───────────────────────────────────
create or replace function public.au_inversion_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  col text := coalesce(new.collection, old.collection);
  admin boolean;
  asignado numeric;
  vigente numeric;
begin
  if col not in ('objectives', 'kpis', 'kpiTargets', 'results', 'budgetLines', 'budgetMovements', 'spend',
                 'budgetCommitments', 'budgetAllocations', 'projectKpis', 'projectAreas', 'revenues', 'efficiencyScopes') then
    return coalesce(new, old);
  end if;
  admin := public.au_is_admin() or public.au_es_editor_sql();

  if col in ('objectives', 'kpis', 'kpiTargets', 'budgetLines', 'budgetMovements', 'spend',
             'budgetCommitments', 'budgetAllocations', 'revenues', 'efficiencyScopes') and not admin then
    raise exception 'Sólo Dirección o Administración modifican cifras financieras, KPIs y metas.' using errcode = '42501';
  end if;

  if col = 'results' and not admin then
    if tg_op in ('UPDATE', 'DELETE') and old.data ->> 'estado' = 'CONFIRMADO' then
      raise exception 'Este resultado ya fue confirmado: sólo Dirección lo modifica.' using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.data ->> 'estado' = 'CONFIRMADO' then
      raise exception 'Sólo Dirección confirma resultados.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if col = 'kpis' and coalesce(btrim(new.data ->> 'fuente'), '') = '' then
    raise exception 'Un KPI necesita fuente.' using errcode = '23514';
  end if;

  if col = 'budgetMovements' and new.data ->> 'tipo' = 'transferencia'
     and (new.data ->> 'deLineaId' is null or new.data ->> 'aLineaId' is null or new.data ->> 'deLineaId' = new.data ->> 'aLineaId') then
    raise exception 'Una transferencia necesita partidas de origen y destino distintas.' using errcode = '23514';
  end if;

  if col = 'revenues' and new.data ->> 'concepto' ~* '(colocaci|cr[eé]dito hipotecario)' then
    raise exception 'La colocación hipotecaria no es ingreso de SOC.' using errcode = '23514';
  end if;

  if col = 'budgetAllocations' and coalesce(current_setting('au.restaurando', true), 'off') <> 'on' then
    if coalesce((new.data ->> 'monto')::numeric, 0) <= 0 then
      raise exception 'El monto asignado debe ser mayor que cero.' using errcode = '23514';
    end if;
    select coalesce(sum((data ->> 'monto')::numeric), 0) into asignado
    from public.au_records
    where collection = 'budgetAllocations' and id <> new.id and data ->> 'lineaId' = new.data ->> 'lineaId';
    vigente := public.au_linea_vigente(new.data ->> 'lineaId');
    if asignado + (new.data ->> 'monto')::numeric > vigente + 0.005 then
      raise exception 'La asignación supera el presupuesto vigente de la partida (vigente %, ya asignado %).', vigente, asignado using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists au_records_inversion_guard on public.au_records;
create trigger au_records_inversion_guard
before insert or update or delete on public.au_records
for each row execute function public.au_inversion_guard();

-- ─── Sin duplicados (doble conteo) ─────────────────────────────────────────
create unique index if not exists au_uq_spend on public.au_records (lower(data ->> 'categoria'), (data ->> 'mes')) where collection = 'spend';
create unique index if not exists au_uq_budget_line on public.au_records (lower(data ->> 'clave')) where collection = 'budgetLines';
create unique index if not exists au_uq_movement on public.au_records (lower(data ->> 'folio')) where collection = 'budgetMovements';
create unique index if not exists au_uq_kpi on public.au_records (lower(data ->> 'clave')) where collection = 'kpis';
create unique index if not exists au_uq_kpi_target on public.au_records ((data ->> 'kpiId'), (data -> 'periodo' ->> 'inicio'), (data -> 'periodo' ->> 'fin')) where collection = 'kpiTargets';
create unique index if not exists au_uq_result on public.au_records ((data ->> 'kpiId'), (data -> 'periodo' ->> 'inicio'), (data -> 'periodo' ->> 'fin'))
  where collection = 'results' and data ->> 'kpiId' is not null;
create unique index if not exists au_uq_allocation on public.au_records ((data ->> 'lineaId'), (data ->> 'projectId')) where collection = 'budgetAllocations';
create unique index if not exists au_uq_project_kpi on public.au_records ((data ->> 'projectId'), (data ->> 'kpiId')) where collection = 'projectKpis';
create unique index if not exists au_uq_project_area on public.au_records ((data ->> 'projectId'), (data ->> 'areaId')) where collection = 'projectAreas';

-- ─── Vistas para reportes ──────────────────────────────────────────────────
create or replace view public.au_budget_v with (security_invoker = true) as
select
  l.id,
  l.data ->> 'clave'                         as clave,
  l.data ->> 'nombre'                        as partida,
  (l.data ->> 'original')::numeric           as autorizado_inicial,
  public.au_linea_vigente(l.id)              as vigente,
  coalesce((select sum((s.data ->> 'monto')::numeric) from public.au_records s
            where s.collection = 'spend'
              and s.data ->> 'categoria' in (select jsonb_array_elements_text(l.data -> 'categoriasContables'))), 0) as ejercido_contable,
  coalesce((select sum((c.data ->> 'monto')::numeric) from public.au_records c
            where c.collection = 'budgetCommitments' and c.data ->> 'lineaId' = l.id and c.data ->> 'situacion' = 'comprometido'), 0) as comprometido,
  coalesce((select sum((a.data ->> 'monto')::numeric) from public.au_records a
            where a.collection = 'budgetAllocations' and a.data ->> 'lineaId' = l.id), 0) as asignado_a_proyectos,
  coalesce((l.data ->> 'revolvente')::boolean, false) as revolvente,
  l.data ->> 'estado'                        as estado,
  l.data ->> 'fuente'                        as fuente,
  l.data ->> 'discrepancia'                  as discrepancia
from public.au_records l
where l.collection = 'budgetLines';

create or replace view public.au_kpis_v with (security_invoker = true) as
select
  k.id,
  k.data ->> 'clave'       as clave,
  k.data ->> 'nombre'      as kpi,
  k.data ->> 'grupo'       as grupo,
  k.data ->> 'tipo'        as tipo,
  o.data ->> 'nombre'      as objetivo,
  (select string_agg(a.data ->> 'nombre', ', ') from public.au_records a
   where a.collection = 'areas' and a.id in (select jsonb_array_elements_text(k.data -> 'areaIds'))) as gerencias,
  k.data ->> 'unidad'      as unidad,
  k.data ->> 'sentido'     as sentido,
  k.data ->> 'fuente'      as fuente,
  k.data ->> 'estado'      as estado,
  (select count(*) from public.au_records l where l.collection = 'projectKpis' and l.data ->> 'kpiId' = k.id) as proyectos_vinculados
from public.au_records k
left join public.au_records o on o.collection = 'objectives' and o.id = k.data ->> 'objetivoId'
where k.collection = 'kpis';

create or replace view public.au_results_v with (security_invoker = true) as
select
  r.id,
  k.data ->> 'clave'                       as kpi_clave,
  k.data ->> 'nombre'                      as kpi,
  r.data ->> 'metrica'                     as metrica,
  (r.data ->> 'valor')::numeric            as valor,
  r.data ->> 'unidad'                      as unidad,
  (r.data -> 'periodo' ->> 'inicio')::date as periodo_inicio,
  (r.data -> 'periodo' ->> 'fin')::date    as periodo_fin,
  r.data ->> 'fuente'                      as fuente,
  r.data ->> 'estado'                      as estado,
  (r.data ->> 'kpiId') is null             as pendiente_vinculacion
from public.au_records r
left join public.au_records k on k.collection = 'kpis' and k.id = r.data ->> 'kpiId'
where r.collection = 'results';

create or replace view public.au_project_investment_v with (security_invoker = true) as
select
  p.id,
  p.data ->> 'nombre' as proyecto,
  ar.data ->> 'nombre' as gerencia,
  p.data -> 'clasif' ->> 'integrada' as clasificacion,
  p.data ->> 'estado' as estado,
  coalesce((select sum((a.data ->> 'monto')::numeric) from public.au_records a
            where a.collection = 'budgetAllocations' and a.data ->> 'projectId' = p.id), 0) as presupuesto_asignado,
  coalesce((select sum((c.data ->> 'monto')::numeric) from public.au_records c
            where c.collection = 'budgetCommitments' and c.data ->> 'projectId' = p.id and c.data ->> 'situacion' = 'comprometido'), 0) as comprometido,
  coalesce((select sum((c.data ->> 'monto')::numeric) from public.au_records c
            where c.collection = 'budgetCommitments' and c.data ->> 'projectId' = p.id and c.data ->> 'situacion' = 'ejercido'), 0) as ejercido,
  (select count(*) from public.au_records l where l.collection = 'projectKpis' and l.data ->> 'projectId' = p.id) as kpis_vinculados
from public.au_records p
left join public.au_records ar on ar.collection = 'areas' and ar.id = p.data ->> 'areaId'
where p.collection = 'projects';

revoke all on function public.au_linea_vigente(text) from public, anon;
grant execute on function public.au_linea_vigente(text) to authenticated;
grant select on public.au_budget_v, public.au_kpis_v, public.au_results_v, public.au_project_investment_v to authenticated;
