import _ from 'lodash';
import { extendTableInfo } from 'dbgate-tools';
import type { DatabaseInfo, TableInfo } from 'dbgate-types';
import { apiCall } from '../utility/api';

export interface DetailsIndex {
  name: string;
  columns: string[];
  includeColumns: string[];
  isPrimary: boolean;
  isUnique: boolean;
  method?: string;
  sizeBytes?: number;
  predicate?: string;
  isValid?: boolean;
  sql: string;
}

export interface DetailsTrigger {
  name: string;
  timing?: string;
  events: string[];
  level?: string;
  functionSchema?: string;
  functionName?: string;
  // 'enabled' | 'disabled' | 'replica' | 'always', null when the engine doesn't tell
  state?: string;
  sql: string;
}

export interface DetailsPolicy {
  name: string;
  command: string;
  roles: string[];
  isPermissive: boolean;
  using?: string;
  withCheck?: string;
  sql: string;
}

export interface DetailsEnum {
  typeName: string;
  values: string[];
  columns: string[];
  sql: string;
}

export interface DetailsCheck {
  name: string;
  expression: string;
  isValidated: boolean;
  sql: string;
}

export interface DetailsRls {
  enabled: boolean;
  forced: boolean;
  qualifiedName: string;
}

export interface DetailsResult<T> {
  rows?: T[];
  error?: string;
}

export interface CatalogDetails {
  rls: DetailsResult<DetailsRls>;
  indexes: DetailsResult<DetailsIndex>;
  triggers: DetailsResult<DetailsTrigger>;
  policies: DetailsResult<DetailsPolicy>;
  enums: DetailsResult<DetailsEnum>;
  checks: DetailsResult<DetailsCheck>;
}

export interface StructureDetails {
  indexes: DetailsIndex[];
  triggers: DetailsTrigger[];
  checks: DetailsCheck[];
}

export function hasPostgresCatalog(connection) {
  return connection?.engine == 'postgres@dbgate-plugin-postgres';
}

// E'' strings read the same whatever standard_conforming_strings is set to
function sqlLiteral(value: string) {
  return `E'${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")}'`;
}

function parseJsonArray(value): string[] {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

// The queries run through sql-select, wrapped as "select * from (...)", so they can only ever read.
// sql-select also works on read-only connections, unlike query-data.
async function catalogRows(conid, database, sql) {
  const resp = await apiCall('database-connections/sql-select', {
    conid,
    database,
    select: {
      commandType: 'select',
      selectAll: true,
      from: { subQueryString: sql, alias: 'details' },
    },
  });
  if (!resp || resp.errorMessage) {
    throw new Error(resp?.errorMessage || 'Error reading the system catalog');
  }
  return resp.rows || [];
}

async function loadSection<T>(conid, database, sql, mapRows: (rows) => T[]): Promise<DetailsResult<T>> {
  try {
    return { rows: mapRows(await catalogRows(conid, database, sql)) };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

const TRIGGER_STATES = { O: 'enabled', D: 'disabled', R: 'replica', A: 'always' };
const POLICY_COMMANDS = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE', '*': 'ALL' };

// pg_trigger.tgtype bits, see TRIGGER_TYPE_* in the Postgres sources
function decodeTriggerType(tgtype: number) {
  const timing = tgtype & 64 ? 'INSTEAD OF' : tgtype & 2 ? 'BEFORE' : 'AFTER';
  const events = [];
  if (tgtype & 4) events.push('INSERT');
  if (tgtype & 16) events.push('UPDATE');
  if (tgtype & 8) events.push('DELETE');
  if (tgtype & 32) events.push('TRUNCATE');
  return { timing, events, level: tgtype & 1 ? 'ROW' : 'STATEMENT' };
}

function buildPolicySql(row, qualifiedName) {
  const lines = [
    `CREATE POLICY ${row.quoted_name} ON ${qualifiedName}`,
    `  AS ${row.is_permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
    `  FOR ${POLICY_COMMANDS[row.command_code] ?? 'ALL'}`,
    `  TO ${row.roles_sql}`,
  ];
  if (row.using_expr) lines.push(`  USING (${row.using_expr})`);
  if (row.check_expr) lines.push(`  WITH CHECK (${row.check_expr})`);
  return lines.join('\n') + ';';
}

function stripCheck(definition: string) {
  const match = definition?.match(/^CHECK \(([\s\S]*)\)(\s+NO INHERIT)?(\s+NOT VALID)?$/);
  return match ? match[1] : definition;
}

export async function loadPostgresDetails({ conid, database, schemaName, pureName }): Promise<CatalogDetails> {
  const base = `with t as (
  select c.oid, c.relrowsecurity, c.relforcerowsecurity, format('%I.%I', n.nspname, c.relname) as qualified_name
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = ${sqlLiteral(schemaName)} and c.relname = ${sqlLiteral(pureName)}
)`;

  const [rls, indexes, triggers, policies, enums, checks] = await Promise.all([
    loadSection<DetailsRls>(
      conid,
      database,
      `${base}
select t.relrowsecurity as rls_enabled, t.relforcerowsecurity as rls_forced, t.qualified_name from t`,
      rows =>
        rows.map(row => ({ enabled: !!row.rls_enabled, forced: !!row.rls_forced, qualifiedName: row.qualified_name }))
    ),

    loadSection<DetailsIndex>(
      conid,
      database,
      `${base}
select
  i.relname as index_name,
  ix.indisprimary as is_primary,
  ix.indisunique as is_unique,
  ix.indisvalid as is_valid,
  am.amname as method,
  pg_catalog.pg_relation_size(ix.indexrelid) as size_bytes,
  pg_catalog.pg_get_expr(ix.indpred, ix.indrelid, true) as predicate,
  array_to_json(array(
    select pg_catalog.pg_get_indexdef(ix.indexrelid, k, true) || case when ix.indoption[k - 1] & 1 = 1 then ' DESC' else '' end
    from generate_series(1, ix.indnkeyatts) k order by k
  ))::text as columns_json,
  array_to_json(array(
    select pg_catalog.pg_get_indexdef(ix.indexrelid, k, true)
    from generate_series(ix.indnkeyatts + 1, ix.indnatts) k order by k
  ))::text as include_json,
  case
    when con.oid is not null
      then format('ALTER TABLE %s ADD CONSTRAINT %I %s;', t.qualified_name, con.conname, pg_catalog.pg_get_constraintdef(con.oid, true))
    else pg_catalog.pg_get_indexdef(ix.indexrelid) || ';'
  end as create_sql
from t
join pg_catalog.pg_index ix on ix.indrelid = t.oid
join pg_catalog.pg_class i on i.oid = ix.indexrelid
join pg_catalog.pg_am am on am.oid = i.relam
left join pg_catalog.pg_constraint con
  on con.conindid = ix.indexrelid and con.conrelid = ix.indrelid and con.contype in ('p', 'u', 'x')
order by ix.indisprimary desc, ix.indisunique desc, i.relname`,
      rows =>
        rows.map(row => ({
          name: row.index_name,
          columns: parseJsonArray(row.columns_json),
          includeColumns: parseJsonArray(row.include_json),
          isPrimary: !!row.is_primary,
          isUnique: !!row.is_unique,
          isValid: row.is_valid !== false,
          method: row.method,
          sizeBytes: _.isNumber(row.size_bytes) ? row.size_bytes : null,
          predicate: row.predicate,
          sql: row.create_sql,
        }))
    ),

    loadSection<DetailsTrigger>(
      conid,
      database,
      `${base}
select
  tg.tgname as trigger_name,
  tg.tgtype::integer as tgtype,
  tg.tgenabled::text as enabled_code,
  pn.nspname as function_schema,
  p.proname as function_name,
  pg_catalog.pg_get_triggerdef(tg.oid) || ';' || case tg.tgenabled
    when 'D' then format(E'\\nALTER TABLE %s DISABLE TRIGGER %I;', t.qualified_name, tg.tgname)
    when 'R' then format(E'\\nALTER TABLE %s ENABLE REPLICA TRIGGER %I;', t.qualified_name, tg.tgname)
    when 'A' then format(E'\\nALTER TABLE %s ENABLE ALWAYS TRIGGER %I;', t.qualified_name, tg.tgname)
    else ''
  end as create_sql
from t
join pg_catalog.pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
join pg_catalog.pg_proc p on p.oid = tg.tgfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
order by tg.tgname`,
      rows =>
        rows.map(row => ({
          name: row.trigger_name,
          ...decodeTriggerType(row.tgtype),
          functionSchema: row.function_schema,
          functionName: row.function_name,
          state: TRIGGER_STATES[row.enabled_code] ?? 'enabled',
          sql: row.create_sql,
        }))
    ),

    loadSection<DetailsPolicy>(
      conid,
      database,
      `${base}
select
  pol.polname as policy_name,
  quote_ident(pol.polname) as quoted_name,
  pol.polcmd::text as command_code,
  pol.polpermissive as is_permissive,
  array_to_json(case
    when 0::oid = any(pol.polroles) then array['public']
    else array(select r.rolname::text from pg_catalog.pg_roles r where r.oid = any(pol.polroles) order by r.rolname)
  end)::text as roles_json,
  case
    when 0::oid = any(pol.polroles) then 'PUBLIC'
    else array_to_string(array(
      select quote_ident(r.rolname) from pg_catalog.pg_roles r where r.oid = any(pol.polroles) order by r.rolname
    ), ', ')
  end as roles_sql,
  pg_catalog.pg_get_expr(pol.polqual, pol.polrelid, true) as using_expr,
  pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid, true) as check_expr,
  t.qualified_name
from t
join pg_catalog.pg_policy pol on pol.polrelid = t.oid
order by pol.polname`,
      rows =>
        rows.map(row => ({
          name: row.policy_name,
          command: POLICY_COMMANDS[row.command_code] ?? 'ALL',
          roles: parseJsonArray(row.roles_json),
          isPermissive: row.is_permissive !== false,
          using: row.using_expr,
          withCheck: row.check_expr,
          sql: buildPolicySql(row, row.qualified_name),
        }))
    ),

    // enum columns, arrays of enums and domains over enums
    loadSection<DetailsEnum>(
      conid,
      database,
      `${base}
select
  a.attname as column_name,
  format('%I.%I', tn.nspname, ty.typname) as type_name,
  array_to_json(array(
    select e.enumlabel::text from pg_catalog.pg_enum e where e.enumtypid = ty.oid order by e.enumsortorder
  ))::text as labels_json,
  (
    select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
    from pg_catalog.pg_enum e where e.enumtypid = ty.oid
  ) as labels_sql
from t
join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
join pg_catalog.pg_type at on at.oid = a.atttypid
join pg_catalog.pg_type ty on ty.oid = case
  when at.typtype = 'd' then at.typbasetype
  when at.typcategory = 'A' then at.typelem
  else at.oid
end
join pg_catalog.pg_namespace tn on tn.oid = ty.typnamespace
where ty.typtype = 'e'
order by a.attnum`,
      rows =>
        _.values(_.groupBy(rows, 'type_name')).map(group => ({
          typeName: group[0].type_name,
          values: parseJsonArray(group[0].labels_json),
          columns: group.map(x => x.column_name),
          sql: `CREATE TYPE ${group[0].type_name} AS ENUM (${group[0].labels_sql ?? ''});`,
        }))
    ),

    loadSection<DetailsCheck>(
      conid,
      database,
      `${base}
select
  con.conname as constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition,
  con.convalidated as is_validated,
  format('ALTER TABLE %s ADD CONSTRAINT %I %s;', t.qualified_name, con.conname, pg_catalog.pg_get_constraintdef(con.oid, true)) as create_sql
from t
join pg_catalog.pg_constraint con on con.conrelid = t.oid and con.contype = 'c'
order by con.conname`,
      rows =>
        rows.map(row => ({
          name: row.constraint_name,
          expression: stripCheck(row.definition),
          isValidated: row.is_validated !== false,
          sql: row.create_sql,
        }))
    ),
  ]);

  if (rls.rows && rls.rows.length == 0) {
    rls.error = `Table ${schemaName}.${pureName} was not found`;
  }

  return { rls, indexes, triggers, policies, enums, checks };
}

function dumpSql(driver, fn) {
  try {
    const dmp = driver.createDumper();
    fn(dmp);
    return dmp.s.trim();
  } catch {
    return '';
  }
}

// What the analysed structure knows, for engines without a catalog query (and as a fallback)
export function getStructureDetails(table: TableInfo, dbinfo: DatabaseInfo, driver): StructureDetails {
  const ext = extendTableInfo(table);
  const indexes: DetailsIndex[] = [];

  if (ext.primaryKey) {
    indexes.push({
      name: ext.primaryKey.constraintName,
      columns: ext.primaryKey.columns.map(x => x.columnName),
      includeColumns: [],
      isPrimary: true,
      isUnique: true,
      sql: dumpSql(driver, dmp => dmp.createPrimaryKey(ext.primaryKey)),
    });
  }
  for (const uq of ext.uniques) {
    indexes.push({
      name: uq.constraintName,
      columns: uq.columns.map(x => x.columnName),
      includeColumns: [],
      isPrimary: false,
      isUnique: true,
      sql: dumpSql(driver, dmp => dmp.createUnique(uq)),
    });
  }
  for (const ix of ext.indexes) {
    indexes.push({
      name: ix.constraintName,
      columns: ix.columns.map(x => x.columnName + (x.isDescending ? ' DESC' : '')),
      includeColumns: [],
      isPrimary: false,
      isUnique: !!ix.isUnique,
      method: ix.indexType,
      predicate: ix.filterDefinition,
      // expression indexes come without columns, and their CREATE INDEX would be wrong
      sql: ix.columns.length > 0 ? dumpSql(driver, dmp => dmp.createIndex(ix)) : '',
    });
  }

  const triggers = (dbinfo?.triggers ?? [])
    .filter(x => x.tableName == table.pureName && (x.schemaName ?? null) == (table.schemaName ?? null))
    .map(x => ({
      name: x.pureName,
      timing: x.triggerTiming,
      // some analysers glue the events together ("INSERTDELETE")
      events: x.eventType?.match(/INSERT|UPDATE|DELETE|TRUNCATE/g) ?? _.compact([x.eventType]),
      level: x.triggerLevel,
      functionName: x.functionName,
      state: null,
      sql: x.createSql ?? '',
    }));

  const checks = ext.checks.map(ch => ({
    name: ch.constraintName,
    expression: ch.definition,
    isValidated: true,
    sql: dumpSql(driver, dmp => dmp.createCheck(ch)),
  }));

  return { indexes, triggers, checks };
}
