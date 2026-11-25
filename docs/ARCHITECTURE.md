# Arquitectura

## Visión general

```mermaid
flowchart LR
  subgraph Navegador / Android (PWA)
    UI[Páginas por módulo] --> H[useHousehold]
    H --> AP[ApartmentProvider\nsnapshot + run()]
    AP --> R{{Repository}}
    R --> SR[SupabaseRepository]
    R --> DR[DemoRepository\nlocalStorage]
    AP --> C[(Caché offline\nlocalStorage, solo lectura)]
    SW[Service worker\nWorkbox] -.precache estáticos.-> UI
  end
  SR -->|HTTPS + JWT| PG[(Supabase PostgreSQL\nRLS + RPC + triggers)]
  SR --> ST[(Storage\nmaintenance-photos)]
  PG -->|Realtime| AP
```

- **Dominio puro (`src/domain`)**: todo cálculo importante (división de gastos, saldos, liquidaciones sugeridas, rotación, recurrencias, estadísticas, validaciones) vive en funciones puras sin React ni red, con pruebas unitarias.
- **Repository**: una interfaz única con dos implementaciones. `SupabaseRepository` es el backend real; `DemoRepository` reproduce las mismas reglas en el navegador para el modo demostración. Las páginas no saben cuál se usa.
- **Snapshot por apartamento**: un hogar de 3 personas genera pocos datos, así que el `ApartmentProvider` carga todo el apartamento de una vez (con paginación por encima de 1000 filas), lo deriva en memoria y lo recarga tras cada escritura confirmada o cuando llega un evento Realtime de otro roomie (con *debounce*), o al volver a la pestaña.
- **Escrituras (`run`)**: cada cambio pasa por `run()`, que (1) rechaza si no hay conexión, (2) espera la confirmación del servidor, (3) recarga el snapshot y (4) solo entonces muestra «guardado». No hay actualizaciones optimistas: un gasto nunca se muestra como registrado sin confirmación.

## Seguridad

- La seguridad está en la base de datos, no en el frontend: RLS en todas las tablas, funciones `SECURITY DEFINER` con `search_path` fijo solo donde hace falta (membresía, invitaciones, perfil inicial, triggers de historial).
- **Aislamiento multi-tenant doble**: (1) políticas `is_member(apartment_id)` y (2) claves foráneas **compuestas** `(apartment_id, id)` que impiden referenciar filas de otro apartamento aunque se adivine un UUID, y `(apartment_id, user_id)` hacia `apartment_members` para que solo integrantes puedan ser pagadores, responsables o asignados.
- Privilegios por columna: nadie puede reescribir `created_by` ni `apartment_id` de un gasto, ni los usos de una invitación.
- `activity_logs` solo lo escriben triggers; los clientes no pueden insertar ni modificar historial.
- Invitaciones: código de 10 caracteres (~50 bits) generado con aleatoriedad criptográfica, caducidad (7 días por defecto, máx. 30), número de usos, revocables, y límite de integrantes del apartamento.
- El cliente solo usa la clave pública (`anon`). Las fotos están en un bucket privado y se sirven con URLs firmadas de 1 hora.

## Rotación semanal (decisión clave)

Cada tarea avanza un «ciclo» cada `intervalo` semanas (1 para diaria/2×semana/semanal, 2 quincenal, 4 «mensual»). En el ciclo *k* le toca a `orden[(offset_de_la_tarea + k) mod n]`. Las tareas tienen offsets distintos, así que en una semana se reparten entre personas distintas y, en *n* ciclos, todos hacen todas las tareas el mismo número de veces.

- Los turnos son filas guardadas (`chore_assignments`). Generar una semana **solo inserta lo que falta** (`UNIQUE (chore_id, week_start, occurrence)` + `ON CONFLICT DO NOTHING`), por lo que es idempotente, segura si dos roomies abren la app a la vez y **nunca cambia asignaciones históricas**.
- La semana actual se genera automáticamente al abrir la app (si está activado). También se puede generar manualmente una semana futura.
- «Reiniciar rotación» mueve el ancla a la semana actual y regenera solo los turnos *pendientes* de esa semana; lo ya hecho y las semanas anteriores no cambian.
- Los intercambios cambian el responsable de dos turnos pendientes de la misma semana y conservan `original_assignee_id`.
- La detección de repeticiones avisa si una tarea cae en la misma persona N ciclos seguidos (N configurable).

## Dinero

- Montos en **enteros** (`BIGINT`, pesos COP sin decimales). El formulario acepta `120000`, `120.000` o `$ 120.000` y rechaza decimales.
- División equitativa: `base = total div n`; el residuo `total mod n` se reparte de a 1 a los primeros participantes en orden de ingreso al apartamento. Así las partes **siempre** suman exactamente el total. La misma regla existe en SQL (`split_equally`) y en TypeScript (`splitEqually`), ambas probadas.
- Un *constraint trigger* diferido verifica al cerrar cada transacción que las partes de cada gasto sumen su monto.
- **Pagos entre roomies (`settlements`) no son gastos**: solo mueven saldos, no cuentan en estadísticas de gasto, y así no hay doble conteo.
- Saldo = pagado − su parte + pagos enviados − pagos recibidos. Las sugerencias de liquidación usan un algoritmo voraz (mayor deudor paga a mayor acreedor).

## Offline y PWA

- Workbox precachea la app (HTML, JS, CSS, iconos): la interfaz abre sin conexión.
- Los datos sin conexión salen de una copia **de solo lectura** del último snapshot confirmado por el servidor (por usuario y apartamento, sin códigos de invitación). Se borra al cerrar sesión. Se muestra un aviso con la hora de la última sincronización.
- Sin conexión, las escrituras se bloquean con un mensaje; no hay cola offline, para no mostrar como sincronizado algo (sobre todo financiero) que el servidor no confirmó.
- Las peticiones a Supabase no las cachea el service worker.
- Actualizaciones: cuando hay una versión nueva, la app ofrece «Actualizar» (registro en modo `prompt`).

## Decisiones menores tomadas

| Decisión | Motivo |
|---|---|
| Sin librería de gráficos: SVG/HTML propios | Bundle más ligero; paleta validada para daltonismo en claro y oscuro |
| Sin React Query | El snapshot por apartamento cubre el caso y evita una dependencia |
| «Mensual» de tareas = cada 4 semanas | La rotación trabaja en semanas; mantiene la justicia del ciclo |
| Eliminar una tarea la archiva | Conserva el historial de turnos y completados |
| Integrantes que salen quedan con `left_at` | No se pierde historial financiero ni de tareas |
| Recordatorios mientras la app está abierta | Push en segundo plano requiere un servidor de Web Push (posible mejora con Edge Functions) |
| Moneda por apartamento (COP por defecto) | Sin conversión de divisas |
| Fotos en demo solo en memoria | Evita llenar `localStorage` |
