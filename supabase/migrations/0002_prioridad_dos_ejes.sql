-- ═══════════════════════════════════════════════════════════════════════════
-- Alignment & Unblock · 0002 · Prioridad en dos ejes (estratégica / operativa)
--
-- Ejecutar DESPUÉS de 0001 y ANTES de publicar la nueva versión de la app:
--   Supabase → SQL Editor → New query → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin perder información.
--
-- Qué agrega:
--   · Colección priorityLog (bitácora de cambios de prioridad): sólo Dirección
--     escribe en ella y nadie puede modificarla después.
--   · Protección de proyectos: sólo Dirección cambia la prioridad directiva,
--     los vínculos con la matriz y el acuerdo; con el acuerdo cerrado, las
--     gerencias ya no cambian impacto, urgencia, dependencia, solicitante ni frente.
--   · Vista de proyectos con las nuevas columnas y vista de la bitácora.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Nueva colección ───────────────────────────────────────────────────────
alter table public.au_records drop constraint if exists au_records_collection_check;
alter table public.au_records add constraint au_records_collection_check check (collection in (
  'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
  'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings', 'priorityLog'
));

create index if not exists au_records_plog_project_idx on public.au_records ((data ->> 'projectId')) where collection = 'priorityLog';

-- Restaurar respaldo: incluye la bitácora.
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

  delete from public.au_records;

  insert into public.au_records (collection, id, data)
  select c.key, item ->> 'id', item
  from jsonb_each(payload) as c(key, value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.value) = 'array' then c.value else '[]'::jsonb end
  ) as item
  where c.key in (
    'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
    'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings', 'priorityLog'
  );

  get diagnostics total = row_count;
  return total;
end
$$;

-- ─── Reglas de prioridad (se aplican en el servidor) ───────────────────────
create or replace function public.au_priority_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  admin boolean := public.au_is_admin();
begin
  -- Bitácora: sólo Dirección agrega; nadie la modifica; sólo Dirección la borra (restaurar / vaciar).
  if coalesce(new.collection, old.collection) = 'priorityLog' then
    if tg_op = 'INSERT' and not admin then
      raise exception 'Sólo Dirección registra cambios de prioridad.' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.data is distinct from old.data then
      raise exception 'La bitácora de prioridades no se puede modificar.' using errcode = '42501';
    elsif tg_op = 'DELETE' and not admin then
      raise exception 'La bitácora de prioridades no se puede borrar.' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' or new.collection <> 'projects' or admin then
    return coalesce(new, old);
  end if;

  -- Proyectos (gerencias y colaboradores).
  if tg_op = 'INSERT' then
    if coalesce(new.data -> 'prioridadDireccion', 'null'::jsonb) not in ('null'::jsonb, '{}'::jsonb)
       or coalesce(new.data -> 'vinculos', 'null'::jsonb) not in ('null'::jsonb, '[]'::jsonb)
       or coalesce(new.data -> 'acuerdo' ->> 'bloqueado', 'false') = 'true' then
      raise exception 'Sólo Dirección establece prioridades directivas.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.data -> 'prioridadDireccion' is distinct from old.data -> 'prioridadDireccion'
     or new.data -> 'vinculos' is distinct from old.data -> 'vinculos'
     or new.data -> 'acuerdo' is distinct from old.data -> 'acuerdo' then
    raise exception 'Sólo Dirección cambia la prioridad directiva o el acuerdo de prioridades.' using errcode = '42501';
  end if;

  if coalesce(old.data -> 'acuerdo' ->> 'bloqueado', 'false') = 'true' and (
       new.data -> 'impacto'     is distinct from old.data -> 'impacto'
    or new.data -> 'urgencia'    is distinct from old.data -> 'urgencia'
    or new.data -> 'dependencia' is distinct from old.data -> 'dependencia'
    or new.data -> 'solicitante' is distinct from old.data -> 'solicitante'
    or new.data -> 'frente'      is distinct from old.data -> 'frente'
  ) then
    raise exception 'El acuerdo de prioridad está cerrado: sólo Dirección cambia su ponderación.' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists au_records_priority_guard on public.au_records;
create trigger au_records_priority_guard
before insert or update or delete on public.au_records
for each row execute function public.au_priority_guard();

-- ─── Vistas para reportes ──────────────────────────────────────────────────
-- (las columnas nuevas van al final para conservar las existentes)
create or replace view public.au_projects_v with (security_invoker = true) as
select
  r.id,
  r.data ->> 'nombre'                     as nombre,
  a.data ->> 'nombre'                     as area,
  p.data ->> 'nombre'                     as responsable,
  (r.data ->> 'impacto')::int             as impacto,
  (r.data ->> 'urgencia')::int            as urgencia,
  (r.data ->> 'dependencia')::int         as dependencia,
  (r.data ->> 'score')::int               as score,
  r.data ->> 'prioridadCalculada'         as prioridad_calculada,
  r.data ->> 'prioridadFinal'             as prioridad_final,
  (r.data ->> 'ajusteDireccion')::boolean as ajuste_direccion,
  r.data ->> 'eisenhower'                 as eisenhower,
  r.data ->> 'estado'                     as estado,
  (r.data ->> 'bloqueado')::boolean       as bloqueado,
  r.data ->> 'fechaObjetivo'              as fecha_objetivo,
  r.updated_at,
  r.updated_by,
  r.data -> 'clasif' ->> 'estrategica'          as prioridad_estrategica,
  r.data -> 'clasif' ->> 'operativa'            as prioridad_operativa,
  r.data -> 'clasif' ->> 'integrada'            as clasificacion,
  r.data -> 'clasif' ->> 'fuenteEstrategica'    as fuente_estrategica,
  r.data -> 'clasif' ->> 'fuenteOperativa'      as fuente_operativa,
  r.data -> 'clasif' ->> 'motivoEstrategica'    as motivo_estrategica,
  r.data -> 'clasif' ->> 'motivoOperativa'      as motivo_operativa,
  r.data ->> 'solicitante'                      as solicitante,
  r.data ->> 'frente'                           as frente,
  coalesce((r.data -> 'acuerdo' ->> 'bloqueado')::boolean, false) as acuerdo_cerrado,
  r.data ->> 'notaRevalidar'                    as nota_revalidar,
  r.data ->> 'ref'                              as ref
from public.au_records r
left join public.au_records a on a.collection = 'areas'  and a.id = r.data ->> 'areaId'
left join public.au_records p on p.collection = 'people' and p.id = r.data ->> 'responsable'
where r.collection = 'projects';

create or replace view public.au_priority_log_v with (security_invoker = true) as
select
  r.id,
  pr.data ->> 'nombre'                     as proyecto,
  a.data ->> 'nombre'                      as area,
  r.data ->> 'tipo'                        as tipo,
  r.data ->> 'eje'                         as eje,
  r.data ->> 'anterior'                    as valor_anterior,
  r.data ->> 'nuevo'                       as valor_nuevo,
  r.data ->> 'motivo'                      as motivo,
  r.data ->> 'fuente'                      as fuente,
  pe.data ->> 'nombre'                     as responsable,
  (r.data ->> 'createdAt')::timestamptz    as fecha
from public.au_records r
left join public.au_records pr on pr.collection = 'projects' and pr.id = r.data ->> 'projectId'
left join public.au_records a  on a.collection  = 'areas'    and a.id  = r.data ->> 'areaId'
left join public.au_records pe on pe.collection = 'people'   and pe.id = r.data ->> 'responsable'
where r.collection = 'priorityLog';

grant select on public.au_projects_v, public.au_priority_log_v to authenticated;
