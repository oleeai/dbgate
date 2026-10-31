import _ from 'lodash';
import { arrayToHexString, base64ToUuid, isJsonLikeLongString, safeJsonParse, stringifyCellValue } from 'dbgate-tools';

export type QuickLookKind =
  'null' | 'missing' | 'boolean' | 'number' | 'json' | 'uuid' | 'binary' | 'date' | 'datetime' | 'time' | 'text';

export interface QuickLookPreview {
  kind: QuickLookKind;
  // the value as text, also what Copy puts on the clipboard
  text: string;
  json?: any;
  bytes?: ArrayLike<number>;
}

const UUID_REGEX = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*([+-]\d{2}(:?\d{2})?)?$/;
const DATE_TIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

// the grid keeps up to this many characters on screen; longer values still copy in full
export const TEXT_RENDER_LIMIT = 200000;
export const HEX_PREVIEW_BYTES = 512;
const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

function baseDataType(dataType: string) {
  return (dataType || '')
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim();
}

function isBinaryObject(value) {
  return (value?.type == 'Buffer' && _.isArray(value.data)) || !!value?.$binary?.base64;
}

function isPlainJson(value) {
  return (
    (_.isPlainObject(value) && !isBinaryObject(value) && !Object.keys(value).some(x => x.startsWith('$'))) ||
    _.isArray(value)
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayLike<number>) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + chunk));
  }
  return btoa(binary);
}

function getNumberText(value) {
  if (value?.$bigint) return String(value.$bigint);
  if (value?.$decimal) return String(value.$decimal);
  return String(value);
}

/** Works out how a cell value is best previewed, from the value itself and the column's data type. */
export function getQuickLookPreview(value, dataType: string, editorTypes = null): QuickLookPreview {
  if (value === undefined) return { kind: 'missing', text: '' };
  if (value === null) return { kind: 'null', text: '' };
  if (_.isBoolean(value)) return { kind: 'boolean', text: String(value) };

  const type = baseDataType(dataType);

  if (value?.$binary?.base64) {
    const subType = value.$binary.subType;
    const uuid =
      subType == '03' || subType == '04' || editorTypes?.parseUuid ? base64ToUuid(value.$binary.base64) : null;
    if (uuid) return { kind: 'uuid', text: uuid };
    const bytes = base64ToBytes(value.$binary.base64);
    return { kind: 'binary', text: '0x' + arrayToHexString(bytes), bytes };
  }
  if (value?.type == 'Buffer' && _.isArray(value.data)) {
    return { kind: 'binary', text: '0x' + arrayToHexString(value.data), bytes: value.data };
  }

  if (_.isNumber(value) || typeof value == 'bigint' || value?.$bigint || value?.$decimal) {
    return { kind: 'number', text: getNumberText(value) };
  }

  if (value?.$date) {
    const text = _.isDate(value.$date) ? value.$date.toISOString() : String(value.$date);
    return { kind: 'datetime', text };
  }
  if (_.isDate(value)) return { kind: 'datetime', text: value.toISOString() };

  if (isPlainJson(value)) return { kind: 'json', text: JSON.stringify(value, null, 2), json: value };

  if (_.isString(value)) {
    if (/^jsonb?$/.test(type) || /^\s*[{[]/.test(value) || isJsonLikeLongString(value)) {
      const parsed = safeJsonParse(value);
      if (_.isPlainObject(parsed) || _.isArray(parsed)) {
        return { kind: 'json', text: JSON.stringify(parsed, null, 2), json: parsed };
      }
    }
    const trimmed = value.trim();
    if (UUID_REGEX.test(trimmed)) return { kind: 'uuid', text: value };
    if (DATE_REGEX.test(trimmed) && (type == 'date' || !type) && parseDate(trimmed))
      return { kind: 'date', text: value };
    if (/^(time|timetz|time with(out)? time zone)$/.test(type) && TIME_REGEX.test(trimmed)) {
      return { kind: 'time', text: value };
    }
    if (DATE_TIME_REGEX.test(trimmed) && parseDateTime(trimmed)) return { kind: 'datetime', text: value };
    if (
      /int|serial|numeric|decimal|real|float|double|money|number/.test(type) &&
      /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)
    ) {
      return { kind: 'number', text: trimmed };
    }
    return { kind: 'text', text: value };
  }

  if (_.isPlainObject(value)) {
    // driver specific wrappers like ObjectId, geo points
    const text = stringifyCellValue(value, 'stringConversionIntent', editorTypes).value || JSON.stringify(value);
    return { kind: 'text', text };
  }

  return { kind: 'text', text: String(value) };
}

let separators = null;
function getSeparators() {
  if (!separators) {
    const parts = new Intl.NumberFormat().formatToParts(1234567.5);
    separators = {
      group: parts.find(x => x.type == 'group')?.value ?? ',',
      decimal: parts.find(x => x.type == 'decimal')?.value ?? '.',
    };
  }
  return separators;
}

/** Groups the digits of a number written as text, without losing precision on big or exact decimal values. */
export function formatNumberText(text: string) {
  const m = (text || '').trim().match(/^([+-]?)(\d+)(?:\.(\d+))?([eE][+-]?\d+)?$/);
  if (!m) return text;
  const { group, decimal } = getSeparators();
  const integer = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${m[1] == '-' ? '−' : m[1]}${integer}${m[3] != null ? decimal + m[3] : ''}${m[4] || ''}`;
}

export function formatCount(count: number) {
  return new Intl.NumberFormat().format(count);
}

export function formatByteSize(bytes: number) {
  if (bytes < 1024) return null;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: size < 10 ? 1 : 0 }).format(size)} ${units[unit]}`;
}

export function getTextStats(text: string) {
  return {
    characters: Array.from(text).length,
    lines: text == '' ? 0 : text.split('\n').length,
    words: text.trim() == '' ? 0 : text.trim().split(/\s+/).length,
  };
}

export function getJsonSummary(json) {
  return _.isArray(json) ? { isArray: true, count: json.length } : { isArray: false, count: Object.keys(json).length };
}

/** Counts nodes up to a limit, to decide how much of a JSON value to expand at first. */
export function countJsonNodes(json, limit = 1000) {
  let count = 0;
  const visit = value => {
    if (count > limit) return;
    count++;
    if (value && typeof value == 'object') {
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(json);
  return count;
}

export interface HexRow {
  offset: string;
  hex: string;
  ascii: string;
}

/** Classic hex dump rows: offset, 16 bytes in two groups of 8, printable characters. */
export function getHexRows(bytes: ArrayLike<number>, limit = HEX_PREVIEW_BYTES, perRow = 16): HexRow[] {
  const count = Math.min(bytes.length, limit);
  const offsetWidth = bytes.length > 0xffff ? 8 : 4;
  const rows: HexRow[] = [];
  for (let start = 0; start < count; start += perRow) {
    const pairs = [];
    let ascii = '';
    for (let i = start; i < Math.min(start + perRow, count); i++) {
      const byte = bytes[i];
      pairs.push(byte.toString(16).padStart(2, '0'));
      ascii += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '·';
    }
    const half = perRow / 2;
    const hex = [pairs.slice(0, half).join(' '), pairs.slice(half).join(' ')].join('  ').trimEnd();
    rows.push({ offset: start.toString(16).padStart(offsetWidth, '0'), hex: hex.padEnd(perRow * 3), ascii });
  }
  return rows;
}

const IMAGE_SIGNATURES = [
  { mime: 'image/png', label: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', label: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', label: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/bmp', label: 'BMP', bytes: [0x42, 0x4d] },
];

export function detectImage(bytes: ArrayLike<number>) {
  if (!bytes || bytes.length < 12 || bytes.length > IMAGE_PREVIEW_MAX_BYTES) return null;
  const startsWith = (sig, offset = 0) => sig.every((byte, i) => bytes[offset + i] == byte);
  let found = IMAGE_SIGNATURES.find(x => startsWith(x.bytes));
  if (!found && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    found = { mime: 'image/webp', label: 'WebP', bytes: [] };
  }
  if (!found) return null;
  return { label: found.label, src: `data:${found.mime};base64,${bytesToBase64(bytes)}` };
}

export function getUuidInfo(text: string) {
  const hex = text.replace(/[{}-]/g, '').toLowerCase();
  if (hex.length != 32) return null;
  if (/^0+$/.test(hex)) return { version: null, nil: true, createdAt: null };
  const version = parseInt(hex[12], 16);
  // version 7 starts with a 48-bit Unix time in milliseconds
  const createdAt = version == 7 ? new Date(parseInt(hex.substring(0, 12), 16)) : null;
  return { version, nil: false, createdAt };
}

export interface ParsedDateTime {
  date: Date;
  hasZone: boolean;
  fraction: string;
}

/** Reads a date/time value; values without a time zone are read as UTC. */
export function parseDateTime(text: string): ParsedDateTime {
  const m = (text || '').trim().match(DATE_TIME_REGEX);
  if (!m) return null;
  const [, year, month, day, hour, minute, second = '00', fraction = '', zone] = m;
  const ms = fraction ? Math.floor(parseFloat(`0${fraction}`) * 1000) : 0;
  // setUTCFullYear keeps years below 100 as they are
  const date = new Date(0);
  date.setUTCFullYear(+year, +month - 1, +day);
  date.setUTCHours(+hour, +minute, +second, ms);
  // a value that rolled over (February 31, 25:00) is shown as plain text
  if (date.getUTCMonth() != +month - 1 || date.getUTCDate() != +day || +hour > 23 || +minute > 59 || +second > 59) {
    return null;
  }
  if (zone && zone.toUpperCase() != 'Z') {
    const zm = zone.match(/^([+-])(\d{2}):?(\d{2})?$/);
    const offsetMinutes = (zm[1] == '-' ? -1 : 1) * (parseInt(zm[2]) * 60 + parseInt(zm[3] || '0'));
    date.setTime(date.getTime() - offsetMinutes * 60000);
  }
  if (isNaN(date.getTime())) return null;
  return { date, hasZone: !!zone, fraction };
}

export function parseDate(text: string): Date {
  const m = (text || '').trim().match(DATE_REGEX);
  if (!m) return null;
  const date = new Date(2000, 0, 1);
  date.setFullYear(+m[1], +m[2] - 1, +m[3]);
  if (date.getMonth() != +m[2] - 1 || date.getDate() != +m[3]) return null;
  return date;
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

// time zone offsets are whole minutes, so the stored fraction (microseconds and all) carries over as it is
export function formatUtc(parsed: ParsedDateTime) {
  const d = parsed.date;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}:${pad(d.getUTCSeconds())}${parsed.fraction}`;
}

export function formatLocal(parsed: ParsedDateTime) {
  const d = parsed.date;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '−';
  const abs = Math.abs(offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}${parsed.fraction} ${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function getLocalTimeZoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    return null;
  }
}

export function formatReadableDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' }).format(date);
}

export function formatReadableDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date);
}

export function formatRelativeTime(date: Date, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const seconds = (date.getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 26 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  if (abs < 320 * 86400) return rtf.format(Math.round(seconds / (30.44 * 86400)), 'month');
  return rtf.format(Math.round(seconds / (365.25 * 86400)), 'year');
}

/** Relative calendar days for a date without time ("today", "in 3 days", "2 years ago"). */
export function formatRelativeDay(date: Date, now = new Date()) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const abs = Math.abs(days);
  if (abs < 26) return rtf.format(days, 'day');
  if (abs < 320) return rtf.format(Math.round(days / 30.44), 'month');
  return rtf.format(Math.round(days / 365.25), 'year');
}
