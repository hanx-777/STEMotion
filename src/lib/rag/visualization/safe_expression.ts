type CompiledExpression =
  | { ok: true; evaluate: (x: number) => number }
  | { ok: false; error: string };

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '**' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma'; value: ',' };

const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  'Math.abs': Math.abs,
  'Math.cos': Math.cos,
  'Math.exp': Math.exp,
  'Math.log': Math.log,
  'Math.pow': Math.pow,
  'Math.sin': Math.sin,
  'Math.sqrt': Math.sqrt,
  'Math.tan': Math.tan,
};

const ALLOWED_CONSTANTS: Record<string, number> = {
  'Math.E': Math.E,
  'Math.PI': Math.PI,
};

const BLOCKED_TOKENS = /\b(?:eval|Function|constructor|window|document|process|global|fetch|XMLHttpRequest|import|require)\b|[`;]/;

export function evaluateSafeFunctionExpression(source: string, x: number): number | undefined {
  const compiled = compileSafeFunctionExpression(source);
  if (!compiled.ok) return undefined;
  const value = compiled.evaluate(x);
  return Number.isFinite(value) ? value : undefined;
}

export function compileSafeFunctionExpression(source: string): CompiledExpression {
  if (!source.trim()) return { ok: false, error: 'Expression is empty.' };
  if (BLOCKED_TOKENS.test(source)) return { ok: false, error: 'Expression contains blocked JavaScript tokens.' };

  try {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const evaluate = parser.parseExpression();
    parser.expectEnd();
    return { ok: true, evaluate };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/\d|\./.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /[\d.]/.test(source[i])) i += 1;
      const raw = source.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${raw}".`);
      tokens.push({ type: 'number', value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_.]/.test(source[i])) i += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, i) });
      continue;
    }

    if (char === '*' && source[i + 1] === '*') {
      tokens.push({ type: 'operator', value: '**' });
      i += 2;
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
      i += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      i += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported character "${char}".`);
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): (x: number) => number {
    return this.parseAdditive();
  }

  expectEnd(): void {
    if (this.current()) throw new Error('Unexpected trailing tokens.');
  }

  private parseAdditive(): (x: number) => number {
    let left = this.parseMultiplicative();

    while (this.matchOperator('+') || this.matchOperator('-')) {
      const op = this.previous().value;
      const right = this.parseMultiplicative();
      const previousLeft = left;
      left = op === '+'
        ? (x) => previousLeft(x) + right(x)
        : (x) => previousLeft(x) - right(x);
    }

    return left;
  }

  private parseMultiplicative(): (x: number) => number {
    let left = this.parsePower();

    while (this.matchOperator('*') || this.matchOperator('/')) {
      const op = this.previous().value;
      const right = this.parsePower();
      const previousLeft = left;
      left = op === '*'
        ? (x) => previousLeft(x) * right(x)
        : (x) => previousLeft(x) / right(x);
    }

    return left;
  }

  private parsePower(): (x: number) => number {
    const left = this.parseUnary();
    if (!this.matchOperator('**')) return left;
    const right = this.parsePower();
    return (x) => previousFinite(left(x)) ** previousFinite(right(x));
  }

  private parseUnary(): (x: number) => number {
    if (this.matchOperator('+')) return this.parseUnary();
    if (this.matchOperator('-')) {
      const operand = this.parseUnary();
      return (x) => -operand(x);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): (x: number) => number {
    const token = this.advance();
    if (!token) throw new Error('Unexpected end of expression.');

    if (token.type === 'number') return () => token.value;

    if (token.type === 'identifier') {
      if (token.value === 'x') return (x) => x;
      if (token.value in ALLOWED_CONSTANTS) return () => ALLOWED_CONSTANTS[token.value];
      if (token.value in ALLOWED_FUNCTIONS) return this.parseFunctionCall(token.value);
      throw new Error(`Identifier "${token.value}" is not allowed.`);
    }

    if (token.type === 'paren' && token.value === '(') {
      const expression = this.parseExpression();
      if (!this.matchParen(')')) throw new Error('Missing closing parenthesis.');
      return expression;
    }

    throw new Error('Expected number, x, allowed Math function, or parenthesized expression.');
  }

  private parseFunctionCall(name: string): (x: number) => number {
    if (!this.matchParen('(')) throw new Error(`Function "${name}" must be called.`);
    const args: Array<(x: number) => number> = [];

    if (!this.checkParen(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.matchComma());
    }

    if (!this.matchParen(')')) throw new Error(`Function "${name}" is missing closing parenthesis.`);
    if (name === 'Math.pow' ? args.length !== 2 : args.length !== 1) {
      throw new Error(`Function "${name}" has invalid arity.`);
    }

    return (x) => ALLOWED_FUNCTIONS[name](...args.map((arg) => previousFinite(arg(x))));
  }

  private matchOperator(value: Extract<Token, { type: 'operator' }>['value']): boolean {
    if (this.current()?.type === 'operator' && this.current()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchParen(value: '(' | ')'): boolean {
    if (this.checkParen(value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private checkParen(value: '(' | ')'): boolean {
    return this.current()?.type === 'paren' && this.current()?.value === value;
  }

  private matchComma(): boolean {
    if (this.current()?.type === 'comma') {
      this.index += 1;
      return true;
    }
    return false;
  }

  private advance(): Token | undefined {
    const token = this.current();
    if (token) this.index += 1;
    return token;
  }

  private current(): Token | undefined {
    return this.tokens[this.index];
  }

  private previous(): Token & { type: 'operator' } {
    const token = this.tokens[this.index - 1];
    if (!token || token.type !== 'operator') throw new Error('Internal parser error.');
    return token;
  }
}

function previousFinite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Expression evaluated to a non-finite number.');
  return value;
}
