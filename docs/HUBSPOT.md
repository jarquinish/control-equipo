# Publicar Alignment & Unblock en HubSpot

La app se publica como **una página de HubSpot** creada con una **plantilla de código**. Los datos viven en **Supabase**: cuando un gerente carga su Excel o actualiza un proyecto, todos lo ven en línea.

| Pieza | Qué es | Quién |
|---|---|---|
| `alignment-unblock-hubspot.html` | La app completa en un solo archivo: plantilla de página de HubSpot. | Equipo web (HubSpot) |
| `0001_alignment_unblock.sql` | Tablas y seguridad de la base de datos. | Quien administre Supabase |
| `Plantilla_Inventario_Alignment_Unblock.xlsx` | Formato para que cada área cargue sus proyectos. | Gerentes |

> **No subas el .html al Administrador de archivos (Files).** HubSpot sirve los .html de *Files* como texto plano en su dominio y la app no abriría. Va en el **Design Manager** como plantilla.

Tiempo estimado: 45–60 min la primera vez.

---

## 1. Base de datos (Supabase)

1. <https://supabase.com> → **New project** → nombre `alignment-unblock`, región *East US* (o la más cercana). Guarda la contraseña.
2. **SQL Editor → New query** → pega todo `0001_alignment_unblock.sql` → **Run**.
3. Nueva consulta, con el correo de quien administrará la herramienta → **Run**:

   ```sql
   insert into public.au_members (email, rol) values ('correo-admin@socasesores.com.mx', 'ADMIN')
   on conflict (email) do update set rol = 'ADMIN', activo = true;
   ```

4. **Authentication → Providers → Email**: habilitado.
5. **Authentication → Email Templates → Magic Link**: que el correo incluya el código:

   ```html
   <h2>Alignment & Unblock</h2>
   <p>Tu código de acceso es: <strong style="font-size:22px">{{ .Token }}</strong></p>
   ```

6. **Authentication → SMTP Settings**: configura el SMTP de Microsoft 365 (el correo incluido en Supabase sólo envía unos pocos correos por hora).
7. **Project Settings → API**: copia **Project URL** y **anon public key** (la *anon key* es pública por diseño; la seguridad la aplica la base de datos con reglas por rol). **Nunca** uses la *service_role key*.

## 2. Plantilla en HubSpot (Design Manager)

1. HubSpot → **Marketing → Archivos y plantillas → Herramientas de diseño** (*Design Manager*).
2. **Archivo → Nuevo archivo → HTML + HubL** → tipo **Plantilla** → **Página** → nombre `alignment-unblock` → **Crear**.
3. Borra el contenido de ejemplo y **pega completo** `alignment-unblock-hubspot.html`.
4. Al inicio del archivo, en el bloque `AU_CONFIG`, escribe los dos valores del paso 1.7:

   ```js
   window.AU_CONFIG = {
     supabaseUrl: "https://xxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi…",
     microsoft: false
   };
   ```

5. **Publicar cambios**.

> Si el editor tarda o rechaza el archivo por tamaño (≈ 0.9 MB), súbelo con la **HubSpot CLI**: `hs upload alignment-unblock-hubspot.html <carpeta-del-tema>/alignment-unblock.html`.

## 3. Página

1. **Marketing → Sitio web → Páginas del sitio web → Crear** → elige la plantilla **Alignment & Unblock**.
2. URL sugerida: `https://<dominio-SOC>/alignment` · título: *Alignment & Unblock*.
3. **Publicar**. La plantilla ya pide a los buscadores no indexarla (`noindex`). Si su plan de HubSpot tiene *contenido privado / membresías*, pueden restringir además la página a personal de SOC.
4. Copia la URL publicada y vuelve a Supabase: **Authentication → URL Configuration** → *Site URL* y *Redirect URLs* = esa URL.

## Acceso con contraseña (sin enviar correos)

Mientras no haya SMTP (Resend), se entra con **correo y contraseña** y no se envía ningún correo. En la plantilla deja `emailCode: false` (así viene).

1. Supabase → **Authentication → Users → Add user → Create new user**: correo, contraseña y marca **Auto Confirm User** → **Create user**. Repite por cada persona y comparte la contraseña por un canal privado.
2. Esa persona debe estar dada de alta en `au_members` (el administrador, con el SQL del paso 1; los demás, desde **Configuración → Accesos** en la herramienta). La cuenta sola no da acceso.
3. Cuando Resend esté listo: plantilla con `{{ .Token }}`, `emailCode: true` y publica. Desde entonces también se podrá entrar con código.

## 4. Primer ingreso

1. Abre la página → correo y contraseña de administrador (o código por correo si `emailCode: true`) → **Entrar**. El primer ingreso crea las 4 áreas y la semana actual.
2. **Configuración → Accesos**: agrega el correo de cada gerente con rol **Gerente** (y colaboradores si aplica).
3. Cada gerente entra con su correo y usa **Actualizar mi área → Importar Excel de su área** (o el registro de su área en la Sesión 1). La carga queda guardada en Supabase y se refleja en el dashboard de todos.

## Actualizar a una versión nueva

Design Manager → abre `alignment-unblock` → copia tu bloque `AU_CONFIG` → pega el nuevo archivo completo → vuelve a poner tu bloque `AU_CONFIG` → **Publicar cambios**. Los datos no se tocan (están en Supabase). Si la versión trae un nuevo `.sql`, ejecútalo en Supabase antes (se puede ejecutar varias veces sin perder información).

## Si algo no funciona

| Síntoma | Causa probable |
|---|---|
| «Falta conectar la base de datos» | `AU_CONFIG` vacío o con espacios/comillas de más. |
| Se ve el código fuente en lugar de la app | Se subió a *Files* en vez del Design Manager. |
| «Tu correo aún no tiene acceso» | Falta darlo de alta en **Configuración → Accesos**. |
| No llega el código | SMTP sin configurar o el correo en cuarentena; revisar paso 1.6. |
| Error al conectar | El dominio tiene una política de seguridad (CSP) que bloquea `*.supabase.co`; agrégalo a `connect-src`. |

Cómo se generó: `npm run build:hubspot` → `dist-hubspot/alignment-unblock-hubspot.html` (un solo archivo, rutas con `#`, el código de la app dentro de `{% raw %}` para que HubL no lo procese). Prueba automática: `npm run test:e2e:hubspot` (simula la página de HubSpot contra una base tipo Supabase local: inicio de sesión, importación de Excel por dos usuarios y datos compartidos).
