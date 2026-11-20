import type { IconName } from './icons';

export type RecordType = 'expense' | 'income' | 'transfer';
export type AccountKind = 'cash' | 'bank' | 'wallet' | 'card' | 'savings';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  initial: number;
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: IconName;
  color: string;
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
}

export interface AppData {
  version: 1;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  budgets: Budget[];
  debts: Debt[];
}
