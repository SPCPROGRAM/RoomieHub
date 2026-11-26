/**
 * Release notes shown in "Información de la app → ¿Qué hay de nuevo?".
 * Add new versions at the TOP; the first entry is the current app version.
 */
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  channel: 'beta' | 'stable';
  changes: { es: string[]; en: string[] };
}

export const CREDITS = {
  author: 'Skain_Dev',
  realName: 'Sebastian Prieto',
  github: 'https://github.com/SPCPROGRAM',
  coDeveloper: 'Claude (Anthropic)',
};

export const CHANGELOG: Release[] = [
  {
    version: '0.3.1',
    date: '2026-11-26',
    channel: 'beta',
    changes: {
      es: [
        'Eliminar tareas ahora sí las quita: si nunca se completó (por ejemplo, creada por error) se borra del todo con sus turnos; si tiene historial, desaparece de la semana y lo hecho queda en Historial.',
        'Los turnos de tareas eliminadas ya no aparecen en la semana, el inicio ni el calendario.',
        'Los turnos omitidos se marcan claramente como «Omitida» también en el celular.',
        'Créditos: Sebastian Prieto (Skain_Dev) en producto, diseño, desarrollo y programación.',
      ],
      en: [
        'Deleting chores now really removes them: never completed (e.g. created by mistake) → fully deleted with its turns; with history → gone from the week, completed turns kept in History.',
        'Turns of deleted chores no longer show in the week, home or calendar.',
        'Skipped turns are clearly labelled “Skipped” on phones too.',
        'Credits: Sebastian Prieto (Skain_Dev) on product, design, development and programming.',
      ],
    },
  },
  {
    version: '0.3.0',
    date: '2026-11-26',
    channel: 'beta',
    changes: {
      es: [
        'Nueva frecuencia «Días específicos»: elige los días de la tarea, con atajo «Día por medio (L · X · V)».',
        'Nueva forma de repartir: «Rota cada vez» (hoy uno, mañana otro; ideal para cocinar), «Rota cada semana» o «Persona fija».',
        'Vista previa en el formulario de quién hace qué esta semana.',
        'Editar y eliminar tareas desde el menú de cada turno; al cambiar una tarea, los turnos pendientes se recalculan desde esta semana.',
        'Fotos en los reportes de daños: botones «Tomar foto» y «Elegir de la galería», también al crear el reporte.',
        'Créditos: perfil de GitHub de Skain_Dev y mención a Claude (Anthropic) como parte del desarrollo.',
      ],
      en: [
        'New “Specific days” frequency: choose the chore days, with an “Every other day (M · W · F)” shortcut.',
        'New ways to share chores: “Rotates every time” (today one, tomorrow another; great for cooking), “Rotates every week” or “Fixed person”.',
        'Live preview in the form of who does what this week.',
        'Edit and delete chores from each turn’s menu; changing a chore recalculates pending turns from this week on.',
        'Photos in damage reports: “Take photo” and “Choose from gallery” buttons, also when creating the report.',
        'Credits: Skain_Dev’s GitHub profile and Claude (Anthropic) as part of the development.',
      ],
    },
  },
  {
    version: '0.2.1',
    date: '2026-11-25',
    channel: 'beta',
    changes: {
      es: ['Corrección: las notificaciones (incluida la de prueba) no llegaban por un permiso faltante en el servidor.'],
      en: ['Fix: notifications (including the test one) were not delivered because of a missing server permission.'],
    },
  },
  {
    version: '0.2.0',
    date: '2026-11-25',
    channel: 'beta',
    changes: {
      es: [
        'Notificaciones en el celular: resumen de tus tareas a las 7:00 a. m., recordatorio a las 8:00 p. m. si algo sigue pendiente y aviso cuando se reporta un daño. Se configuran en Ajustes.',
        'Enfoque en tareas y orden: Finanzas y Mercado quedan ocultos por ahora.',
        'Nuevo inicio con tus tareas pendientes, las vencidas y los próximos eventos.',
        'Acceso rápido «Nueva tarea» desde el inicio y desde el icono de la app.',
        'Nueva sección «Información de la app» con esta lista de cambios.',
        'Correcciones: permisos de la base de datos en Supabase y vista en celulares.',
      ],
      en: [
        'Phone notifications: your chores at 7:00 a.m., a reminder at 8:00 p.m. if something is still pending, and an alert when damage is reported. Configure them in Settings.',
        'Focus on chores and order: Finances and Groceries are hidden for now.',
        'New home screen with your pending and overdue chores and upcoming events.',
        '“New chore” quick action on the home screen and the app icon.',
        'New “About the app” section with this changelog.',
        'Fixes: Supabase database permissions and mobile layout.',
      ],
    },
  },
  {
    version: '0.1.0',
    date: '2026-11-24',
    channel: 'beta',
    changes: {
      es: [
        'Primera versión de RoomieHub.',
        'Tareas con rotación semanal automática y justa, intercambios de turno e historial.',
        'Calendario mensual y semanal con eventos y recordatorios.',
        'Reportes de daños con fotos, estados y responsable.',
        'Estadísticas de cumplimiento y actividad del hogar.',
        'Invitaciones por código o enlace, modo claro y oscuro, español e inglés.',
        'Instalable en Android como aplicación.',
      ],
      en: [
        'First release of RoomieHub.',
        'Chores with fair automatic weekly rotation, turn swaps and history.',
        'Monthly and weekly calendar with events and reminders.',
        'Damage reports with photos, status and owner.',
        'Household compliance and activity statistics.',
        'Invitations by code or link, light and dark mode, Spanish and English.',
        'Installable on Android as an app.',
      ],
    },
  },
];

export const CURRENT_RELEASE = CHANGELOG[0]!;
export const APP_VERSION = `${CURRENT_RELEASE.version}${CURRENT_RELEASE.channel === 'beta' ? '-beta' : ''}`;
