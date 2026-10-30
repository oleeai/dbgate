<script lang="ts" context="module">
  export const matchingProps = ['conid', 'database', 'schemaName'];
</script>

<script lang="ts">
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import { v1 as uuidv1 } from 'uuid';
  import ToolStripButton from '../buttons/ToolStripButton.svelte';
  import ToolStripContainer from '../buttons/ToolStripContainer.svelte';
  import SchemaVisualizer from '../schemaVisualizer/SchemaVisualizer.svelte';
  import { _t } from '../translations';
  import openNewTab from '../utility/openNewTab';

  export let conid;
  export let database;
  export let schemaName = null;

  let visualizer;

  // the diagram editor can save, export and annotate the same tables, laid out as they are here
  function handleOpenAsDiagram() {
    const tables = visualizer.getLayout().map(({ table, position }) => ({
      ...table,
      designerId: `${table.pureName}-${uuidv1()}`,
      left: Math.round(position.x),
      top: Math.round(position.y),
    }));
    // the diagram editor fills in references only when it arranges, so they are passed in here
    const references = [];
    for (const table of tables) {
      for (const fk of table.foreignKeys || []) {
        const target = tables.find(x => x.pureName == fk.refTableName && x.schemaName == fk.refSchemaName);
        if (!target) continue;
        references.push({
          designerId: uuidv1(),
          sourceId: table.designerId,
          targetId: target.designerId,
          joinType: '',
          columns: fk.columns.map(column => ({ source: column.columnName, target: column.refColumnName })),
        });
      }
    }

    openNewTab(
      {
        title: _t('database.diagram', { defaultMessage: 'Diagram #' }),
        icon: 'img diagram',
        tabComponent: 'DiagramTab',
        props: {
          conid,
          database,
        },
      },
      { editor: { tables, references } }
    );
  }
</script>

<ToolStripContainer>
  <SvelteFlowProvider>
    <SchemaVisualizer bind:this={visualizer} {conid} {database} {schemaName} />
  </SvelteFlowProvider>

  <svelte:fragment slot="toolstrip">
    <ToolStripButton
      icon="icon arrange"
      on:click={() => visualizer.arrange()}
      data-testid="SchemaVisualizerTab_arrange"
    >
      {_t('command.designer.arrange', { defaultMessage: 'Arrange' })}
    </ToolStripButton>
    <ToolStripButton
      icon="icon diagram"
      on:click={handleOpenAsDiagram}
      title={_t('schemaVisualizer.openAsDiagramTitle', {
        defaultMessage: 'Open these tables in the diagram editor to save or export them',
      })}
      data-testid="SchemaVisualizerTab_openAsDiagram"
    >
      {_t('schemaVisualizer.openAsDiagram', { defaultMessage: 'Open as diagram' })}
    </ToolStripButton>
  </svelte:fragment>
</ToolStripContainer>
