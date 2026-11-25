/**
 * Feature switches. Money-related modules are hidden for now: the household is focusing on
 * chores, order and damage reports. Nothing is deleted — flip these to `true` to bring back
 * the full Finances and Groceries modules (routes, navigation, dashboard cards, stats, etc.).
 */
export const features = {
  /** Expenses, balances, settlements, payment events, repair costs, spending statistics. */
  finances: false,
  /** Grocery / shopping list. */
  shopping: false,
} as const;
