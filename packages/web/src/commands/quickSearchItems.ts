import _ from 'lodash';
import moment from 'moment';
import { extractDbNameFromComposite, getConnectionLabel } from 'dbgate-tools';
import {
  databaseObjectIcons,
  handleObjectClick,
  openDatabaseObjectDetail,
} from '../appobj/DatabaseObjectAppObject.svelte';
import { openConnection } from '../appobj/ConnectionAppObject.svelte';
import { defaultDatabaseObjectAppObjectActions, matchDatabaseObjectAppObject } from '../appobj/appObjectTools';
import newQuery from '../query/newQuery';
import { getCurrentConfig, openedTabs } from '../stores';
import { _t, _tval } from '../translations';
import { handleAfterTabClick } from '../utility/changeCurrentDbByTab';
import { setSelectedTabFunc, switchCurrentDatabase } from '../utility/common';
import { fuzzyMatch, fuzzySegments } from '../utility/fuzzyMatch';
import type { HighlightSegment } from '../utility/highlightSegments';
import { getLocalStorage } from '../utility/storageCache';

export type QuickSearchGroup = 'objects' | 'tabs' | 'actions' | 'connections' | 'more';

export interface QuickSearchItem {
  key: string;
  group: QuickSearchGroup;
  title: string;
  /** Also searched, ranked below a match in the title (category, schema, database) */
  searchText?: string;
  meta?: string;
  icon?: string;
  /** A generic icon, drawn lighter than the specific ones */
  quietIcon?: boolean;
  /** Shows the engine logo of this connection instead of the icon */
  connection?: any;
  keyText?: string;
  checked?: boolean;
  dimmed?: boolean;
  /** The command opens a list of sub-commands in the panel */
  subCommandsOf?: any;
  /** Switches the panel to this scope instead of running something */
  enterScope?: string;
  actionLabel?: string;
  altActionLabel?: string;
  run?: () => any;
  runAlt?: () => any;
  score?: number;
  segments?: HighlightSegment[];
}

// store values can briefly be an error object instead of a list
const asArray = (value): any[] => (Array.isArray(value) ? value : []);

const OBJECT_TYPE_FIELDS = ['tables', 'views', 'matviews', 'collections', 'procedures', 'functions'];

function objectTypeLabel(objectTypeField) {
  switch (objectTypeField) {
    case 'views':
      return _t('commandPalette.typeView', { defaultMessage: 'view' });
    case 'matviews':
      return _t('commandPalette.typeMatview', { defaultMessage: 'materialized view' });
    case 'procedures':
      return _t('commandPalette.typeProcedure', { defaultMessage: 'procedure' });
    case 'functions':
      return _t('commandPalette.typeFunction', { defaultMessage: 'function' });
  }
  return null;
}

function engineName(connection) {
  const match = (connection?.engine || '').match(/^([^@]*)@/);
  return match ? match[1] : connection?.engine;
}

/** Enter opens what a click in the sidebar opens (the data, or the last used default action); Cmd/Ctrl+Enter the other view */
function getObjectActions(objectTypeField, lastUsedDefaultActions) {
  const actions = defaultDatabaseObjectAppObjectActions[objectTypeField] ?? [];
  const primary = actions.find(x => x.defaultActionId == lastUsedDefaultActions?.[objectTypeField]) ?? actions[0];
  const alternate =
    primary?.defaultActionId == 'openStructure'
      ? actions.find(x => x.defaultActionId == 'openTable')
      : (actions.find(x => x.defaultActionId == 'openStructure') ?? actions.find(x => x.defaultActionId == 'openJson'));
  return { primary, alternate };
}

const FOCUS_WAIT_MS = 3000;

/** A tab opens asynchronously; once it is the selected one, it gets the keyboard focus (so the grid can be used right away) */
function focusTabWhenOpened(isTarget: (tab) => boolean) {
  let done = false;
  let unsubscribe = null;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    setTimeout(() => {
      unsubscribe?.();
      openedTabs.update(tabs => tabs.map(tab => ({ ...tab, focused: !!tab.selected && tab.closedTime == null })));
    });
  };
  const timer = setTimeout(() => {
    done = true;
    unsubscribe?.();
  }, FOCUS_WAIT_MS);
  unsubscribe = openedTabs.subscribe(tabs => {
    const selected = asArray(tabs).find(x => x.selected && x.closedTime == null);
    if (selected && isTarget(selected)) finish();
  });
}

export function buildObjectItems(db, conid, database, lastUsedDefaultActions): QuickSearchItem[] {
  if (!db || !conid || !database) return [];
  const objects = OBJECT_TYPE_FIELDS.flatMap(objectTypeField =>
    (db[objectTypeField] || []).map(obj => ({ objectTypeField, obj }))
  );
  const showSchema = _.uniq(objects.map(x => x.obj.schemaName).filter(Boolean)).length > 1;

  return _.sortBy(objects, [x => OBJECT_TYPE_FIELDS.indexOf(x.objectTypeField), x => x.obj.pureName]).map(
    ({ objectTypeField, obj }): QuickSearchItem => {
      const data = { objectTypeField, conid, database, ...obj };
      const { primary, alternate } = getObjectActions(objectTypeField, lastUsedDefaultActions);
      return {
        key: `object:${objectTypeField}:${obj.schemaName}.${obj.pureName}`,
        group: 'objects',
        title: obj.pureName,
        searchText: obj.schemaName ? `${obj.schemaName}.${obj.pureName}` : null,
        meta: _.compact([showSchema && obj.schemaName, objectTypeLabel(objectTypeField)]).join(' · '),
        icon: databaseObjectIcons[objectTypeField],
        actionLabel: _tval(primary?.label) || _t('commandPalette.open', { defaultMessage: 'Open' }),
        altActionLabel: alternate ? _tval(alternate.label) : null,
        run: () => {
          handleObjectClick(data, 'keyEnter');
          focusTabWhenOpened(tab => matchDatabaseObjectAppObject(data, tab.props));
        },
        runAlt: alternate
          ? () => {
              openDatabaseObjectDetail(
                alternate.tab,
                null,
                {
                  ...data,
                  defaultActionId: alternate.defaultActionId,
                  isRawMode: alternate.isRawMode ?? false,
                },
                false,
                alternate.initialData,
                alternate.icon,
                data,
                false
              );
              focusTabWhenOpened(
                tab => tab.tabComponent == alternate.tab && matchDatabaseObjectAppObject(data, tab.props)
              );
            }
          : null,
      };
    }
  );
}

function tabDatabaseLabel(tab, connectionList) {
  const { conid, database, archiveFolder } = tab.props || {};
  if (conid && database && database != '_api_database_') return extractDbNameFromComposite(database);
  if (conid) {
    const connection = asArray(connectionList).find(x => x._id == conid);
    return connection ? getConnectionLabel(connection, { allowExplicitDatabase: false }) : null;
  }
  return archiveFolder || null;
}

function selectTab(tabid, reopen) {
  openedTabs.update(tabs =>
    setSelectedTabFunc(reopen ? tabs.map(x => (x.tabid == tabid ? { ...x, closedTime: undefined } : x)) : tabs, tabid)
  );
  handleAfterTabClick();
}

/** Open tabs in tab order, then recently closed ones, newest first */
export function buildTabItems(tabs, connectionList, closedLimit = 20): QuickSearchItem[] {
  const open = _.sortBy(
    asArray(tabs).filter(x => x.closedTime == null),
    x => x.tabOrder ?? 0
  );
  const closed = _.sortBy(
    asArray(tabs).filter(x => x.closedTime != null),
    x => -x.closedTime
  ).slice(0, closedLimit);

  return [
    ...open.map((tab): QuickSearchItem => ({
      key: `tab:${tab.tabid}`,
      group: 'tabs',
      title: tab.title,
      searchText: tabDatabaseLabel(tab, connectionList),
      meta: tabDatabaseLabel(tab, connectionList),
      icon: tab.icon,
      checked: !!tab.selected,
      actionLabel: _t('commandPalette.switchToTab', { defaultMessage: 'Switch to tab' }),
      run: () => selectTab(tab.tabid, false),
    })),
    ...closed.map((tab): QuickSearchItem => ({
      key: `tab:${tab.tabid}`,
      group: 'tabs',
      title: tab.title,
      searchText: tabDatabaseLabel(tab, connectionList),
      meta: _t('commandPalette.closedAgo', {
        defaultMessage: 'Closed {time}',
        values: { time: moment(tab.closedTime).fromNow() },
      }),
      icon: tab.icon,
      dimmed: true,
      actionLabel: _t('commandPalette.reopenTab', { defaultMessage: 'Reopen tab' }),
      run: () => selectTab(tab.tabid, true),
    })),
  ];
}

export function buildActionItems(commands): QuickSearchItem[] {
  return _.sortBy(
    Object.values(commands || {}).filter(
      (x: any) => x.enabled && !x.isGroupCommand && !x.id?.startsWith('commandPalette.')
    ),
    (x: any) => _tval(x.text)
  ).map((command: any): QuickSearchItem => {
    const name = _tval(command.name) || _tval(command.text);
    const category = _tval(command.category);
    return {
      key: `command:${command.id}`,
      group: 'actions',
      title: name,
      searchText: _tval(command.text),
      meta: category,
      icon: command.icon || 'icon action',
      quietIcon: !command.icon,
      keyText: command.keyText,
      subCommandsOf: command.getSubCommands ? command : null,
      actionLabel: command.getSubCommands
        ? _t('commandPalette.showOptions', { defaultMessage: 'Show options' })
        : _t('commandPalette.run', { defaultMessage: 'Run' }),
      run: command.getSubCommands ? null : () => command.onClick(),
    };
  });
}

export function buildSubCommandItems(command): QuickSearchItem[] {
  return (command?.getSubCommands?.() || [])
    .filter(x => !x.isGroupCommand)
    .map((sub, index): QuickSearchItem => ({
      key: `sub:${index}:${_tval(sub.text)}`,
      group: 'actions',
      title: _tval(sub.text),
      icon: sub.icon || 'icon action',
      quietIcon: !sub.icon,
      keyText: sub.keyText,
      actionLabel: _t('commandPalette.run', { defaultMessage: 'Run' }),
      run: () => sub.onClick(),
    }));
}

function databaseItem(connection, name, currentDb, key): QuickSearchItem {
  const connectionLabel = getConnectionLabel(connection, { allowExplicitDatabase: false });
  return {
    key,
    group: 'connections',
    title: extractDbNameFromComposite(name),
    searchText: connectionLabel,
    meta: connectionLabel,
    icon: 'icon database',
    checked: currentDb?.connection?._id == connection._id && currentDb?.name == name,
    actionLabel: _t('commandPalette.useDatabase', { defaultMessage: 'Use database' }),
    altActionLabel: _t('commandPalette.newQueryInDatabase', { defaultMessage: 'New query' }),
    run: () => switchCurrentDatabase({ connection, name }),
    runAlt: async () => {
      await switchCurrentDatabase({ connection, name });
      newQuery();
    },
  };
}

/** Saved connections, each followed by its databases known from the last time it was open */
export function buildConnectionItems(connectionList, currentDb): QuickSearchItem[] {
  const connections = _.sortBy(
    asArray(connectionList).filter(x => !x.unsaved),
    x => getConnectionLabel(x).toUpperCase()
  );
  const res: QuickSearchItem[] = [];
  for (const connection of connections) {
    res.push({
      key: `connection:${connection._id}`,
      group: 'connections',
      title: getConnectionLabel(connection),
      meta: engineName(connection),
      connection,
      checked: !!connection.singleDatabase && currentDb?.connection?._id == connection._id,
      actionLabel: _t('commandPalette.connect', { defaultMessage: 'Connect' }),
      run: () => openConnection(connection),
    });
    if (connection.singleDatabase || getCurrentConfig()?.singleDbConnection) continue;
    for (const db of asArray(getLocalStorage(`database_list_${connection._id}`))) {
      res.push(databaseItem(connection, db.name, currentDb, `database:${connection._id}:${db.name}`));
    }
  }
  return res;
}

export function buildRecentDatabaseItems(recentDatabases, currentDb, connectionList, limit): QuickSearchItem[] {
  return _.compact(asArray(recentDatabases))
    .filter(x => x.connection && !(x.connection._id == currentDb?.connection?._id && x.name == currentDb?.name))
    .slice(0, limit)
    .map(x => {
      const connection = asArray(connectionList).find(c => c._id == x.connection._id) ?? x.connection;
      return databaseItem(connection, x.name, currentDb, `database:${connection._id}:${x.name}`);
    });
}

/** Matching items, best first, with the matched letters of the title marked */
export function matchItems(items: QuickSearchItem[], query: string): QuickSearchItem[] {
  if (!query?.trim()) {
    return items.map(item => ({ ...item, segments: [{ text: item.title ?? '', highlighted: false }] }));
  }
  const res = [];
  for (const item of items) {
    const match = fuzzyMatch(query, item.title);
    if (match) {
      res.push({ ...item, score: match.score, segments: fuzzySegments(item.title, match.indices) });
      continue;
    }
    // a match in the secondary text (schema, category, database) counts too, below any title match
    const secondary = item.searchText ? fuzzyMatch(query, item.searchText) : null;
    if (secondary) {
      res.push({ ...item, score: secondary.score - 5000, segments: [{ text: item.title, highlighted: false }] });
    }
  }
  return _.sortBy(res, x => -x.score);
}
