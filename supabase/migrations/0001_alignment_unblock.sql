-- ═══════════════════════════════════════════════════════════════════════════
-- Alignment & Unblock · esquema para Supabase (PostgreSQL)
--
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin perder información.
--
-- Diseño:
--   · au_members   → quién tiene acceso (por correo) y con qué rol.
--   · au_records   → un registro por entidad (proyecto, compromiso, bloqueo…),
--                    con el documento completo en JSONB. Así el modelo de la app
--                    (src/domain/types.ts) se guarda tal cual, sin capas extra.
--   · Vistas au_*_v → columnas tipadas para reportes (Power BI, Excel, SQL).
--   · RLS           → sólo miembros activos leen/escriben; áreas y configuración
--                    sólo ADMIN/DIRECTOR; restaurar y vaciar sólo ADMIN/DIRECTOR.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Accesos ────────────────────────────────────────────────────────────────
create table if not exists public.au_members (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  rol        text not null check (rol in ('ADMIN', 'DIRECTOR', 'GERENTE', 'COLABORADOR')),
  person_id  text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.au_members is 'Alignment & Unblock · correos con acceso y su rol.';

-- Correo del usuario autenticado (del JWT de Supabase Auth), en minúsculas.
create or replace function public.au_current_email()
returns text
language sql
stable
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Rol del usuario autenticado; NULL si no es miembro activo.
-- SECURITY DEFINER evita recursión con la RLS de au_members.
create or replace function public.au_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.rol from public.au_members m
  where m.email = public.au_current_email() and m.activo
$$;

create or replace function public.au_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.au_current_role() in ('ADMIN', 'DIRECTOR'), false)
$$;

-- ─── Registros ──────────────────────────────────────────────────────────────
create table if not exists public.au_records (
  collection text not null check (collection in (
    'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
    'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings'
  )),
  id         text not null,
  data       jsonb not null,
  client_id  text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  constraint au_records_id_matches check (data ->> 'id' = id)
);

comment on table public.au_records is 'Alignment & Unblock · entidades de la app (documento JSON por registro).';

create index if not exists au_records_week_idx    on public.au_records ((data ->> 'weekId'))    where collection in ('blocks', 'commitments', 'weeklyUpdates', 'sessions', 'decisions', 'snapshots', 'areaUpdates');
create index if not exists au_records_project_idx on public.au_records ((data ->> 'projectId')) where collection in ('blocks', 'commitments', 'weeklyUpdates', 'decisions');

-- Auditoría mínima: quién y cuándo modificó cada registro.
create or replace function public.au_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := nullif(public.au_current_email(), '');
  return new;
end
$$;

drop trigger if exists au_records_touch on public.au_records;
create trigger au_records_touch
before insert or update on public.au_records
for each row execute function public.au_touch();

-- Para que los eventos DELETE en tiempo real incluyan la colección.
alter table public.au_records replica identity full;

-- ─── Seguridad (RLS) ────────────────────────────────────────────────────────
alter table public.au_members enable row level security;
alter table public.au_records enable row level security;

drop policy if exists au_members_select on public.au_members;
create policy au_members_select on public.au_members
  for select to authenticated
  using (email = public.au_current_email() or public.au_is_admin());

drop policy if exists au_members_write on public.au_members;
create policy au_members_write on public.au_members
  for all to authenticated
  using (public.au_is_admin())
  with check (public.au_is_admin());

drop policy if exists au_records_select on public.au_records;
create policy au_records_select on public.au_records
  for select to authenticated
  using (public.au_current_role() is not null);

-- Escritura: cualquier miembro activo, excepto áreas y configuración (sólo ADMIN/DIRECTOR).
drop policy if exists au_records_insert on public.au_records;
create policy au_records_insert on public.au_records
  for insert to authenticated
  with check (
    public.au_current_role() is not null
    and (collection not in ('areas', 'settings') or public.au_is_admin())
  );

drop policy if exists au_records_update on public.au_records;
create policy au_records_update on public.au_records
  for update to authenticated
  using (public.au_current_role() is not null)
  with check (
    public.au_current_role() is not null
    and (collection not in ('areas', 'settings') or public.au_is_admin())
  );

drop policy if exists au_records_delete on public.au_records;
create policy au_records_delete on public.au_records
  for delete to authenticated
  using (
    public.au_current_role() is not null
    and (collection not in ('areas', 'settings') or public.au_is_admin())
  );

revoke all on public.au_members, public.au_records from anon;
grant select, insert, update, delete on public.au_members, public.au_records to authenticated;

-- ─── Restaurar respaldo / vaciar (sólo ADMIN/DIRECTOR) ──────────────────────
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
    'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings'
  );

  get diagnostics total = row_count;
  return total;
end
$$;

create or replace function public.au_clear()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.au_is_admin() then
    raise exception 'Sólo Dirección o Administración pueden borrar la información.' using errcode = '42501';
  end if;
  delete from public.au_records;
end
$$;

revoke all on function public.au_replace_all(jsonb), public.au_clear() from public, anon;
grant execute on function public.au_replace_all(jsonb), public.au_clear() to authenticated;

-- ─── Tiempo real ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'au_records'
     ) then
    alter publication supabase_realtime add table public.au_records;
  end if;
end
$$;

-- ─── Vistas para reportes (respetan la RLS del usuario que consulta) ───────
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
  r.updated_by
from public.au_records r
left join public.au_records a on a.collection = 'areas'  and a.id = r.data ->> 'areaId'
left join public.au_records p on p.collection = 'people' and p.id = r.data ->> 'responsable'
where r.collection = 'projects';

create or replace view public.au_commitments_v with (security_invoker = true) as
select
  r.id,
  r.data ->> 'accion'                  as accion,
  pr.data ->> 'nombre'                 as proyecto,
  p.data ->> 'nombre'                  as responsable,
  r.data ->> 'apoyo'                   as apoyo,
  (r.data ->> 'fecha')::date           as fecha,
  r.data ->> 'hora'                    as hora,
  r.data ->> 'estado'                  as estado,
  (r.data ->> 'fechaOriginal')::date   as fecha_original,
  r.data ->> 'horaOriginal'            as hora_original,
  (r.data ->> 'reprogramaciones')::int as reprogramaciones,
  r.data ->> 'weekId'                  as semana,
  r.updated_at
from public.au_records r
left join public.au_records pr on pr.collection = 'projects' and pr.id = r.data ->> 'projectId'
left join public.au_records p  on p.collection = 'people'   and p.id  = r.data ->> 'responsable'
where r.collection = 'commitments';

create or replace view public.au_blocks_v with (security_invoker = true) as
select
  r.id,
  pr.data ->> 'nombre'          as proyecto,
  r.data ->> 'descripcion'      as bloqueo,
  r.data ->> 'necesidad'        as necesidad,
  r.data ->> 'areaDependencia'  as depende_de,
  r.data ->> 'estado'           as estado,
  r.data ->> 'weekId'           as semana,
  (r.data ->> 'createdAt')::timestamptz  as creado,
  (r.data ->> 'resolvedAt')::timestamptz as resuelto
from public.au_records r
left join public.au_records pr on pr.collection = 'projects' and pr.id = r.data ->> 'projectId'
where r.collection = 'blocks';

grant select on public.au_projects_v, public.au_commitments_v, public.au_blocks_v to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMER ACCESO: después de ejecutar este archivo, da acceso de administrador
-- a tu correo (cámbialo por el tuyo) y ejecuta sólo esta línea:
--
--   insert into public.au_members (email, rol) values ('tu-correo@socasesores.com.mx', 'ADMIN')
--   on conflict (email) do update set rol = 'ADMIN', activo = true;
--
-- Los demás accesos se administran desde la app: Configuración → Accesos.
-- ═══════════════════════════════════════════════════════════════════════════
