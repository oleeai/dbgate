import _ from 'lodash';
import { stringifyCellValue } from 'dbgate-tools';
import type { TableInfo } from 'dbgate-types';

export type RowFieldKind =
  'text' | 'longtext' | 'integer' | 'number' | 'boolean' | 'date' | 'time' | 'datetime' | 'json' | 'enum' | 'binary';

// Raw editor values: strings for text-like editors, true/false for toggles, null for NULL.
export type RowFieldRaw = string | boolean | null;

const LABEL_COLUMN_NAMES = [
  'name',
  'title',
  'label',
  'display_name',
  'displayname',
  'full_name',
  'fullname',
  'username',
  'user_name',
  'email',
  'code',
  'sku',
  'slug',
  'description',
];

function baseDataType(dataType: string) {
  return (dataType || '')
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim();
}

function dataTypeLength(dataType: string) {
  const m = (dataType || '').match(/\((\d+)\)/);
  return m ? parseInt(m[1]) : null;
}

export function isTextDataType(dataType: string) {
  return /char|text|string|clob|citext/.test(baseDataType(dataType));
}

export function isNumericDataType(dataType: string) {
  return /int|serial|numeric|decimal|real|float|double|money|number/.test(baseDataType(dataType));
}

function isPlainJson(value) {
  return (_.isPlainObject(value) && !Object.keys(value).some(x => x.startsWith('$'))) || _.isArray(value);
}

export function getFieldKind(column, value): RowFieldKind {
  if (column.options?.length && !column.canSelectMultipleOptions) return 'enum';

  const type = baseDataType(column.dataType);

  if (value?.type == 'Buffer' || value?.$binary) return 'binary';
  if (/^(bytea|blob|tinyblob|mediumblob|longblob|binary|varbinary|image)$/.test(type)) return 'binary';
  if (/^(bool|boolean|bit)$/.test(type)) return 'boolean';
  if (/^jsonb?$/.test(type) || isPlainJson(value)) return 'json';
  if (type == 'date') return 'date';
  if (/^(time|timetz|time with(out)? time zone)$/.test(type)) return 'time';
  if (/^(timestamp|timestamptz|datetime|datetime2|smalldatetime|datetimeoffset)/.test(type)) return 'datetime';
  if (/^(tinyint|smallint|mediumint|int|integer|bigint|int2|int4|int8|serial|smallserial|bigserial)$/.test(type))
    return 'integer';
  if (isNumericDataType(type)) return 'number';
  if (/^(text|mediumtext|longtext|ntext|clob|xml|citext)$/.test(type)) return 'longtext';
  if (_.isString(value) && value.includes('\n')) return 'longtext';
  const length = dataTypeLength(column.dataType);
  if (length && length > 255) return 'longtext';
  return 'text';
}

export function isTimeZoneDataType(dataType: string) {
  const type = baseDataType(dataType);
  return type == 'timestamptz' || type == 'datetimeoffset' || type.includes('with time zone');
}

/** Converts a cell value into what the field's editor shows. */
export function toRawValue(kind: RowFieldKind, value, editorTypes): RowFieldRaw {
  if (value === null || value === undefined) return null;
  if (kind == 'boolean') {
    if (_.isBoolean(value)) return value;
    if (value === 1 || value === '1' || value === 't' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'f' || value === 'false') return false;
  }
  if (kind == 'json' && isPlainJson(value)) return JSON.stringify(value, null, 2);
  if (value?.$bigint) return value.$bigint;
  if (value?.$decimal) return value.$decimal;
  return stringifyCellValue(value, 'inlineEditorIntent', editorTypes).value;
}

/** Validates an editor value, returns an error message key or null. */
export function validateRawValue(kind: RowFieldKind, raw: RowFieldRaw): 'number' | 'integer' | 'json' | null {
  if (!_.isString(raw) || raw.trim() == '') return null;
  if (kind == 'integer' && !/^\s*-?\d+\s*$/.test(raw)) return 'integer';
  if (kind == 'number' && !/^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(raw)) return 'number';
  if (kind == 'json') {
    try {
      JSON.parse(raw);
    } catch (e) {
      return 'json';
    }
  }
  return null;
}

/** Converts an editor value into the value written to the change set. */
export function fromRawValue(kind: RowFieldKind, raw: RowFieldRaw, originalValue) {
  if (raw === null) return null;
  if (kind == 'boolean') return !!raw;
  if (!_.isString(raw)) return raw;
  if (kind == 'integer' || kind == 'number') {
    const trimmed = raw.trim();
    if (trimmed == '') return null;
    // safe integers are written as numbers, everything else keeps its exact text
    if (/^-?\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }
  if (kind == 'json') {
    if (raw.trim() == '') return null;
    const parsed = JSON.parse(raw);
    // a json column that held text keeps text, so the database sees the same kind of value
    return _.isString(originalValue) ? JSON.stringify(parsed) : parsed;
  }
  return raw;
}

const dateTimeRegex = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Splits a date/time string into the value of a native datetime-local input and the parts it can't show. */
export function splitDateTime(raw: RowFieldRaw) {
  if (!_.isString(raw)) return null;
  const m = raw.match(dateTimeRegex);
  if (!m) return null;
  return { local: `${m[1]}T${m[2]}`, fraction: m[3] || '', offset: m[4] || '' };
}

export function currentTimeZoneOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function joinDateTime(local: string, offset: string) {
  if (!local) return '';
  const [date, time] = local.split('T');
  const withSeconds = time && time.length == 5 ? `${time}:00` : time;
  return `${date} ${withSeconds}${offset || ''}`;
}

/** Picks columns that make a referenced row readable for a person (name, title, email...). */
export function getLabelColumns(table: TableInfo, keyColumn: string, dictionaryColumns: string[] = null): string[] {
  if (!table?.columns) return [];
  const candidates = table.columns.filter(
    col => col.columnName != keyColumn && !table.primaryKey?.columns?.find(x => x.columnName == col.columnName)
  );
  const byName = _.sortBy(
    candidates.filter(col => LABEL_COLUMN_NAMES.includes(col.columnName.toLowerCase())),
    col => LABEL_COLUMN_NAMES.indexOf(col.columnName.toLowerCase())
  ).map(col => col.columnName);
  if (byName.length > 0) return byName.slice(0, 2);
  if (dictionaryColumns?.length) return dictionaryColumns.slice(0, 2);
  return candidates
    .filter(col => isTextDataType(col.dataType))
    .slice(0, 2)
    .map(col => col.columnName);
}

export function createLookupSelect(
  table: TableInfo,
  keyColumn: string,
  labelColumns: string[],
  { search = '', value = undefined, limit = 50 } = {}
) {
  const select: any = {
    commandType: 'select',
    from: { name: { schemaName: table.schemaName, pureName: table.pureName } },
    columns: [keyColumn, ...labelColumns].map(columnName => ({ exprType: 'column', columnName })),
    topRecords: limit,
    orderBy: [{ exprType: 'column', columnName: keyColumn, direction: 'ASC' }],
  };

  if (value !== undefined) {
    select.where = {
      conditionType: 'binary',
      operator: '=',
      left: { exprType: 'column', columnName: keyColumn },
      right: { exprType: 'value', value },
    };
    return select;
  }

  const tokens = _.compact(search.split(' ').map(x => x.trim()));
  if (tokens.length == 0) return select;

  const keyType = table.columns.find(x => x.columnName == keyColumn)?.dataType;
  const tokenConditions = tokens.map(token =>
    _.compact([
      ...labelColumns.map(columnName => ({
        conditionType: 'like',
        left: { exprType: 'column', columnName },
        right: { exprType: 'value', value: `%${token}%` },
      })),
      isTextDataType(keyType) && {
        conditionType: 'like',
        left: { exprType: 'column', columnName: keyColumn },
        right: { exprType: 'value', value: `%${token}%` },
      },
      isNumericDataType(keyType) &&
        /^-?\d+$/.test(token) && {
          conditionType: 'binary',
          operator: '=',
          left: { exprType: 'column', columnName: keyColumn },
          right: { exprType: 'value', value: parseInt(token) },
        },
    ])
  );
  if (tokenConditions.some(x => x.length == 0)) {
    // nothing could match this token, so nothing matches the search
    select.where = {
      conditionType: 'binary',
      operator: '=',
      left: { exprType: 'value', value: 1 },
      right: { exprType: 'value', value: 0 },
    };
    return select;
  }
  select.where = {
    conditionType: 'and',
    conditions: tokenConditions.map(conditions => ({ conditionType: 'or', conditions })),
  };
  return select;
}

export function normalizeKeyValue(value) {
  const res = value?.$bigint ?? value?.$decimal ?? value?.$oid ?? value;
  return res == null ? null : String(res);
}

export function formatLabel(row, labelColumns: string[]) {
  return labelColumns
    .map(col => row?.[col])
    .filter(x => x != null && x !== '')
    .map(x => (_.isString(x) ? x : (x?.$bigint ?? x?.$decimal ?? JSON.stringify(x))));
}
