import { parseFilter } from 'dbgate-filterparser';
import type { FilterBehaviour } from 'dbgate-types';
import { _t } from '../translations';

// Operators of the toolbar filter builder. Each one writes a term of DbGate's column filter syntax, so the
// filter row under the column headers and the toolbar chips edit the same config.filters entry.

export type FilterOperatorGroup = 'comparison' | 'pattern' | 'date' | 'other';

export interface FilterOperator {
  id: string;
  group: FilterOperatorGroup;
  label: string;
  // text between the column and the value in a chip
  chipLabel: string;
  // keycap in the operator menu
  symbol?: string;
  hasValue: boolean;
  placeholder?: string;
  hint?: string;
  isAvailable: (behaviour: FilterBehaviour, options: FilterBuilderOptions) => boolean;
  // returns null when the value can't be written in the filter syntax
  toFilter: (value: string, behaviour: FilterBehaviour) => string | null;
}

export interface FilterBuilderOptions {
  // the SQL dialect has ILIKE (PostgreSQL family)
  supportsIlike?: boolean;
}

export interface FilterTerm {
  operatorId: string;
  value: string;
  // the term's own filter text, kept as typed so untouched chips are written back unchanged
  text: string;
}

const DATE_VALUE = '\\d{4}(?:-\\d\\d?(?:-\\d\\d?(?:(?:\\s+|T)\\d\\d?:\\d\\d?(?::\\d\\d?)?)?)?)?';
const SAFE_UNQUOTED_REGEX = /^[^\s,'"^{}]+$/;

const DATE_SYMBOLS = [
  { id: 'today', text: 'TODAY', label: () => _t('filterBuilder.today', { defaultMessage: 'Today' }) },
  { id: 'yesterday', text: 'YESTERDAY', label: () => _t('filterBuilder.yesterday', { defaultMessage: 'Yesterday' }) },
  { id: 'thisWeek', text: 'THIS WEEK', label: () => _t('filterBuilder.thisWeek', { defaultMessage: 'This week' }) },
  { id: 'lastWeek', text: 'LAST WEEK', label: () => _t('filterBuilder.lastWeek', { defaultMessage: 'Last week' }) },
  { id: 'thisMonth', text: 'THIS MONTH', label: () => _t('filterBuilder.thisMonth', { defaultMessage: 'This month' }) },
  { id: 'lastMonth', text: 'LAST MONTH', label: () => _t('filterBuilder.lastMonth', { defaultMessage: 'Last month' }) },
  { id: 'thisYear', text: 'THIS YEAR', label: () => _t('filterBuilder.thisYear', { defaultMessage: 'This year' }) },
  { id: 'lastYear', text: 'LAST YEAR', label: () => _t('filterBuilder.lastYear', { defaultMessage: 'Last year' }) },
];

const isDateBehaviour = (b: FilterBehaviour) => !!b.supportDatetimeComparison && !b.supportEquals;
const isTextBehaviour = (b: FilterBehaviour) => !!b.supportStringInclusion;

// Writes a value so the filter parser reads it back as one token.
export function quoteFilterValue(value: string, behaviour: FilterBehaviour) {
  if (!behaviour.allowStringToken) return value.trim();
  if (SAFE_UNQUOTED_REGEX.test(value)) return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function prefixed(prefix: string) {
  return (value: string, behaviour: FilterBehaviour) => {
    if (isDateBehaviour(behaviour)) return `${prefix}${value.trim()}`;
    return `${prefix}${quoteFilterValue(value, behaviour)}`;
  };
}

function sqlLike(keyword: string) {
  return (value: string) => {
    // the {...} SQL condition ends at the first closing brace
    if (value.includes('}')) return null;
    return `{$$ ${keyword} '${value.replace(/'/g, "''")}'}`;
  };
}

const fixed = (text: string) => () => text;

export function getFilterOperators(): FilterOperator[] {
  const valuePlaceholder = _t('filterBuilder.valuePlaceholder', { defaultMessage: 'Value' });
  const comparable = (b: FilterBehaviour) => !!(b.supportNumberLikeComparison || b.supportDatetimeComparison);
  const res: FilterOperator[] = [
    {
      id: 'eq',
      group: 'comparison',
      label: _t('filterBuilder.equals', { defaultMessage: 'Equals' }),
      chipLabel: '=',
      symbol: '=',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: b => !!(b.supportEquals || isDateBehaviour(b)),
      // a bare date matches the whole year / month / day / minute it names
      toFilter: (value, b) => (isDateBehaviour(b) ? value.trim() : prefixed('=')(value, b)),
    },
    {
      id: 'ne',
      group: 'comparison',
      label: _t('filterBuilder.notEqual', { defaultMessage: 'Not equal' }),
      chipLabel: '<>',
      symbol: '<>',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: b => !!b.supportEquals,
      toFilter: prefixed('<>'),
    },
    {
      id: 'gt',
      group: 'comparison',
      label: _t('filterBuilder.greaterThan', { defaultMessage: 'Greater than' }),
      chipLabel: '>',
      symbol: '>',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: comparable,
      toFilter: prefixed('>'),
    },
    {
      id: 'lt',
      group: 'comparison',
      label: _t('filterBuilder.lessThan', { defaultMessage: 'Less than' }),
      chipLabel: '<',
      symbol: '<',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: comparable,
      toFilter: prefixed('<'),
    },
    {
      id: 'ge',
      group: 'comparison',
      label: _t('filterBuilder.greaterOrEqual', { defaultMessage: 'Greater or equal' }),
      chipLabel: '>=',
      symbol: '>=',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: comparable,
      toFilter: prefixed('>='),
    },
    {
      id: 'le',
      group: 'comparison',
      label: _t('filterBuilder.lessOrEqual', { defaultMessage: 'Less or equal' }),
      chipLabel: '<=',
      symbol: '<=',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: comparable,
      toFilter: prefixed('<='),
    },
    {
      id: 'like',
      group: 'pattern',
      label: _t('filterBuilder.like', { defaultMessage: 'Like' }),
      chipLabel: 'like',
      symbol: '~~',
      hasValue: true,
      placeholder: '%pattern%',
      hint: _t('filterBuilder.likeHint', { defaultMessage: '% matches any text, _ one character' }),
      isAvailable: b => isTextBehaviour(b) && !!b.supportSqlCondition,
      toFilter: sqlLike('LIKE'),
    },
    {
      id: 'ilike',
      group: 'pattern',
      label: _t('filterBuilder.ilike', { defaultMessage: 'iLike' }),
      chipLabel: 'ilike',
      symbol: '~~*',
      hasValue: true,
      placeholder: '%pattern%',
      hint: _t('filterBuilder.ilikeHint', { defaultMessage: 'Like, ignoring case' }),
      isAvailable: (b, options) => isTextBehaviour(b) && !!b.supportSqlCondition && !!options.supportsIlike,
      toFilter: sqlLike('ILIKE'),
    },
    {
      id: 'contains',
      group: 'pattern',
      label: _t('filterBuilder.contains', { defaultMessage: 'Contains' }),
      chipLabel: _t('filterBuilder.chipContains', { defaultMessage: 'contains' }),
      symbol: '%…%',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: isTextBehaviour,
      toFilter: prefixed('+'),
    },
    {
      id: 'notContains',
      group: 'pattern',
      label: _t('filterBuilder.notContains', { defaultMessage: 'Does not contain' }),
      chipLabel: _t('filterBuilder.chipNotContains', { defaultMessage: 'does not contain' }),
      symbol: '!%…%',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: isTextBehaviour,
      toFilter: prefixed('~'),
    },
    {
      id: 'startsWith',
      group: 'pattern',
      label: _t('filterBuilder.startsWith', { defaultMessage: 'Starts with' }),
      chipLabel: _t('filterBuilder.chipStartsWith', { defaultMessage: 'starts with' }),
      symbol: '…%',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: isTextBehaviour,
      toFilter: prefixed('^'),
    },
    {
      id: 'endsWith',
      group: 'pattern',
      label: _t('filterBuilder.endsWith', { defaultMessage: 'Ends with' }),
      chipLabel: _t('filterBuilder.chipEndsWith', { defaultMessage: 'ends with' }),
      symbol: '%…',
      hasValue: true,
      placeholder: valuePlaceholder,
      isAvailable: isTextBehaviour,
      toFilter: prefixed('$'),
    },
    ...DATE_SYMBOLS.map((x): FilterOperator => ({
      id: x.id,
      group: 'date',
      label: x.label(),
      chipLabel: x.label().toLowerCase(),
      hasValue: false,
      isAvailable: b => !!b.supportDatetimeSymbols,
      toFilter: fixed(x.text),
    })),
    {
      id: 'isNull',
      group: 'other',
      label: _t('filterBuilder.isNull', { defaultMessage: 'Is null' }),
      chipLabel: _t('filterBuilder.chipIsNull', { defaultMessage: 'is null' }),
      symbol: 'null',
      hasValue: false,
      isAvailable: b => !!b.supportNullTesting,
      toFilter: fixed('NULL'),
    },
    {
      id: 'notNull',
      group: 'other',
      label: _t('filterBuilder.isNotNull', { defaultMessage: 'Is not null' }),
      chipLabel: _t('filterBuilder.chipIsNotNull', { defaultMessage: 'is not null' }),
      symbol: '!null',
      hasValue: false,
      isAvailable: b => !!b.supportNullTesting,
      toFilter: fixed('NOT NULL'),
    },
    {
      id: 'isEmpty',
      group: 'other',
      label: _t('filterBuilder.isEmpty', { defaultMessage: 'Is empty' }),
      chipLabel: _t('filterBuilder.chipIsEmpty', { defaultMessage: 'is empty' }),
      symbol: "''",
      hasValue: false,
      isAvailable: b => !!b.supportEmpty,
      toFilter: fixed('EMPTY'),
    },
    {
      id: 'notEmpty',
      group: 'other',
      label: _t('filterBuilder.isNotEmpty', { defaultMessage: 'Is not empty' }),
      chipLabel: _t('filterBuilder.chipIsNotEmpty', { defaultMessage: 'is not empty' }),
      symbol: "!''",
      hasValue: false,
      isAvailable: b => !!b.supportEmpty,
      toFilter: fixed('NOT EMPTY'),
    },
    {
      id: 'isTrue',
      group: 'other',
      label: _t('filterBuilder.isTrue', { defaultMessage: 'Is true' }),
      chipLabel: _t('filterBuilder.chipIsTrue', { defaultMessage: 'is true' }),
      symbol: 'true',
      hasValue: false,
      isAvailable: b => !!b.supportBooleanValues,
      toFilter: fixed('TRUE'),
    },
    {
      id: 'isFalse',
      group: 'other',
      label: _t('filterBuilder.isFalse', { defaultMessage: 'Is false' }),
      chipLabel: _t('filterBuilder.chipIsFalse', { defaultMessage: 'is false' }),
      symbol: 'false',
      hasValue: false,
      isAvailable: b => !!b.supportBooleanValues,
      toFilter: fixed('FALSE'),
    },
    {
      id: 'in',
      group: 'other',
      label: _t('filterBuilder.inList', { defaultMessage: 'In list' }),
      chipLabel: _t('filterBuilder.chipIn', { defaultMessage: 'in' }),
      symbol: 'in',
      hasValue: true,
      placeholder: _t('filterBuilder.inListPlaceholder', { defaultMessage: 'a, b, c' }),
      hint: _t('filterBuilder.inListHint', { defaultMessage: 'Separate values with commas' }),
      isAvailable: b => !!b.supportEquals && !b.disableOr,
      toFilter: (value, b) => {
        const items = value
          .split(',')
          .map(x => x.trim())
          .filter(x => x);
        if (items.length == 0) return null;
        return items.map(x => `=${quoteFilterValue(x, b)}`).join(',');
      },
    },
    {
      id: 'expression',
      group: 'other',
      label: _t('filterBuilder.expression', { defaultMessage: 'Filter expression' }),
      chipLabel: '',
      symbol: 'ƒx',
      hasValue: true,
      placeholder: '>10 <20',
      hint: _t('filterBuilder.expressionHint', {
        defaultMessage: 'Column filter syntax: space = and, comma = or',
      }),
      isAvailable: () => true,
      toFilter: value => value.trim(),
    },
  ];
  return res;
}

export function getFilterOperator(id: string) {
  return getFilterOperators().find(x => x.id == id);
}

export function isFilterValid(text: string, behaviour: FilterBehaviour) {
  if (!behaviour) return true;
  try {
    parseFilter(text, behaviour);
    return true;
  } catch (err) {
    return false;
  }
}

// Splits filter text at a separator that is outside quotes and {SQL} conditions.
export function splitFilterTopLevel(text: string, separator: string): string[] {
  const res = [];
  let current = '';
  let quote = null;
  let braces = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch == '\\' && quote == '"' && i + 1 < text.length) {
        current += text[++i];
      } else if (ch == quote) {
        quote = null;
      }
      continue;
    }
    if (braces == 0 && (ch == '"' || ch == "'")) quote = ch;
    if (ch == '{') braces++;
    if (ch == '}' && braces > 0) braces--;
    if (ch == separator && !quote && braces == 0) {
      res.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  res.push(current);
  return res;
}

function unquote(token: string) {
  if (token.length >= 2 && (token[0] == '"' || token[0] == "'") && token[token.length - 1] == token[0]) {
    return token.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return token;
}

const PREFIX_OPERATORS: { [prefix: string]: string } = {
  '<>': 'ne',
  '!=': 'ne',
  '<=': 'le',
  '>=': 'ge',
  '<': 'lt',
  '>': 'gt',
  '=': 'eq',
  '+': 'contains',
  '~': 'notContains',
  '^': 'startsWith',
  $: 'endsWith',
};

// Reads one term at the start of text; returns it with the length it took, or null.
function readTerm(text: string, behaviour: FilterBehaviour): { operatorId: string; value: string; length: number } {
  const keyword = (regex: RegExp, operatorId: string) => {
    const m = text.match(regex);
    return m ? { operatorId, value: '', length: m[0].length } : null;
  };

  if (behaviour.supportNullTesting) {
    const res = keyword(/^NOT\s+NULL\b/, 'notNull') ?? keyword(/^NULL\b/, 'isNull');
    if (res) return res;
  }
  if (behaviour.supportEmpty) {
    const res = keyword(/^NOT\s+EMPTY\b/, 'notEmpty') ?? keyword(/^EMPTY\b/, 'isEmpty');
    if (res) return res;
  }
  if (behaviour.supportBooleanValues) {
    const res = keyword(/^true\b/i, 'isTrue') ?? keyword(/^false\b/i, 'isFalse');
    if (res) return res;
  }
  if (behaviour.supportDatetimeSymbols) {
    for (const symbol of DATE_SYMBOLS) {
      const res = keyword(new RegExp(`^${symbol.text.replace(' ', '\\s+')}\\b`), symbol.id);
      if (res) return res;
    }
  }

  const like = text.match(/^\{\$\$\s+(LIKE|ILIKE)\s+'((?:[^']|'')*)'\s*\}/i);
  if (like) {
    return {
      operatorId: like[1].toUpperCase() == 'ILIKE' ? 'ilike' : 'like',
      value: like[2].replace(/''/g, "'"),
      length: like[0].length,
    };
  }
  // "{...}" SQL conditions and the negated "!^" / "!$" forms have no chip of their own
  if (text.startsWith('{') || /^!(\^|\$)/.test(text)) return null;

  const prefix = text.match(/^(<>|!=|<=|>=|<|>|=|\+|~|\^|\$)\s*/);
  const rest = prefix ? text.slice(prefix[0].length) : text;
  let valueMatch = null;
  if (isDateBehaviour(behaviour)) {
    valueMatch = rest.match(new RegExp(`^${DATE_VALUE}`));
  } else {
    valueMatch = rest.match(/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,'"^{}]+)/);
  }
  if (!valueMatch) return null;

  let operatorId = prefix ? PREFIX_OPERATORS[prefix[1]] : null;
  if (!operatorId) {
    // a bare value: text columns search for it, other columns compare it
    operatorId = isTextBehaviour(behaviour) ? 'contains' : 'eq';
  }
  return {
    operatorId,
    value: unquote(valueMatch[1] ?? valueMatch[0]),
    length: (prefix ? prefix[0].length : 0) + valueMatch[0].length,
  };
}

// Terms joined by spaces (all must match). Null when some part is not a term this builder knows.
function readAndTerms(text: string, behaviour: FilterBehaviour): FilterTerm[] {
  const res: FilterTerm[] = [];
  let rest = text.trim();
  while (rest) {
    const term = readTerm(rest, behaviour);
    if (!term) return null;
    const termText = rest.slice(0, term.length).trim();
    rest = rest.slice(term.length);
    if (rest && !/^\s/.test(rest)) return null;
    rest = rest.trim();
    res.push({ operatorId: term.operatorId, value: term.value, text: termText });
  }
  return res;
}

// Splits a column filter into chips. Filters the builder can't show term by term become one expression chip.
export function parseFilterTerms(text: string, behaviour: FilterBehaviour): FilterTerm[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const expression = [{ operatorId: 'expression', value: trimmed, text: trimmed }];
  if (!behaviour || !isFilterValid(trimmed, behaviour)) return expression;

  const alternatives = splitFilterTopLevel(trimmed, ',');
  if (alternatives.length > 1) {
    // "=a,=b,=c" (or "1,2,3" on a number column) is an in-list
    const items = alternatives.map(x => readAndTerms(x, behaviour));
    if (behaviour.supportEquals && items.every(x => x?.length == 1 && x[0].operatorId == 'eq')) {
      return [{ operatorId: 'in', value: items.map(x => x[0].value).join(', '), text: trimmed }];
    }
    return expression;
  }

  return readAndTerms(trimmed, behaviour) ?? expression;
}

// Joins chips of one column back into a filter. A chip holding alternatives ("a,b") is distributed, since the
// syntax has no parentheses: (a,b) and c = "a c,b c".
export function combineFilterTerms(texts: string[]): string {
  let alternatives = [''];
  for (const text of texts) {
    const parts = splitFilterTopLevel(text.trim(), ',').map(x => x.trim());
    const next = [];
    for (const left of alternatives) {
      for (const right of parts) {
        next.push(left ? `${left} ${right}` : right);
      }
    }
    alternatives = next;
  }
  return alternatives.filter(x => x).join(',');
}

// Placeholder and hint of the value input. Date columns take dates in the filter syntax's own format.
export function getValuePrompt(operator: FilterOperator, behaviour: FilterBehaviour) {
  if (behaviour && isDateBehaviour(behaviour) && operator.group == 'comparison') {
    return {
      placeholder: 'YYYY-MM-DD',
      hint:
        operator.id == 'eq'
          ? _t('filterBuilder.dateEqualsHint', {
              defaultMessage: 'The whole year, month or day: 2026, 2026-10, 2026-10-30',
            })
          : _t('filterBuilder.dateHint', { defaultMessage: 'e.g. 2026-10-30 or 2026-10-30 14:30' }),
    };
  }
  return { placeholder: operator.placeholder, hint: operator.hint };
}
