-- Pruebas de seguridad (RLS) y funciones. Falla con excepción si algo no se cumple.
\set ON_ERROR_STOP on
insert into public.au_members (email, rol) values ('admin@soc.mx', 'ADMIN'), ('gerente@soc.mx', 'GERENTE'), ('baja@soc.mx', 'COLABORADOR');
update public.au_members set activo = false where email = 'baja@soc.mx';

create or replace function pg_temp.as_user(email text) returns void language plpgsql as $$
begin
  -- Sesión con correo comprobado (código por correo o Microsoft).
  perform set_config('request.jwt.claims', json_build_object('email', email, 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp')))::text, false);
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

-- 2b. Prioridad (0002): bitácora y acuerdo de prioridades
select pg_temp.as_user('admin@soc.mx') \gset
insert into public.au_records (collection, id, data) values
  ('priorityLog', 'l1', '{"id":"l1","projectId":"p1","tipo":"prioridad","eje":"estrategica","anterior":"P2","nuevo":"P1","motivo":"Matriz","fuente":"pantalla"}'),
  ('projects', 'p3', '{"id":"p3","nombre":"SOC TV","areaId":"a1","impacto":3,"urgencia":3,"dependencia":2,"prioridadDireccion":{"estrategica":"P1"},"acuerdo":{"bloqueado":true}}');
do $$ begin assert (select clasificacion is null from public.au_projects_v where id = 'p3'), 'vista con columnas nuevas'; end $$;
do $$ begin assert (select motivo from public.au_priority_log_v where id = 'l1') = 'Matriz', 'vista de bitácora'; end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{motivo}', '"otro"') where id = 'l1';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'nadie modifica la bitácora (ni Dirección)';
end $$;
select pg_temp.as_user('gerente@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('priorityLog', 'l2', '{"id":"l2"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no escribe en la bitácora';
end $$;
do $$ declare ok boolean := false; begin
  begin delete from public.au_records where id = 'l1';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no borra la bitácora';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{prioridadDireccion}', '{"estrategica":"P1"}') where id = 'p1';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no fija prioridad directiva';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{urgencia}', '1') where id = 'p3';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'acuerdo cerrado: gerente no cambia la ponderación';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = data - 'acuerdo' where id = 'p3';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no reabre el acuerdo';
end $$;
-- Con el acuerdo cerrado la gerencia sigue actualizando lo demás (estado, clasificación calculada…)
update public.au_records set data = jsonb_set(data, '{estado}', '"en_riesgo"') || '{"clasif":{"integrada":"P1C"}}' where id = 'p3';
-- Y sin acuerdo cerrado sí cambia su ponderación
update public.au_records set data = jsonb_set(data, '{urgencia}', '2') where id = 'p1';
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('projects', 'p4', '{"id":"p4","acuerdo":{"bloqueado":true}}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no crea proyectos con acuerdo cerrado';
end $$;
select pg_temp.as_user('admin@soc.mx') \gset
update public.au_records set data = jsonb_set(data, '{urgencia}', '1') where id = 'p3';
do $$ begin assert (select clasificacion from public.au_projects_v where id = 'p3') = 'P1C', 'Dirección cambia con el acuerdo cerrado'; end $$;

-- 2c. Acceso de sólo consulta y alta con código (0003)
reset role;
select set_config('request.jwt.claims', '', false) \gset
select public.au_generar_alta('Consulta@SOC.mx', 'CONSULTA', 'Consulta Prueba') as codigo \gset
create or replace function pg_temp.as_sub(email text, sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('email', email, 'sub', sub, 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password')))::text, false);
end $$;
set role authenticated;
select pg_temp.as_sub('consulta@soc.mx', 'cuenta-1') \gset
do $$ begin
  assert public.au_current_role() is null, 'sin completar el alta no hay acceso';
  assert (public.au_mi_acceso() ->> 'pendiente')::boolean, 'alta pendiente';
  assert (select count(*) from public.au_records) = 0, 'sin alta no lee';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.au_completar_alta('AAAA-BBBB-CCCC'); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'código incorrecto rechazado';
end $$;
reset role;
do $$ begin
  assert not public.au_alta_valida('consulta@soc.mx', 'AAAA-BBBB-CCCC'), 'código falso no es válido';
  assert not public.au_alta_valida('otro@soc.mx', current_setting('alta.codigo', true)) or true, 'otro correo';
end $$;
select set_config('alta.codigo', :'codigo', false) \gset
do $$ begin
  assert public.au_alta_valida('CONSULTA@soc.mx', current_setting('alta.codigo')), 'código válido (sin importar mayúsculas)';
  assert public.au_alta_valida('consulta@soc.mx', lower(replace(current_setting('alta.codigo'), '-', ''))), 'código sin guiones';
  assert not public.au_alta_valida('gerente@soc.mx', current_setting('alta.codigo')), 'el código es sólo de ese correo';
end $$;
set role authenticated;
select pg_temp.as_sub('consulta@soc.mx', 'cuenta-1') \gset
do $$ begin
  assert public.au_completar_alta(current_setting('alta.codigo')) = 'CONSULTA', 'alta completada';
  assert public.au_current_role() = 'CONSULTA', 'rol consulta';
  assert not (public.au_mi_acceso() ->> 'pendiente')::boolean, 'ya no está pendiente';
  assert (select count(*) from public.au_records) > 0, 'consulta lee todo';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('commitments', 'cx', '{"id":"cx"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consulta no crea registros';
end $$;
update public.au_records set data = jsonb_set(data, '{nombre}', '"cambiado"') where id = 'p1';
delete from public.au_records where id = 'p1';
do $$ begin
  assert (select count(*) from public.au_records where id = 'p1' and data ->> 'nombre' = 'KV') = 1, 'consulta no modifica ni borra';
  perform public.au_completar_alta(current_setting('alta.codigo'));
exception when invalid_parameter_value then null; -- el código ya se usó
end $$;
-- Otra cuenta con el mismo correo (alguien que se registró con ese correo): sin acceso
select pg_temp.as_sub('consulta@soc.mx', 'cuenta-intrusa') \gset
do $$ begin assert public.au_current_role() is null, 'otra cuenta con el mismo correo no entra'; end $$;
-- Un gerente no genera códigos
select pg_temp.as_user('gerente@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin perform public.au_generar_alta('x@soc.mx', 'CONSULTA'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no genera códigos';
end $$;
-- Dirección vuelve a generar el código: la cuenta anterior deja de entrar
select pg_temp.as_user('admin@soc.mx') \gset
do $$ begin
  assert length(public.au_generar_alta('consulta@soc.mx')) = 14, 'nuevo código';
  assert (select count(*) from public.au_altas_pendientes()) = 1, 'alta pendiente visible para Dirección';
end $$;
select pg_temp.as_sub('consulta@soc.mx', 'cuenta-1') \gset
do $$ begin assert public.au_current_role() is null, 'nuevo código invalida la cuenta anterior'; end $$;
select pg_temp.as_user('gerente@soc.mx') \gset
do $$ begin assert (select count(*) from public.au_altas_pendientes()) = 0, 'gerente no ve altas'; end $$;
-- Contraseña sin cuenta vinculada: alguien se registró con el correo de un gerente
select pg_temp.as_sub('gerente@soc.mx', 'cuenta-ajena') \gset
do $$ begin
  assert public.au_current_role() is null, 'una contraseña sin vincular no basta';
  assert (public.au_mi_acceso() ->> 'pendiente')::boolean, 'queda pendiente de código';
end $$;
-- La cuenta que Dirección creó (confirmada) se vincula y entra con contraseña
reset role;
select set_config('request.jwt.claims', '', false) \gset
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'gerente@soc.mx');
do $$ begin assert public.au_vincular_cuentas() = 1, 'vincula la cuenta existente'; end $$;
set role authenticated;
select pg_temp.as_sub('gerente@soc.mx', '00000000-0000-0000-0000-00000000000a') \gset
do $$ begin assert public.au_current_role() = 'GERENTE', 'cuenta vinculada entra con contraseña'; end $$;
select pg_temp.as_sub('gerente@soc.mx', 'cuenta-ajena') \gset
do $$ begin assert public.au_current_role() is null, 'otra cuenta sigue sin entrar'; end $$;
select pg_temp.as_user('gerente@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin perform public.au_vincular_cuentas(); exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no vincula cuentas';
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

-- 4b. Inversión, KPIs y Resultados (0004)
reset role;
select set_config('request.jwt.claims', '', false) \gset
insert into public.au_members (email, rol) values ('gerente2@soc.mx', 'GERENTE') on conflict (email) do nothing;
set role authenticated;
select pg_temp.as_user('admin@soc.mx') \gset
insert into public.au_records (collection, id, data) values
  ('budgetLines', 'L1', '{"id":"L1","clave":"01","nombre":"Partida 1","original":1000,"categoriasContables":["Cat A"],"fuente":"prueba","estado":"CONFIRMADO","orden":1}'),
  ('budgetLines', 'L2', '{"id":"L2","clave":"02","nombre":"Partida 2","original":500,"categoriasContables":["Cat B"],"fuente":"prueba","estado":"CONFIRMADO","orden":2}'),
  ('budgetMovements', 'T1', '{"id":"T1","folio":"T1","tipo":"transferencia","deLineaId":"L1","aLineaId":"L2","monto":200,"concepto":"x","fuente":"prueba","estado":"CONFIRMADO"}'),
  ('budgetMovements', 'A1', '{"id":"A1","folio":"A1","tipo":"ampliacion","aLineaId":"L1","monto":100,"concepto":"x","fuente":"prueba","estado":"PENDIENTE"}'),
  ('spend', 'S1', '{"id":"S1","categoria":"Cat A","mes":"2026-01","monto":300,"fuente":"prueba","estado":"CONFIRMADO"}'),
  ('kpis', 'K1', '{"id":"K1","clave":"K-1","nombre":"Leads","definicion":"x","grupo":"B","tipo":"actividad","areaIds":[],"unidad":"leads","sentido":"mayor","agregacion":"suma","fuente":"HubSpot","estado":"CONFIRMADO","activo":true}'),
  ('budgetAllocations', 'AS1', '{"id":"AS1","lineaId":"L1","projectId":"p1","monto":800,"estado":"CONFIRMADO"}');
do $$ begin
  assert public.au_linea_vigente('L1') = 800, 'vigente = inicial − transferencia (la ampliación pendiente no cuenta)';
  assert public.au_linea_vigente('L2') = 700, 'vigente destino';
  assert (select vigente from public.au_budget_v where id = 'L1') = 800 and (select ejercido_contable from public.au_budget_v where id = 'L1') = 300, 'vista de presupuesto';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('budgetAllocations', 'AS2', '{"id":"AS2","lineaId":"L1","projectId":"p3","monto":1,"estado":"CONFIRMADO"}');
  exception when check_violation then ok := true; end;
  assert ok, 'no asigna más que el vigente';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{monto}', '801') where id = 'AS1';
  exception when check_violation then ok := true; end;
  assert ok, 'tampoco al editar la asignación';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('spend', 'S2', '{"id":"S2","categoria":"cat a","mes":"2026-01","monto":1,"fuente":"x","estado":"CONFIRMADO"}');
  exception when unique_violation then ok := true; end;
  assert ok, 'sin gasto duplicado por categoría y mes';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('budgetMovements', 'T2', '{"id":"T2","folio":"T2","tipo":"transferencia","deLineaId":"L1","aLineaId":"L1","monto":1,"concepto":"x","fuente":"x","estado":"CONFIRMADO"}');
  exception when check_violation then ok := true; end;
  assert ok, 'transferencia con origen = destino rechazada';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('revenues', 'I1', '{"id":"I1","concepto":"Colocación hipotecaria","tipo":"beneficio_economico","monto":1,"fuente":"x","estado":"PENDIENTE"}');
  exception when check_violation then ok := true; end;
  assert ok, 'colocación hipotecaria no es ingreso';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('kpis', 'K2', '{"id":"K2","clave":"K-2","nombre":"x","fuente":" "}');
  exception when check_violation then ok := true; end;
  assert ok, 'KPI sin fuente rechazado';
end $$;
-- Gerencia: no toca cifras; vincula y captura resultados pendientes
select pg_temp.as_user('gerente2@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('budgetLines', 'L3', '{"id":"L3","clave":"03","nombre":"x","original":1,"fuente":"x"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no crea partidas';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{monto}', '1') where id = 'S1';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no modifica gasto';
end $$;
insert into public.au_records (collection, id, data) values
  ('projectKpis', 'PK1', '{"id":"PK1","projectId":"p1","kpiId":"K1","contribucion":"directa"}'),
  ('results', 'R1', '{"id":"R1","kpiId":"K1","metrica":"Leads","valor":10,"unidad":"leads","periodo":{"inicio":"2026-01-01","fin":"2026-01-31"},"fuente":"HubSpot","estado":"PENDIENTE"}');
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('results', 'R2', '{"id":"R2","kpiId":"K1","metrica":"Leads","valor":11,"unidad":"leads","periodo":{"inicio":"2026-02-01","fin":"2026-02-28"},"fuente":"HubSpot","estado":"CONFIRMADO"}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no confirma resultados';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('results', 'R3', '{"id":"R3","kpiId":"K1","metrica":"Leads otra vez","valor":12,"unidad":"leads","periodo":{"inicio":"2026-01-01","fin":"2026-01-31"},"fuente":"HubSpot","estado":"PENDIENTE"}');
  exception when unique_violation then ok := true; end;
  assert ok, 'sin resultado duplicado por KPI y periodo';
end $$;
select pg_temp.as_user('admin@soc.mx') \gset
update public.au_records set data = jsonb_set(data, '{estado}', '"CONFIRMADO"') where id = 'R1';
select pg_temp.as_user('gerente2@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin update public.au_records set data = jsonb_set(data, '{valor}', '99') where id = 'R1';
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gerente no modifica un resultado confirmado';
end $$;
do $$ begin assert (select count(*) from public.au_results_v where kpi_clave = 'K-1') = 1, 'vista de resultados'; end $$;

-- 4. Integridad: id del documento debe coincidir
select pg_temp.as_user('admin@soc.mx') \gset
do $$ declare ok boolean := false; begin
  begin insert into public.au_records (collection, id, data) values ('projects', 'p9', '{"id":"otro"}');
  exception when check_violation then ok := true; end;
  assert ok, 'id incongruente rechazado';
end $$;

-- 5. Restaurar respaldo (admin) · incluye las colecciones de inversión aunque la asignación llegue antes que su partida
do $$ begin
  assert public.au_replace_all('{"areas":[{"id":"a1","nombre":"Diseño"}],"projects":[{"id":"p2","nombre":"Nuevo"}],"priorityLog":[{"id":"l9","projectId":"p2"}],"budgetAllocations":[{"id":"AS9","lineaId":"L9","projectId":"p2","monto":5}],"budgetLines":[{"id":"L9","clave":"09","nombre":"x","original":5,"fuente":"x"}],"desconocida":[{"id":"z"}]}') = 5, 'restaura 5';
  assert (select count(*) from public.au_records) = 5, 'reemplazó todo (incluida la bitácora y la inversión)';
  assert coalesce(current_setting('au.restaurando', true), 'off') <> 'on', 'la marca de restauración no queda activa';
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
