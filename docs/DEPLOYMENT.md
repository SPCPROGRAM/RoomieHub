# Despliegue en Vercel

El repositorio incluye [`vercel.json`](../vercel.json): build `npm run build`, salida `dist`, reescritura SPA a `index.html`, cabeceras de seguridad, caché inmutable para `/assets/*` y sin caché para `sw.js` (para que las actualizaciones lleguen).

## Pasos

1. Sube el proyecto a un repositorio Git (GitHub, GitLab o Bitbucket).
2. En <https://vercel.com> → *Add New → Project* → importa el repositorio. Vercel detecta Vite.
3. En *Environment Variables* añade (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `VITE_APP_URL` | URL final, ej. `https://roomiehub.vercel.app` |
   | `VITE_ENABLE_DEMO` | `false` si no quieres el botón de demo en producción |

4. *Deploy*. Al terminar, añade la URL en Supabase (*Authentication → URL Configuration*, ver [SUPABASE.md](SUPABASE.md)).

Alternativa por CLI: `npx vercel` (vincular) y `npx vercel --prod`.

## Después de desplegar

- Abre la URL en Chrome Android y verifica que aparece «Instalar app» (requiere HTTPS, que Vercel da por defecto).
- Cada nuevo despliegue genera un service worker nuevo: los teléfonos verán «Hay una nueva versión» y podrán actualizar.
