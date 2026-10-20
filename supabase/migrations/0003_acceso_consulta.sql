-- ═══════════════════════════════════════════════════════════════════════════
-- Alignment & Unblock · 0003 · Acceso de sólo consulta y alta con código
--
-- Ejecutar DESPUÉS de 0001 y 0002 (Supabase → SQL Editor → New query → Run).
-- Es idempotente. Si vuelves a ejecutar 0001, ejecuta después 0002 y 0003.
--
-- Qué agrega:
--   · Rol CONSULTA: ve toda la información y no puede modificar nada (lo impide
--     el servidor, no sólo la pantalla).
--   · Alta con código: Dirección genera un código por persona; la persona entra
--     con su correo, escribe el código y crea su propia contraseña. Sin correos.
--     Mientras no complete el alta, su correo no da acceso (aunque alguien más
--     cree una cuenta con ese correo).
--   · Nuevo código = restablecer contraseña: invalida la cuenta anterior.
--   · Las cuentas que ya existen (creadas en Authentication → Users) quedan
--     vinculadas a su correo al ejecutar este archivo y siguen entrando igual.
--
-- Requisito en Supabase → Authentication → Sign In / Providers → Email:
--   «Allow new users to sign up» ACTIVADO y «Confirm email» DESACTIVADO.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Rol CONSULTA y vínculo con la cuenta ──────────────────────────────────
alter table public.au_members drop constraint if exists au_members_rol_check;
alter table public.au_members add constraint au_members_rol_check
  check (rol in ('ADMIN', 'DIRECTOR', 'GERENTE', 'COLABORADOR', 'CONSULTA'));
alter table public.au_members add column if not exists nombre text;
alter table public.au_members add column if not exists user_id text;   -- cuenta (sub del JWT) que completó el alta

-- Códigos de alta pendientes (sólo los manejan las funciones; nadie los lee).
create table if not exists public.au_altas (
  email  text primary key references public.au_members (email) on delete cascade,
  hash   text not null,
  expira timestamptz not null,
  creado timestamptz not null default now()
);
alter table public.au_altas enable row level security;
revoke all on public.au_altas from anon, authenticated;

create or replace function public.au_hash_alta(codigo text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;

-- Cuenta del usuario autenticado (sub del JWT de Supabase Auth).
create or replace function public.au_current_sub()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- ¿La sesión demuestra que la persona controla el correo? (código por correo, enlace o
-- Microsoft). Una contraseña no: con el registro abierto, cualquiera puede crear una
-- cuenta con un correo ajeno.
create or replace function public.au_correo_comprobado()
returns boolean
language sql
stable
as $$
  select coalesce(jsonb_path_exists(auth.jwt(), '$.amr[*] ? (@.method != "password")'), false)
$$;

-- Rol del usuario autenticado; NULL si no es miembro activo o no ha completado su alta.
-- Entra la cuenta vinculada (user_id) o, si el correo aún no tiene cuenta vinculada ni
-- código pendiente, una sesión que comprobó el correo.
create or replace function public.au_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.rol from public.au_members m
  where m.email = public.au_current_email() and m.activo
    and (
      m.user_id = public.au_current_sub()
      or (m.user_id is null and not exists (select 1 from public.au_altas a where a.email = m.email) and public.au_correo_comprobado())
    )
$$;

-- Puede modificar información (todos menos CONSULTA).
create or replace function public.au_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.au_current_role() in ('ADMIN', 'DIRECTOR', 'GERENTE', 'COLABORADOR'), false)
$$;

-- ─── Escritura: CONSULTA sólo lee ─────────────────────────────────────────
drop policy if exists au_records_insert on public.au_records;
create policy au_records_insert on public.au_records
  for insert to authenticated
  with check (public.au_can_write() and (collection not in ('areas', 'settings') or public.au_is_admin()));

drop policy if exists au_records_update on public.au_records;
create policy au_records_update on public.au_records
  for update to authenticated
  using (public.au_can_write())
  with check (public.au_can_write() and (collection not in ('areas', 'settings') or public.au_is_admin()));

drop policy if exists au_records_delete on public.au_records;
create policy au_records_delete on public.au_records
  for delete to authenticated
  using (public.au_can_write() and (collection not in ('areas', 'settings') or public.au_is_admin()));

-- ─── Estado del acceso para la pantalla de inicio de sesión ───────────────
create or replace function public.au_mi_acceso()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'email', m.email,
    'rol', m.rol,
    'person_id', m.person_id,
    'activo', m.activo,
    'pendiente', public.au_current_role() is null and m.activo
  )
  from public.au_members m
  where m.email = public.au_current_email()
$$;

-- ─── Códigos de alta ──────────────────────────────────────────────────────
-- Genera (o vuelve a generar) el código de una persona. Lo usan Dirección/Administración
-- desde la app o el SQL Editor. Devuelve el código UNA vez; sólo se guarda su huella.
-- Un código nuevo invalida la cuenta anterior de ese correo (restablece la contraseña).
create or replace function public.au_generar_alta(p_email text, p_rol text default null, p_nombre text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_code text;
  v_sql_editor boolean := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' and session_user <> 'authenticator';
begin
  if not (public.au_is_admin() or v_sql_editor) then
    raise exception 'Sólo Dirección o Administración generan códigos de alta.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo no válido: %', p_email using errcode = '22023';
  end if;
  if p_rol is not null and p_rol not in ('ADMIN', 'DIRECTOR', 'GERENTE', 'COLABORADOR', 'CONSULTA') then
    raise exception 'Rol no válido: %', p_rol using errcode = '22023';
  end if;
  if not exists (select 1 from public.au_members where email = v_email) and p_rol is null then
    raise exception 'El correo % no tiene acceso: indica el rol.', v_email using errcode = '22023';
  end if;

  insert into public.au_members (email, rol, activo, nombre)
  values (v_email, coalesce(p_rol, 'CONSULTA'), true, nullif(trim(p_nombre), ''))
  on conflict (email) do update
    set rol = coalesce(p_rol, public.au_members.rol),
        nombre = coalesce(nullif(trim(p_nombre), ''), public.au_members.nombre),
        activo = true,
        user_id = null;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.au_altas (email, hash, expira)
  values (v_email, public.au_hash_alta(v_code), now() + interval '30 days')
  on conflict (email) do update set hash = excluded.hash, expira = excluded.expira, creado = now();

  -- La cuenta anterior de ese correo (si existe) deja de servir: la persona crea una contraseña nueva.
  if to_regclass('auth.users') is not null then
    execute 'delete from auth.users where lower(email) = $1' using v_email;
  end if;

  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end
$$;

-- ¿El código corresponde a ese correo y sigue vigente? (antes de crear la contraseña)
create or replace function public.au_alta_valida(p_email text, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.au_altas a join public.au_members m on m.email = a.email
    where a.email = lower(trim(p_email)) and m.activo
      and a.hash = public.au_hash_alta(p_codigo) and a.expira > now()
  )
$$;

-- Completa el alta: vincula el correo con la cuenta que acaba de crear la persona.
create or replace function public.au_completar_alta(p_codigo text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.au_current_email();
  v_sub text := public.au_current_sub();
  v_rol text;
begin
  if v_email = '' or v_sub is null then
    raise exception 'Inicia sesión para completar tu alta.' using errcode = '42501';
  end if;
  if not public.au_alta_valida(v_email, p_codigo) then
    raise exception 'El código no corresponde a tu correo o ya expiró.' using errcode = '22023';
  end if;
  update public.au_members set user_id = v_sub where email = v_email returning rol into v_rol;
  delete from public.au_altas where email = v_email;
  return v_rol;
end
$$;

-- Vincula los correos con acceso a su cuenta ya confirmada (Authentication → Users).
-- Se ejecuta al final de este archivo; vuelve a ejecutarlo si creas cuentas a mano:
--   select public.au_vincular_cuentas();
create or replace function public.au_vincular_cuentas()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_sql_editor boolean := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' and session_user <> 'authenticator';
begin
  if not (public.au_is_admin() or v_sql_editor) then
    raise exception 'Sólo Dirección o Administración vinculan cuentas.' using errcode = '42501';
  end if;
  if to_regclass('auth.users') is not null then
    execute $q$
      update public.au_members m set user_id = u.id::text
      from auth.users u
      where lower(u.email) = m.email and u.email_confirmed_at is not null
        and m.user_id is null
        and not exists (select 1 from public.au_altas a where a.email = m.email)
    $q$;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end
$$;

-- Altas pendientes (para la pantalla de Accesos).
create or replace function public.au_altas_pendientes()
returns table (email text, expira timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.email, a.expira from public.au_altas a where public.au_is_admin() order by a.email
$$;

revoke all on function public.au_generar_alta(text, text, text), public.au_completar_alta(text), public.au_alta_valida(text, text), public.au_mi_acceso(), public.au_altas_pendientes(), public.au_vincular_cuentas() from public;
grant execute on function public.au_alta_valida(text, text) to anon, authenticated;
grant execute on function public.au_mi_acceso(), public.au_completar_alta(text), public.au_generar_alta(text, text, text), public.au_altas_pendientes(), public.au_vincular_cuentas() to authenticated;

select public.au_vincular_cuentas() as cuentas_vinculadas;

-- ═══════════════════════════════════════════════════════════════════════════
-- Para dar de alta a varias personas de una vez (SQL Editor), por ejemplo:
--
--   select n.nombre, n.email, public.au_generar_alta(n.email, 'CONSULTA', n.nombre) as codigo
--   from (values ('Nombre Apellido', 'correo@socasesores.com.mx')) as n(nombre, email);
--
-- Copia la columna «codigo» y entrégale a cada persona el suyo.
-- ═══════════════════════════════════════════════════════════════════════════
