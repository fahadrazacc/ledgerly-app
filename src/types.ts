import type { IconName } from './icons';

export type RecordType = 'expense' | 'income' | 'transfer';
export type AccountKind = 'cash' | 'bank' | 'wallet' | 'card' | 'savings';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  initial: number;
  archived?: boolean; // shown to the user as "inactive"
  icon?: IconName;
  color?: string;
  image?: string; // small uploaded picture (data URL)
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: IconName;
  color: string;
  archived?: boolean;
}

export interface Txn {
  id: string;
  type: RecordType;
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  date: string; // ISO timestamp
  note?: string;
  createdAt: number;
  eventId?: string;
}

/** A trip, wedding or other occasion that groups records. */
export interface LedgerEvent {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  start: string; // ISO date (yyyy-mm-dd)
  end?: string; // ISO date, inclusive
  budget?: number;
  autoAdd: boolean; // pre-select for new records dated inside the event
  archived?: boolean;
}

export interface Budget {
  id: string;
  categoryId: string | null; // null = overall monthly budget
  limit: number;
}

export interface Debt {
  id: string;
  person: string;
  kind: 'lent' | 'borrowed';
  amount: number;
  date: string;
  due?: string;
  note?: string;
  settled: boolean;
}

export interface Settings {
  name: string;
  currency: string;
  email?: string;
  phone?: string;
  photo?: string; // small JPEG data URL, stored inside the encrypted vault
  hideAmounts?: boolean;
  theme?: 'system' | 'light' | 'dark';
  autoLockMin?: number; // minutes in the background before locking; 0 = immediately
  notify?: NotifySettings;
  ai?: AiSettings;
}

export interface AiSettings {
  geminiKey?: string; // kept inside the encrypted vault
  includeNotes?: boolean;
  lastSummary?: { text: string; at: number };
}

export interface NotifySettings {
  daily: boolean;
  dailyTime: string; // "HH:MM"
  payments: boolean;
  budgets: boolean;
  debts: boolean;
}

export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';

/** A bill or payment the user wants to be reminded about. */
export interface Reminder {
  id: string;
  title: string;
  amount?: number;
  type: 'expense' | 'income';
  categoryId?: string;
  accountId?: string;
  due: string; // ISO date-time of the next occurrence
  repeat: Repeat;
  daysBefore: number; // 0 = on the day
  active: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  budgets: Budget[];
  debts: Debt[];
  reminders?: Reminder[];
  events?: LedgerEvent[];
}
