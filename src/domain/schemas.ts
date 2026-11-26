import { z } from 'zod';
import { parseMoneyInput } from './money';

// Form schemas. Messages are i18n keys resolved by <FieldError>.
// Form values stay as strings (what inputs produce) and are converted on submit.

const required = (max: number) =>
  z.string().trim().min(1, 'validation.required').max(max, 'validation.tooLong');

const optionalText = (max: number) => z.string().trim().max(max, 'validation.tooLong');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date');

export const moneyString = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .refine((v) => parseMoneyInput(v) !== null, 'validation.amount');

const optionalMoneyString = z
  .string()
  .trim()
  .refine((v) => v === '' || parseMoneyInput(v) !== null, 'validation.amount');

export const loginSchema = z.object({
  email: z.email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});

export const passwordSchema = z
  .string()
  .min(8, 'validation.passwordLength')
  .max(72, 'validation.tooLong')
  .regex(/[A-Za-z]/, 'validation.passwordLetters')
  .regex(/\d/, 'validation.passwordDigits');

export const registerSchema = z
  .object({
    displayName: required(60),
    email: z.email('validation.email'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMatch' });

export const forgotSchema = z.object({ email: z.email('validation.email') });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMatch' });

export const profileSchema = z.object({
  displayName: required(60),
  avatarColor: z.string().min(1),
});

export const apartmentSchema = z.object({
  name: required(80),
  currency: z.string().regex(/^[A-Z]{3}$/, 'validation.currency'),
});

export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().length(10, 'validation.inviteCode')),
});

export const choreSchema = z.object({
  title: required(100),
  description: optionalText(500),
  categoryId: z.string(),
  frequency: z.enum(['daily', 'twice_weekly', 'weekly', 'biweekly', 'monthly', 'custom_days']),
  scheduleDays: z.array(z.string()),
  rotationMode: z.enum(['weekly', 'per_occurrence', 'fixed']),
  fixedAssigneeId: z.string(),
  dueWeekday: z.string().regex(/^[1-7]$/, 'validation.required'),
  effort: z.string().regex(/^[1-5]$/, 'validation.required'),
})
  .refine((v) => v.frequency !== 'custom_days' || v.scheduleDays.length > 0, { path: ['scheduleDays'], message: 'validation.pickDays' })
  .refine((v) => v.rotationMode !== 'fixed' || v.fixedAssigneeId !== '', { path: ['fixedAssigneeId'], message: 'validation.pickPerson' });

export const expenseSchema = z
  .object({
    description: required(120),
    amount: moneyString,
    paidBy: z.string().min(1, 'validation.required'),
    spentOn: isoDate,
    categoryId: z.string(),
    participants: z.array(z.string()).min(1, 'validation.participants'),
    notes: optionalText(500),
    maintenanceReportId: z.string(),
  });

export const settlementSchema = z
  .object({
    fromUser: z.string().min(1, 'validation.required'),
    toUser: z.string().min(1, 'validation.required'),
    amount: moneyString,
    settledOn: isoDate,
    note: optionalText(300),
  })
  .refine((v) => v.fromUser !== v.toUser, { path: ['toUser'], message: 'validation.sameMember' });

export const eventSchema = z
  .object({
    title: required(120),
    description: optionalText(1000),
    kind: z.enum(['event', 'payment', 'reminder', 'maintenance']),
    date: isoDate,
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    recurrence: z.enum(['none', 'weekly', 'monthly']),
    remind: z.string(),
    amount: optionalMoneyString,
    visibility: z.enum(['shared', 'private']),
  })
  .refine((v) => v.allDay || /^\d{2}:\d{2}$/.test(v.startTime), { path: ['startTime'], message: 'validation.time' })
  .refine((v) => v.allDay || v.endTime === '' || v.endTime >= v.startTime, { path: ['endTime'], message: 'validation.endAfterStart' });

export const shoppingSchema = z.object({
  name: required(80),
  quantity: z
    .string()
    .trim()
    .refine((v) => {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) && n > 0 && n <= 9999 && Math.round(n * 100) === n * 100;
    }, 'validation.quantity'),
  unit: optionalText(16),
  categoryId: z.string(),
  assignedTo: z.string(),
  estimatedPrice: optionalMoneyString,
  notes: optionalText(300),
});

export const reportSchema = z.object({
  title: required(120),
  description: optionalText(2000),
  location: optionalText(80),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  occurredOn: isoDate,
  responsibleId: z.string(),
});

export const categorySchema = z.object({
  name: required(40),
  color: z.string().min(1),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
export type ApartmentValues = z.infer<typeof apartmentSchema>;
export type ChoreValues = z.infer<typeof choreSchema>;
export type ExpenseValues = z.infer<typeof expenseSchema>;
export type SettlementValues = z.infer<typeof settlementSchema>;
export type EventValues = z.infer<typeof eventSchema>;
export type ShoppingValues = z.infer<typeof shoppingSchema>;
export type ReportValues = z.infer<typeof reportSchema>;
export type CategoryValues = z.infer<typeof categorySchema>;
