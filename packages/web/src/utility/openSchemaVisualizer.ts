import { extractDbNameFromComposite } from 'dbgate-tools';
import openNewTab from './openNewTab';
import { _t } from '../translations';

/** Opens the ER diagram of one schema, or of the whole database when schemaName is empty. */
export default function openSchemaVisualizer({ conid, database, schemaName = null }) {
  openNewTab({
    title: _t('schemaVisualizer.tabTitle', {
      defaultMessage: 'Schema: {name}',
      values: { name: schemaName || extractDbNameFromComposite(database) },
    }),
    icon: 'img diagram',
    tabComponent: 'SchemaVisualizerTab',
    props: {
      conid,
      database,
      schemaName,
    },
  });
}
