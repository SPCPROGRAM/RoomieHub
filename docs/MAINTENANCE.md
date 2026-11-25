# Mantenimiento de RoomieHub

Datos del despliegue actual:

| Servicio | Dónde |
|---|---|
| App publicada | https://roomiehub-drab.vercel.app (Vercel, proyecto `roomiehub`, equipo `roomie-hub`) |
| Base de datos, cuentas y fotos | Supabase, proyecto `tsmzvexgtjewrdhnpqxi` |
| Código | Esta carpeta (`Documents/RoomieHub`). **Todavía sin copia en la nube: ver paso 1** |

## 1. Respaldo del código (hacerlo una vez, recomendado)

Hoy el código existe solo en este computador. Para no perderlo:

1. Instala Git: https://git-scm.com/download/win (opciones por defecto).
2. Crea una cuenta en https://github.com y un repositorio **privado** vacío llamado `roomiehub`.
3. En la terminal de VS Code (dentro de `RoomieHub`):
   ```bash
   git init
   git add .
   git commit -m "RoomieHub v1"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/roomiehub.git
   git push -u origin main
   ```
   `.env.local` está excluido por `.gitignore`: tus claves no se suben.
4. Opcional: en Vercel → proyecto `roomiehub` → *Settings → Git* conecta el repositorio. Desde entonces, cada `git push` publica automáticamente.

## 2. Cómo hacer un cambio en la app

1. Pide o haz el cambio en el código.
2. Pruébalo local: `npm run dev` → http://localhost:5173 (usa la base de datos real: cuidado con datos de prueba).
3. Verifica antes de publicar:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```
4. Publica:
   - Con GitHub conectado: `git add . && git commit -m "describe el cambio" && git push`
   - Sin GitHub: `npx vercel --prod`
5. Los celulares mostrarán «Hay una nueva versión» → **Actualizar**.

Si una publicación sale mal: Vercel → proyecto → *Deployments* → en la versión anterior buena, **⋯ → Promote to Production** (vuelve atrás en segundos).

## 3. Cambios en la base de datos

- **Nunca** edites ni vuelvas a ejecutar las migraciones ya aplicadas (`20261124000001…0004` y `setup_all.sql`).
- Cada cambio de estructura va en un archivo **nuevo** en `supabase/migrations/` con fecha posterior, ej. `20261210000001_agrega_campo_x.sql`.
- Pruébalo primero con `npm run test:db` (lo ejecuta en un PostgreSQL local de prueba) y luego pégalo en Supabase → *SQL Editor* → *Run*.
- Mantén RLS activado en toda tabla nueva.

## 4. Copias de seguridad de los datos

El plan gratuito de Supabase no ofrece copias descargables desde el panel. Recomendado una vez al mes:

```bash
npx supabase login
npx supabase link --project-ref tsmzvexgtjewrdhnpqxi
npx supabase db dump --data-only -f backups/datos-AAAA-MM-DD.sql
```

(Pide la contraseña de la base de datos que creaste en Supabase. Guarda los archivos fuera de carpetas públicas; contienen datos personales y financieros del hogar. `backups/` no debe subirse a GitHub: añádelo a `.gitignore`.)

## 5. Revisiones periódicas

| Cada | Qué revisar |
|---|---|
| Semana | Nada obligatorio. Si nadie usa la app 7 días, Supabase gratuito **pausa** el proyecto: entra al panel y pulsa *Restore* |
| Mes | Copia de datos (paso 4). Supabase → *Usage*: límites gratis ~500 MB de base de datos y 1 GB de fotos |
| 3 meses | Actualizaciones: `npm outdated`; actualiza de a pocas, corre las pruebas y publica |
| Si algo falla | Vercel → *Deployments → Logs*; Supabase → *Logs*. Capturas de pantalla del error ayudan a diagnosticar |

## 6. Seguridad

- Nunca compartas: la `service_role`/`secret` key de Supabase, la contraseña de la base de datos ni el archivo `.env.local` (incluye un token de Vercel).
- La `publishable/anon` key y la URL de Supabase sí son públicas por diseño.
- Si una clave secreta se filtra: Supabase → *Settings → API Keys* → rotarla.
- Si un roomie se muda: **Ajustes → Integrantes → Quitar**. Su historial se conserva y deja de ver los datos. Revoca las invitaciones activas que no se usen.
- Para cambiar de roomie: genera una nueva invitación (el cupo es 3).

## 7. Estado conocido / mejoras futuras

- Avisos del calendario solo con la app abierta (push real requiere servidor de notificaciones).
- Sin edición offline (por diseño, para no registrar gastos sin confirmación del servidor).
- Correos de Supabase gratuitos limitados por hora: para más, configurar SMTP propio.
