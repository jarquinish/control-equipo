# Publicar Alignment & Unblock en HubSpot

La app se publica como **una página de HubSpot** creada con una **plantilla de código**. Los datos viven en **Supabase**: cuando un gerente carga su Excel o actualiza un proyecto, todos lo ven en línea.

| Pieza | Qué es | Quién |
|---|---|---|
| `alignment-unblock-hubspot.html` | La app completa en un solo archivo: plantilla de página de HubSpot. | Equipo web (HubSpot) |
| `0001_alignment_unblock.sql` | Tablas y seguridad de la base de datos. | Quien administre Supabase |
| `0002_prioridad_dos_ejes.sql` | Prioridad en dos ejes: bitácora inalterable y acuerdo de prioridades protegido en el servidor. | Quien administre Supabase |
| `0003_acceso_consulta.sql` | Rol **Consulta** (sólo lectura) y alta con código: cada persona crea su propia contraseña. | Quien administre Supabase |
| `0004_inversion_kpis_resultados.sql` | Módulo **Inversión, KPIs y Resultados**: colecciones, permisos financieros e integridad en el servidor. | Quien administre Supabase |
| `paquete-inversion-*.json` | Presupuesto, gasto contable, catálogo de KPIs y resultados validados (se carga desde la herramienta; no va en el repositorio). | Dirección |
| `Plantilla_Inventario_Alignment_Unblock.xlsx` | Formato para que cada área cargue sus proyectos. | Gerentes |

> **No subas el .html al Administrador de archivos (Files).** HubSpot sirve los .html de *Files* como texto plano en su dominio y la app no abriría. Va en el **Design Manager** como plantilla.

Tiempo estimado: 45–60 min la primera vez.

---

## 1. Base de datos (Supabase)

1. <https://supabase.com> → **New project** → nombre `alignment-unblock`, región *East US* (o la más cercana). Guarda la contraseña.
2. **SQL Editor → New query** → pega todo `0001_alignment_unblock.sql` → **Run**. Después, en otra consulta, `0002_prioridad_dos_ejes.sql` → **Run**, luego `0003_acceso_consulta.sql` → **Run** y luego `0004_inversion_kpis_resultados.sql` → **Run**.
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

**Cada persona crea su propia contraseña con un código de alta** (requiere `0003_acceso_consulta.sql`):

1. Supabase → **Authentication → Sign In / Providers → Email**: **Allow new users to sign up** activado y **Confirm email** desactivado → **Save**. Es seguro: una cuenta nueva no da acceso si su correo no está en Accesos, y un correo con acceso sólo se activa con su código.
2. En la herramienta, **Configuración → Accesos** → correo y rol → **Dar acceso**. Aparece su **código de alta** (`XXXX-XXXX-XXXX`, vence en 30 días). Para varias personas a la vez, en el SQL Editor:

   ```sql
   select n.nombre, n.email, public.au_generar_alta(n.email, 'CONSULTA', n.nombre) as codigo
   from (values ('Nombre Apellido', 'correo@socasesores.com.mx')) as n(nombre, email);
   ```

3. Entrega a cada quien su código por un canal privado. La persona abre la página → **Primera vez: crear mi contraseña** → correo, código y su contraseña (mínimo 8 caracteres) → entra. La contraseña la guarda Supabase; nadie más la conoce.
4. ¿Olvidó su contraseña? **Accesos → Código** en su fila: el código nuevo invalida la contraseña anterior y la persona crea otra.

Las cuentas creadas antes a mano (**Authentication → Users → Add user**) siguen funcionando: `0003` las vincula a su correo. Si después creas otra a mano, ejecuta `select public.au_vincular_cuentas();`.

Cuando Resend esté listo: plantilla con `{{ .Token }}`, `emailCode: true` y publica. Desde entonces también se podrá entrar con código por correo.

## 4. Primer ingreso

1. Abre la página → correo y contraseña de administrador (o código por correo si `emailCode: true`) → **Entrar**. El primer ingreso crea las 4 áreas y la semana actual.
2. **Configuración → Accesos**: agrega el correo de cada gerente con rol **Gerente** (colaboradores y personas de **Consulta** si aplica) y entrégale su código de alta.
3. Cada gerente entra con su correo y usa **Actualizar mi área → Importar Excel de su área** (o el registro de su área en la Sesión 1). La carga queda guardada en Supabase y se refleja en el dashboard de todos.

## Actualizar a una versión nueva

**Primero la base, después la plantilla.** Si la versión trae un `.sql` nuevo (p. ej. `0002_prioridad_dos_ejes.sql`), ejecútalo en Supabase → SQL Editor **antes** de publicar la plantilla: sin él, la versión nueva no puede guardar la bitácora de prioridades.

Design Manager → abre `alignment-unblock` → copia tu bloque `AU_CONFIG` → pega el nuevo archivo completo → vuelve a poner tu bloque `AU_CONFIG` → **Publicar cambios**. Los datos no se tocan (están en Supabase). Los `.sql` se pueden ejecutar varias veces sin perder información. La primera vez que Dirección entra a la versión nueva, los ajustes del modelo anterior quedan como *nota por revalidar* y se calcula la clasificación de todos los proyectos.

## Inversión, KPIs y Resultados (primer uso)

Después de publicar la versión con el módulo (y de ejecutar `0004`), Dirección entra → **Inversión y KPIs** → **Datos y configuración** → **Elegir paquete** → revisa discrepancias y gerencias → **Agregar**. Sólo agrega registros; no toca proyectos ni prioridades. Cada mes: **Actualizar gasto contable** con el Excel del ejercicio (hoja RESUMEN). Detalle en [INVERSION_KPIS.md](INVERSION_KPIS.md).

## Si algo no funciona

| Síntoma | Causa probable |
|---|---|
| «Falta conectar la base de datos» | `AU_CONFIG` vacío o con espacios/comillas de más. |
| Se ve el código fuente en lugar de la app | Se subió a *Files* en vez del Design Manager. |
| «Tu correo aún no tiene acceso» | Falta darlo de alta en **Configuración → Accesos**. |
| «Completa tu alta» al entrar | La persona tiene acceso pero aún no usa su código: que lo escriba ahí, o genérale uno nuevo en **Accesos → Código**. |
| «El código no corresponde a ese correo o ya expiró» | Código mal escrito, de otro correo, ya usado o vencido (30 días): genera uno nuevo. |
| «El registro está desactivado» / «pidió confirmar el correo» | Revisa el paso 1 de *Acceso con contraseña* (sign up activado, Confirm email desactivado) y genera un código nuevo. |
| No llega el código | SMTP sin configurar o el correo en cuarentena; revisar paso 1.6. |
| «Tu rol no permite guardar este cambio» al validar prioridades | Falta ejecutar `0002_prioridad_dos_ejes.sql`, o la persona no tiene rol Dirección/Administrador. |
| «Tu rol no permite guardar este cambio» en Inversión y KPIs | Falta ejecutar `0004_inversion_kpis_resultados.sql`, o la persona no es Dirección/Administrador (las cifras financieras, KPIs y metas son sólo de Dirección). |
| Error al conectar | El dominio tiene una política de seguridad (CSP) que bloquea `*.supabase.co`; agrégalo a `connect-src`. |

Cómo se generó: `npm run build:hubspot` → `dist-hubspot/alignment-unblock-hubspot.html` (un solo archivo, rutas con `#`, el código de la app dentro de `{% raw %}` para que HubL no lo procese). Prueba automática: `npm run test:e2e:hubspot` (simula la página de HubSpot contra una base tipo Supabase local: inicio de sesión, importación de Excel por dos usuarios y datos compartidos).
