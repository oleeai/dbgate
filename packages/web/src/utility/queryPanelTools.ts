import moment from 'moment';
import { getConnectionLabel, removeSqlFrontMatter } from 'dbgate-tools';
import { _t } from '../translations';

// Formatting shared by the saved queries and query history panels

/** "now", "5m", "3h", "4d", then a date */
export function formatAgo(time: number) {
  if (!time) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return _t('queryPanel.justNow', { defaultMessage: 'now' });
  if (minutes < 60) return _t('queryPanel.minutesAgo', { defaultMessage: '{n}m', values: { n: minutes } });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return _t('queryPanel.hoursAgo', { defaultMessage: '{n}h', values: { n: hours } });
  const days = Math.floor(hours / 24);
  if (days < 7) return _t('queryPanel.daysAgo', { defaultMessage: '{n}d', values: { n: days } });
  return moment(time).format(moment(time).year() == moment().year() ? 'MMM D' : 'MMM D, YYYY');
}

/** "Today", "Yesterday", "Monday", "Oct 12" - the day headers of the history list */
export function formatDay(time: number) {
  const day = moment(time).startOf('day');
  const today = moment().startOf('day');
  const diff = today.diff(day, 'days');
  if (diff == 0) return _t('queryPanel.today', { defaultMessage: 'Today' });
  if (diff == 1) return _t('queryPanel.yesterday', { defaultMessage: 'Yesterday' });
  if (diff < 7) return day.format('dddd');
  return day.format(day.year() == today.year() ? 'MMM D' : 'MMM D, YYYY');
}

export function formatDateTime(time: number) {
  return time ? moment(time).format('lll') : '';
}

export function formatDuration(ms: number) {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatRowCount(count: number) {
  if (count == null) return '';
  return count == 1
    ? _t('queryPanel.oneRow', { defaultMessage: '1 row' })
    : _t('queryPanel.rows', { defaultMessage: '{count} rows', values: { count: count.toLocaleString() } });
}

/** The query without its front matter and leading blank lines, for previews */
export function getSqlPreview(sql: string) {
  return (removeSqlFrontMatter(sql) ?? sql ?? '').replace(/^\s*\n/, '').trimEnd();
}

export function getUserInitial(login: string, name?: string) {
  return ((name || login || '?').trim()[0] || '?').toUpperCase();
}

/** A stable hue per user, so a teammate keeps the same avatar color everywhere */
export function getUserHue(login: string) {
  let hash = 0;
  for (const char of login || '') hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function getConnectionName(connections: any[], conid: string) {
  const connection = (connections || []).find(x => x._id == conid);
  return connection ? getConnectionLabel(connection) : null;
}
