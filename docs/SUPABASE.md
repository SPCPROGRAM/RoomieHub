# Configuración de Supabase

Necesitas una cuenta gratuita en <https://supabase.com>. Todo lo demás está preparado en el repositorio.

## 1. Crear el proyecto

1. *New project* → elige nombre (ej. `roomiehub`), contraseña de base de datos (guárdala tú; **no** va en la app) y región cercana (ej. `South America (São Paulo)`).
2. En **Project Settings → API** copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** (o *publishable key*) → `VITE_SUPABASE_ANON_KEY`
3. Pégalas en `.env.local` (local) y en las variables de entorno de Vercel (producción).

## 2. Aplicar las migraciones

**Opción A — SQL Editor (sin instalar nada):** en *SQL Editor → New query*, pega y ejecuta **en orden** el contenido de cada archivo de `supabase/migrations/`:

1. `20261124000001_schema.sql`
2. `20261124000002_functions.sql`
3. `20261124000003_rls.sql`
4. `20261124000004_storage_realtime.sql`
5. `20261125000001_grants.sql`

O pega de una vez `supabase/setup_all.sql` (solo en un proyecto nuevo y vacío).

**Opción B — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

No hay datos de ejemplo en las migraciones: la base de producción empieza vacía. Los datos ficticios existen solo en el modo demo del navegador.

## 3. Autenticación

En **Authentication → URL Configuration**:

- **Site URL**: la URL pública de la app (ej. `https://roomiehub.vercel.app`; en local `http://localhost:5173`).
- **Redirect URLs**: añade `https://TU-DOMINIO/login`, `https://TU-DOMINIO/reset-password` y las mismas con `http://localhost:5173`.

En **Authentication → Providers → Email**: deja activo *Email*. Con *Confirm email* activado, cada roomie confirma su correo antes de entrar (recomendado). El servicio de correo incluido de Supabase tiene un límite bajo de envíos por hora; para uso continuo configura un SMTP propio en *Authentication → SMTP Settings*.

## 4. Storage y Realtime

La migración 4 crea el bucket privado `maintenance-photos` (5 MB por archivo, JPEG/PNG/WebP) con políticas que solo permiten a los integrantes del apartamento leer, subir y borrar sus fotos, y añade las tablas a la publicación `supabase_realtime`. Compruébalo en *Storage* y en *Database → Publications*.

## 5. Verificación rápida

1. `npm run dev`, abre la app, regístrate y crea el apartamento.
2. En *Table Editor* deberías ver tu fila en `profiles`, `apartments`, `apartment_members`, `rotation_settings` y categorías por defecto.
3. Sigue [ROOMIES.md](ROOMIES.md) para invitar a los otros dos.

## Seguridad

- Nunca uses la `service_role` key en el frontend ni en Vercel como variable `VITE_*`.
- Todas las tablas tienen RLS activado; las políticas están en `20261124000003_rls.sql`.
