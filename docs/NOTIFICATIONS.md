# Notificaciones push

| Aviso | Cuándo | A quién |
|---|---|---|
| Resumen diario | 7:00 a. m. (Bogotá) | Quien tenga tareas que vencen hoy o atrasadas (últimos 6 días). Si no hay nada, no llega nada |
| Recordatorio de la noche | 8:00 p. m. | Quien tenga una tarea que vence hoy y sigue pendiente |
| Nuevo daño | Al crear el reporte | Los demás integrantes (no quien lo reportó) |

Cada persona activa las notificaciones **en cada dispositivo** (Ajustes → Notificaciones) y elige qué avisos recibir.

## Piezas

- `public/push-sw.js`: el service worker muestra el aviso y abre la app al tocarlo.
- `supabase/migrations/20261126000001_notifications.sql`: suscripciones por dispositivo, preferencias en `profiles`, registro anti-duplicados `notification_deliveries`, trigger de daños (pg_net) y tareas programadas (pg_cron).
- `supabase/functions/notify/`: Edge Function que arma y envía los avisos (`logic.ts` está probado con Vitest).
- Secretos (no están en el repositorio):
  - `supabase/.env.notify.local`: claves VAPID y `CRON_SECRET` → se cargan con `supabase secrets set`.
  - `supabase/notifications_setup.local.sql`: la migración + los secretos en Supabase Vault.
  - `VITE_VAPID_PUBLIC_KEY` (pública) en `.env.local` y en Vercel.

## Puesta en marcha (una vez)

1. Supabase → SQL Editor: pegar y ejecutar `supabase/notifications_setup.local.sql`.
2. `npx supabase login`
3. Cargar secretos y publicar la función:
   ```bash
   npx supabase secrets set --env-file supabase/.env.notify.local --project-ref tsmzvexgtjewrdhnpqxi
   npx supabase functions deploy notify --no-verify-jwt --use-api --project-ref tsmzvexgtjewrdhnpqxi
   ```
   (`--no-verify-jwt`: la función valida por su cuenta el token del usuario o el secreto interno.)
4. Publicar la app: `npx vercel --prod`.

## Comprobar

- En la app: Ajustes → Notificaciones → *Activar en este dispositivo* (llega una de prueba).
- Supabase → Edge Functions → notify → *Logs*; Database → Cron Jobs (`roomiehub-daily`, `roomiehub-due`).

## Cambiar horarios

Las horas están en UTC (Colombia = UTC−5). Ejemplo para el resumen a las 6:30 a. m.:
```sql
select cron.alter_job((select jobid from cron.job where jobname = 'roomiehub-daily'), schedule := '30 11 * * *');
```
