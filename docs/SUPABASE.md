# Alignment & Unblock con Supabase (multiusuario)

Con Supabase, la información deja de vivir en un solo navegador: **cada gerente actualiza desde su equipo, Dirección ve todo en vivo** y el acceso se controla por correo y rol.

Tiempo estimado: **30–40 minutos** la primera vez. No requiere programar.

---

## 1. Crear el proyecto

1. Entra a <https://supabase.com> → **New project**.
2. Nombre: `alignment-unblock`. Guarda la contraseña de la base de datos en un lugar seguro.
3. Región: la más cercana disponible (p. ej. *East US*).
4. Plan: el gratuito alcanza para el piloto (ver [Límites](#límites-a-considerar)).

## 2. Crear las tablas y la seguridad

1. En el proyecto: **SQL Editor → New query**.
2. Copia todo el contenido de [`supabase/migrations/0001_alignment_unblock.sql`](../supabase/migrations/0001_alignment_unblock.sql), pégalo y presiona **Run**.
3. En una consulta nueva, date acceso de administrador **con tu correo** y presiona **Run**:

   ```sql
   insert into public.au_members (email, rol) values ('tu-correo@socasesores.com.mx', 'ADMIN')
   on conflict (email) do update set rol = 'ADMIN', activo = true;
   ```

El script se puede volver a ejecutar sin perder información (por ejemplo, al actualizar a una versión nueva).

## 3. Inicio de sesión por código de correo

1. **Authentication → Providers → Email**: debe estar habilitado.
2. **Authentication → Email Templates → Magic Link**: agrega el código para que el correo lo incluya. Ejemplo de cuerpo:

   ```html
   <h2>Alignment & Unblock</h2>
   <p>Tu código de acceso es: <strong style="font-size:22px">{{ .Token }}</strong></p>
   <p>O entra directamente: <a href="{{ .ConfirmationURL }}">abrir Alignment & Unblock</a></p>
   ```

   > El **código** es importante en SOC: Outlook/Defender a veces "abre" los enlaces para revisarlos y los invalida; el código siempre funciona.

3. **Authentication → URL Configuration**: en *Site URL* y *Redirect URLs* pon la dirección donde publicarás la app (paso 5), p. ej. `https://alignment-soc.netlify.app`.
4. **Correo saliente (recomendado antes de invitar al equipo)**: el servidor de correo incluido en Supabase sólo envía unos pocos correos por hora. En **Authentication → SMTP Settings** configura el SMTP de Microsoft 365 o el que indique TI.

## 4. (Opcional) Entrar con cuenta Microsoft

Requiere que **TI registre una aplicación en Microsoft Entra ID**:

1. Entra ID → App registrations → New registration.
   Redirect URI (Web): `https://TU-PROYECTO.supabase.co/auth/v1/callback`
2. Crear un *client secret*.
3. En Supabase: **Authentication → Providers → Azure**: Client ID, Secret y
   *Azure Tenant URL* = `https://login.microsoftonline.com/<ID-del-tenant-de-SOC>`.
4. Al publicar, agrega la variable `VITE_SUPABASE_MICROSOFT=true`.

Aunque se entre con Microsoft, **sólo pueden ingresar los correos dados de alta en Accesos**.

## 5. Publicar la app

Copia de **Project Settings → API**: *Project URL* y *anon public key* (es pública por diseño; la seguridad la aplica el servidor).

**Netlify conectado a GitHub** (se actualiza solo con cada cambio):

1. Netlify → **Add new site → Import an existing project → GitHub** → repositorio `control-equipo`.
2. Rama: la que contiene esta versión. El archivo `netlify.toml` ya define cómo compilar.
3. **Environment variables**:

   | Variable | Valor |
   |---|---|
   | `VITE_STORAGE` | `supabase` |
   | `VITE_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | la *anon public key* |
   | `VITE_SUPABASE_MICROSOFT` | `true` sólo si hiciste el paso 4 |

4. **Deploy**. Copia la URL resultante al paso 3.3.

## 6. Primer ingreso y migración del piloto

1. Abre la URL, escribe tu correo, recibe el código y entra.
   Como administrador, tu primer ingreso **inicializa el espacio** (4 áreas y semana actual).
2. Si ya trabajaste el piloto en un navegador: en esa versión, **Configuración → Generar respaldo**; luego, en la versión con Supabase, **Configuración → Restaurar respaldo**. Se sube todo: proyectos, historial, compromisos.
3. **Configuración → Accesos**: agrega el correo de cada gerente con rol **Gerente** (y colaboradores si aplica). Opcionalmente vincúlalo a su persona del directorio; si no, se vincula por correo.

Listo: cada quien entra con su correo y los cambios aparecen en tiempo real para todos.

---

## Roles

| Puede… | Admin | Dirección | Gerente | Colaborador |
|---|:-:|:-:|:-:|:-:|
| Ver todo el espacio | ✓ | ✓ | ✓ | ✓ |
| Proyectos, bloqueos, compromisos, Weekly | ✓ | ✓ | ✓ | ✓* |
| Ajustar prioridad (override), abrir semana | ✓ | ✓ | — | — |
| Áreas y configuración | ✓ | ✓ | — | — |
| Accesos, restaurar respaldo, borrar todo | ✓ | ✓ | — | — |

\* La interfaz orienta al colaborador a gestionar compromisos.

**Qué impone el servidor (RLS) y qué la interfaz:** áreas, configuración (incluida la semana activa, por lo que *abrir semana*), accesos, restaurar y borrar los **rechaza el servidor** si el rol no corresponde. El ajuste de prioridad por Dirección lo controla la interfaz (un gerente no ve el botón habilitado), porque vive dentro del registro del proyecto que los gerentes sí pueden editar.

## Cómo funciona por dentro

- `au_records`: una fila por entidad (`collection`, `id`, `data` JSON), con `updated_by` y `updated_at` automáticos (auditoría).
- `au_members`: correos con acceso y rol.
- RLS: sólo miembros activos leen/escriben; áreas, configuración y accesos sólo Admin/Dirección; restaurar (`au_replace_all`) y borrar (`au_clear`) sólo Admin/Dirección.
- Tiempo real: `au_records` está en la publicación `supabase_realtime`; cada pestaña ignora el eco de sus propios cambios.
- Vistas para reportes: `au_projects_v`, `au_commitments_v`, `au_blocks_v` (columnas tipadas, respetan la RLS) — útiles para Power BI.
- Si el servidor rechaza un cambio (p. ej. por rol), la app avisa y vuelve a cargar la versión del servidor.

## Límites a considerar

- **Plan gratuito**: los proyectos se pausan tras ~1 semana sin actividad (con uso semanal no ocurre) y no incluye respaldos automáticos con restauración a un punto en el tiempo. Sigue generando respaldos desde la app (Configuración → Generar respaldo) después de cada Weekly, o usa un plan de pago.
- **Edición simultánea del mismo registro**: gana el último cambio guardado (no hay fusión campo por campo).
- **Sin conexión**: la app necesita internet en modo Supabase.
- La demo (Configuración → Cargar datos demo) sigue siendo local y nunca toca el espacio compartido.

## Pruebas automáticas de esta integración

En un equipo con PostgreSQL 16 y el binario de [PostgREST](https://github.com/PostgREST/postgrest/releases) (`POSTGREST_BIN=/ruta/postgrest`):

```bash
npm run test:supabase:sql   # esquema + RLS en PostgreSQL real (idempotencia, roles, anónimos, restaurar)
npm run test:supabase       # adaptador real (supabase-js) contra PostgreSQL + PostgREST
npm run test:e2e:supabase   # navegador: código por correo, 2 usuarios con roles, correo sin acceso, cerrar sesión
npm run supabase:local      # deja la pila local corriendo (código de acceso: 123456)
```

La pila local reproduce la base, la API REST y la seguridad de Supabase con un servicio de autenticación simulado. **No** cubre Realtime ni el inicio de sesión con Microsoft: esos dos se validan en el proyecto real de Supabase.
