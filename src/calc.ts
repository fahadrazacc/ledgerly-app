// Small calculator used by the amount keypad. Supports + − × ÷ with normal precedence.
export const OPS = ['+', '−', '×', '÷'];
export const isOp = (c: string) => OPS.includes(c);

export function evaluate(expr: string): number | null {
  const tokens = expr.match(/(\d+\.?\d*|\.\d+|[+−×÷])/g);
  if (!tokens) return null;
  while (tokens.length && isOp(tokens[tokens.length - 1])) tokens.pop(); // ignore a trailing operator
  if (!tokens.length) return null;
  // first pass: × ÷
  const stack: (number | string)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '×' || t === '÷') {
      const a = stack.pop() as number;
      const b = Number(tokens[++i]);
      if (t === '÷' && b === 0) return null;
      stack.push(t === '×' ? a * b : a / b);
    } else stack.push(isOp(t) ? t : Number(t));
  }
  // second pass: + −
  let total = stack[0] as number;
  for (let i = 1; i < stack.length; i += 2) {
    const op = stack[i];
    const v = stack[i + 1] as number;
    total = op === '+' ? total + v : total - v;
  }
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
}

/** Applies one keypad key to the expression. */
export function press(expr: string, key: string): string {
  if (key === 'C') return '0';
  if (key === 'back') return expr.length > 1 ? expr.slice(0, -1) : '0';
  if (key === '=') {
    const v = evaluate(expr);
    return v === null ? expr : String(v);
  }
  const last = expr[expr.length - 1];
  if (isOp(key)) {
    if (expr === '0' && key !== '−') return expr;
    if (isOp(last)) return expr.slice(0, -1) + key; // swap operator
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }
  const segment = expr.split(/[+−×÷]/).pop() ?? '';
  if (key === '.') {
    if (segment.includes('.')) return expr;
    return expr + (segment === '' ? '0.' : '.');
  }
  // digits
  if (segment.includes('.') && segment.split('.')[1].length >= 2) return expr;
  if (segment.replace('.', '').length >= 10) return expr;
  if (expr === '0') return key;
  if (segment === '0') return expr.slice(0, -1) + key;
  return expr + key;
}

export const hasOp = (expr: string) => /[+×÷]|.−/.test(expr);
