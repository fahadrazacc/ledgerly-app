import type { Account, AppData, Budget, Category, Debt, Txn } from './types';
import { addDays, startOfMonth, uid } from './utils';

export const CURRENCIES = ['Rs', '$', '€', '£', 'AED', 'SAR', '₹'];

const EURO = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']);
/** A sensible starting currency from the device's region; the person can change it. */
export function guessCurrency(): string {
  let region = '';
  try {
    region = (new Intl.Locale(navigator.language).maximize().region ?? '').toUpperCase();
  } catch {
    /* older browsers */
  }
  if (region === 'PK') return 'Rs';
  if (region === 'IN') return '₹';
  if (region === 'AE') return 'AED';
  if (region === 'SA') return 'SAR';
  if (region === 'GB') return '£';
  if (EURO.has(region)) return '€';
  return '$';
}

/** Sample amounts are written in rupees; scale them to look natural in other currencies. */
const SCALE: Record<string, number> = { Rs: 1, '₹': 0.35, AED: 0.1, SAR: 0.1, $: 0.025, '€': 0.025, '£': 0.02 };

export function defaultCategories(): Category[] {
  const e = (name: string, icon: Category['icon'], color: string): Category => ({ id: uid(), name, type: 'expense', icon, color });
  const i = (name: string, icon: Category['icon'], color: string): Category => ({ id: uid(), name, type: 'income', icon, color });
  return [
    e('Food & Dining', 'food', '#E67700'),
    e('Shopping', 'bag', '#3B5BDB'),
    e('Transport', 'car', '#7048E8'),
    e('Bills & Utilities', 'bolt', '#0C8599'),
    e('Health', 'heart', '#D6336C'),
    e('Entertainment', 'film', '#0CA678'),
    e('Education', 'book', '#5C940D'),
    e('Family', 'users', '#AE3EC9'),
    e('Home & Rent', 'house', '#495057'),
    e('Other', 'tag', '#868E96'),
    i('Salary', 'briefcase', '#087F5B'),
    i('Business', 'store', '#1971C2'),
    i('Freelance', 'laptop', '#0B7285'),
    i('Gifts', 'gift', '#C2255C'),
    i('Other income', 'trend', '#5C940D'),
  ];
}

export function emptyData(name: string, currency: string): AppData {
  return {
    version: 1,
    settings: { name, currency },
    accounts: [
      { id: uid(), name: 'Cash', kind: 'cash', initial: 0 },
      { id: uid(), name: 'Bank account', kind: 'bank', initial: 0 },
    ],
    categories: defaultCategories(),
    txns: [],
    budgets: [],
    debts: [],
  };
}

/** Realistic-looking sample data for trying the app out. */
export function sampleData(name: string, currency: string): AppData {
  const categories = defaultCategories();
  const c = (n: string) => categories.find((x) => x.name === n)!.id;
  const k = SCALE[currency] ?? 1;
  const round = (n: number) => {
    if (k >= 1) return Math.round(n / 10) * 10;
    const v = n * k;
    return v >= 100 ? Math.round(v) : Math.round(v * 2) / 2;
  };
  const accounts: Account[] = [
    { id: uid(), name: 'Cash', kind: 'cash', initial: round(15000) },
    { id: uid(), name: 'Bank account', kind: 'bank', initial: round(120000) },
    { id: uid(), name: 'Mobile wallet', kind: 'wallet', initial: round(20000) },
  ];
  const [cash, bank, wallet] = accounts.map((a) => a.id);

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const txns: Txn[] = [];
  const add = (date: Date, type: Txn['type'], amount: number, accountId: string, categoryId?: string, note?: string, toAccountId?: string) => {
    if (date.getTime() > Date.now()) return;
    txns.push({ id: uid(), type, amount: round(amount), accountId, categoryId, note, toAccountId, date: date.toISOString(), createdAt: date.getTime() });
  };
  const at = (base: Date, day: number, h: number) => {
    const d = addDays(base, day - 1);
    d.setHours(h, Math.floor(rnd() * 60));
    return d;
  };

  const now = new Date();
  for (let m = -5; m <= 0; m++) {
    const base = startOfMonth(new Date(now.getFullYear(), now.getMonth() + m, 1));
    add(at(base, 1, 10), 'income', 180000 + m * -1000, bank, c('Salary'), 'Monthly salary');
    if (m % 2 === 0) add(at(base, 12, 15), 'income', 25000 + rnd() * 15000, wallet, c('Freelance'), 'Website project');
    add(at(base, 2, 11), 'expense', 45000, bank, c('Home & Rent'), 'Rent');
    add(at(base, 5, 18), 'expense', 7000 + rnd() * 4000, bank, c('Bills & Utilities'), 'Electricity bill');
    add(at(base, 6, 18), 'expense', 2500 + rnd() * 800, bank, c('Bills & Utilities'), 'Internet');
    add(at(base, 3, 9), 'transfer', 20000, bank, undefined, 'Cash withdrawal', cash);
    for (let k = 0; k < 9; k++) add(at(base, 1 + Math.floor(rnd() * 27), 13), 'expense', 600 + rnd() * 2200, rnd() > 0.5 ? cash : wallet, c('Food & Dining'), ['Lunch', 'Dinner out', 'Coffee', 'Takeaway'][k % 4]);
    for (let k = 0; k < 4; k++) add(at(base, 1 + Math.floor(rnd() * 27), 9), 'expense', 1500 + rnd() * 1500, wallet, c('Transport'), 'Fuel');
    for (let k = 0; k < 3; k++) add(at(base, 1 + Math.floor(rnd() * 27), 17), 'expense', 2500 + rnd() * 7000, bank, c('Shopping'), ['Groceries', 'Clothes', 'Household'][k]);
    if (rnd() > 0.4) add(at(base, 14 + Math.floor(rnd() * 10), 20), 'expense', 1500 + rnd() * 3000, wallet, c('Entertainment'), 'Cinema');
    if (rnd() > 0.5) add(at(base, 8 + Math.floor(rnd() * 15), 16), 'expense', 2000 + rnd() * 5000, cash, c('Health'), 'Pharmacy');
    add(at(base, 20, 12), 'expense', 5000 + rnd() * 3000, bank, c('Family'), 'Family support');
  }

  const budgets: Budget[] = [
    { id: uid(), categoryId: null, limit: round(150000) },
    { id: uid(), categoryId: c('Food & Dining'), limit: round(15000) },
    { id: uid(), categoryId: c('Shopping'), limit: round(15000) },
    { id: uid(), categoryId: c('Transport'), limit: round(9000) },
    { id: uid(), categoryId: c('Bills & Utilities'), limit: round(14000) },
    { id: uid(), categoryId: c('Entertainment'), limit: round(4000) },
  ];

  const debts: Debt[] = [
    { id: uid(), person: 'Alex', kind: 'lent', amount: round(15000), date: addDays(now, -10).toISOString(), due: addDays(now, 10).toISOString(), settled: false },
    { id: uid(), person: 'Sam', kind: 'borrowed', amount: round(5000), date: addDays(now, -4).toISOString(), due: addDays(now, 15).toISOString(), settled: false },
  ];

  return { version: 1, settings: { name, currency }, accounts, categories, txns, budgets, debts };
}
