import { BarChart3, CalendarDays, Home, Info, ListChecks, Settings, ShoppingBasket, Wallet, Wrench, type LucideIcon } from 'lucide-react';
import { features } from '@/config/features';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Shown directly in the mobile bottom bar (others go under "More"). */
  primary: boolean;
}

const moneyOn = features.finances || features.shopping;

const ALL: (NavItem & { enabled: boolean })[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: Home, primary: true, enabled: true },
  { to: '/chores', labelKey: 'nav.chores', icon: ListChecks, primary: true, enabled: true },
  { to: '/finances', labelKey: 'nav.finances', icon: Wallet, primary: true, enabled: features.finances },
  { to: '/shopping', labelKey: 'nav.shopping', icon: ShoppingBasket, primary: true, enabled: features.shopping },
  // with the money modules hidden, calendar and damage reports move into the bottom bar
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, primary: !moneyOn, enabled: true },
  { to: '/maintenance', labelKey: 'nav.maintenance', icon: Wrench, primary: !moneyOn, enabled: true },
  { to: '/stats', labelKey: 'nav.stats', icon: BarChart3, primary: false, enabled: true },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, primary: false, enabled: true },
  { to: '/about', labelKey: 'nav.about', icon: Info, primary: false, enabled: true },
];

export const NAV_ITEMS: NavItem[] = ALL.filter((i) => i.enabled).map(({ enabled: _enabled, ...item }) => item);
