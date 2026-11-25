# RoomieHub

**Tres personas. Un hogar. Todo organizado.**

RoomieHub es una aplicación web progresiva (PWA) para administrar un apartamento compartido entre tres roomies: turnos de tareas con rotación semanal automática, gastos divididos en partes iguales con saldos y liquidaciones, calendario, lista de mercado, reportes de daños con fotos, estadísticas e historial de actividad. Está pensada primero para Android (se instala desde Chrome), y funciona también en escritorio y otros navegadores. Interfaz en español e inglés, moneda predeterminada COP.

## Funcionalidades

| Módulo | Qué incluye |
|---|---|
| Inicio (dashboard) | Mis tareas de la semana, progreso del hogar, gastos del mes y mi parte, mi saldo, próximos eventos (14 días), compras pendientes, incidencias abiertas, actividad reciente, accesos rápidos |
| Tareas | Crear/editar/pausar/eliminar tareas, categorías, frecuencia (diaria, 2×semana, semanal, quincenal, cada 4 semanas), día límite, esfuerzo 1–5, rotación semanal automática y justa, orden de rotación editable, generar semana, reiniciar rotación, intercambio de turnos, omitir turno, detección de repeticiones, carga por integrante, historial |
| Finanzas | Gastos con pagador, categoría, fecha y participantes; división exacta en enteros con reparto de residuos; saldos por integrante; pagos sugeridos para quedar a paz y salvo; registro de pagos entre roomies (separados de los gastos); filtro por mes |
| Calendario | Vista mensual y semanal, eventos/pagos/recordatorios/mantenimiento, recurrencia semanal o mensual, eventos privados, tareas del hogar en el calendario, avisos en el dispositivo mientras la app está abierta |
| Mercado | Productos con cantidad, unidad, categoría, responsable y precio estimado; agregado rápido; marcar comprado; historial; volver a comprar |
| Estadísticas | Gastos por mes, por categoría, participación individual (pagó vs. le correspondía), cumplimiento de tareas, actividad histórica. Solo con datos reales |
| Daños | Reportes con descripción, ubicación, prioridad, estado, responsable, hasta 6 fotos (comprimidas, sin EXIF), gastos de reparación vinculados, historial de cambios |
| Ajustes | Perfil y color, tema claro/oscuro/sistema, idioma, apartamento, integrantes (quitar, transferir administración), invitaciones por código o enlace, categorías, cambio de contraseña, salir o eliminar el apartamento |

## Tecnologías

React 19 · TypeScript (estricto) · Vite 8 · Tailwind CSS 4 · React Router 8 · Supabase (Auth, PostgreSQL, Storage, Realtime) · Row Level Security · React Hook Form + Zod 4 · i18next · Lucide · vite-plugin-pwa (Workbox) · Vitest + Testing Library · PGlite (PostgreSQL real en proceso para probar las migraciones) · Playwright · Vercel.

## Puesta en marcha local

Requisitos: Node.js 20 o superior (probado con Node 24).

```bash
npm install
cp .env.example .env.local     # en Windows: copy .env.example .env.local
npm run dev                    # http://localhost:5173
```

**Sin credenciales de Supabase** la app arranca en **modo demostración**: un hogar ficticio con tres roomies («Valentina (demo)», «Mateo (demo)», «Sofía (demo)») guardado solo en el `localStorage` de tu navegador. Sirve para probar todo sin crear cuentas. Los datos demo nunca se envían a Supabase.

**Con Supabase** (uso real por los tres roomies) completa `.env.local` y aplica las migraciones: ver [docs/SUPABASE.md](docs/SUPABASE.md).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos y build de producción en `dist/` (incluye service worker) |
| `npm run preview` | Sirve el build de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm test` | Todas las pruebas Vitest (unitarias, componentes y base de datos) |
| `npm run test:db` | Solo las pruebas de migraciones, RLS y RPC sobre PostgreSQL (PGlite) |
| `npm run test:e2e` | Playwright en Android (Pixel 7) y escritorio, contra el build de producción. La primera vez: `npx playwright install chromium` |
| `npm run icons` | Regenera los iconos PWA desde `public/favicon.svg` |

## Variables de entorno

Ver [.env.example](.env.example). Solo claves públicas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_ENABLE_DEMO`. **Nunca** pongas la `service_role` key en el cliente.

## Documentación

- [Arquitectura y decisiones técnicas](docs/ARCHITECTURE.md)
- [Modelo de datos y diagrama entidad-relación](docs/DATABASE.md)
- [Configuración de Supabase y migraciones](docs/SUPABASE.md)
- [Despliegue en Vercel](docs/DEPLOYMENT.md)
- [Instalación en Android](docs/ANDROID.md)
- [Guía para incorporar a los tres roomies](docs/ROOMIES.md)

## Estructura

```
src/
  domain/        lógica pura y probada: dinero, rotación, fechas, calendario, estadísticas, esquemas Zod, tipos
  services/      acceso a datos: interfaz Repository + Supabase + demo local, caché offline, errores
  providers/     estado global: auth, apartamento (snapshot + realtime), preferencias, toasts
  hooks/         useHousehold (vistas derivadas), useOnline
  components/    ui/ (botones, campos, hojas modales…), layout/ (shell, navegación, banners), charts/, shared/
  features/      una carpeta por módulo (páginas y formularios)
  i18n/          es.ts / en.ts (con tipado que obliga a tener las mismas claves)
  router/        rutas y guardas
supabase/migrations/   esquema, funciones, RLS, storage y realtime
tests/           unit/, components/, db/ (migraciones sobre PGlite)
e2e/             Playwright
docs/            documentación
```
