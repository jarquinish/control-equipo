-- Pruebas de seguridad (RLS) y funciones. Falla con excepción si algo no se cumple.
\set ON_ERROR_STOP on
insert into public.au_members (email, rol) values ('admin@soc.mx', 'ADMIN'), ('gerente@soc.mx', 'GERENTE'), ('baja@soc.mx', 'COLABORADOR');
update public.au_members set activo = false where email = 'baja@soc.mx';

create or replace function pg_temp.as_user(email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('email', email, 'role', 'authenticated')::text, false);
end $$;

set role authenticated;

-- 1. Admin escribe áreas, configuración y proyectos
select pg_temp.as_user('admin@soc.mx') \gset
insert into public.au_records (collection, id, data) values
  ('areas', 'a1', '{"id":"a1","nombre":"Diseño"}'),
  ('settings', 'settings', '{"id":"settings"}'),
  ('projects', 'p1', '{"id":"p1","nombre":"KV","areaId":"a1","score":8,"impacto":3,"urgencia":3,"dependencia":2,"prioridadFinal":"P1"}');
do $$ begin
  assert (select count(*) from public.au_records) = 3, 'admin ve 3 registros';
  assert (select updated_by from public.au_records where id = 'p1') = 'admin@soc.mx', 'auditoría updated_by';
  assert (select area from public.au_projects_v where id = 'p1') = 'Diseño', 'vista de proyectos con área';
end $$;

-- 2. Gerente: lee todo, escribe proyectos/compromisos, NO áreas ni configuración
select pg_temp.as_user('gerente@soc.mx') \gset
do $$ begin assert (select count(*) from public.au_records) = 3, 'gerente lee'; end $$;
insert into public.au_records (collection, id, data) values ('commitments', 'c1', '{"id":"c1","accion":"Pedir agenda","projectId":"p1","fecha":"2026-10-07","hora":"11:00","estado":"pendiente","reprogramaciones":0}');
update public.au_records set data = jsonb_set(data, '{score}', '9') where id = 'p1';
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('areas', 'a2', '{"id":"a2","nombre":"X"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no crea áreas';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = '{"id":"settings","x":1}' where collection = 'settings';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no modifica configuración';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.au_clear(); exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no puede vaciar';
end $$;
do $$ begin assert (select count(*) from public.au_members) = 1, 'gerente sólo ve su acceso'; end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_members (email, rol) values ('nuevo@soc.mx', 'ADMIN');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no da accesos';
end $$;

-- 3. Usuario dado de baja y desconocido: no ven nada ni escriben
select pg_temp.as_user('baja@soc.mx') \gset
do $$ begin assert (select count(*) from public.au_records) = 0, 'baja no lee'; end $$;
select pg_temp.as_user('extrano@gmail.com') \gset
do $$ declare ok boolean := false; begin
  assert (select count(*) from public.au_records) = 0, 'extraño no lee';
  begin insert into public.au_records (collection, id, data) values ('projects', 'px', '{"id":"px"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'extraño no escribe';
end $$;

-- 4. Integridad: id del documento debe coincidir
select pg_temp.as_user('admin@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('projects', 'p9', '{"id":"otro"}');
  exception when check_violation then ok := true; end;
  assert ok, 'id incongruente rechazado';
end $$;

-- 5. Restaurar respaldo (admin)
do $$ begin
  assert public.au_replace_all('{"areas":[{"id":"a1","nombre":"Diseño"}],"projects":[{"id":"p2","nombre":"Nuevo"}],"desconocida":[{"id":"z"}]}') = 2, 'restaura 2';
  assert (select count(*) from public.au_records) = 2, 'reemplazó todo';
  assert not exists (select 1 from public.au_records where id = 'z'), 'ignora colecciones desconocidas';
end $$;

-- 6. Anónimo sin acceso a tablas
reset role;
set role anon;
do $$ declare ok boolean := false; begin
  begin perform 1 from public.au_records; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon sin acceso';
end $$;
reset role;
select 'RLS OK' as resultado;
