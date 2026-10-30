<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    ConnectionMode,
    Controls,
    MiniMap,
    SvelteFlow,
    useSvelteFlow,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import _ from 'lodash';
  import { setContext, tick } from 'svelte';
  import { get, writable } from 'svelte/store';
  import { GraphDefinition, GraphLayout } from '../designer/GraphLayout';
  import LoadingInfo from '../elements/LoadingInfo.svelte';
  import { currentThemeType } from '../plugins/themes';
  import { _t } from '../translations';
  import { useDatabaseInfo } from '../utility/metadataLoaders';
  import RelationEdge from './RelationEdge.svelte';
  import TableNode from './TableNode.svelte';

  export let conid;
  export let database;
  export let schemaName = null;

  const nodes = writable([]);
  const edges = writable([]);
  const nodeTypes = { table: TableNode };
  const edgeTypes = { relation: RelationEdge };

  // relations of the hovered or selected tables (or the hovered / selected line) are drawn in the accent color
  const highlight = writable({ edgeIds: [], columns: {} });
  setContext('schemaVisualizerHighlight', highlight);

  const { fitView } = useSvelteFlow();

  let hoveredNodeId = null;
  let hoveredEdgeId = null;
  let loadedStructure = null;
  let needsLayout = false;
  let isLaidOut = false;

  $: dbInfo = useDatabaseInfo({ conid, database });
  $: tables = _.sortBy(
    ($dbInfo?.tables || []).filter(table => !schemaName || table.schemaName == schemaName),
    ['schemaName', 'pureName']
  );
  $: loadTables(tables);

  // the layout needs the rendered table sizes
  $: if (needsLayout && $nodes.length > 0 && $nodes.every(node => node.measured?.width)) {
    needsLayout = false;
    arrange();
  }

  $: activeNodeIds = _.compact([hoveredNodeId, ...$nodes.filter(node => node.selected).map(node => node.id)]);
  $: highlight.set(getHighlight($edges, activeNodeIds, hoveredEdgeId));

  function getNodeId(schemaName, pureName) {
    return `${schemaName || ''}.${pureName}`;
  }

  function loadTables(tables) {
    const structure = JSON.stringify(
      tables.map(table => _.pick(table, ['schemaName', 'pureName', 'columns', 'primaryKey', 'foreignKeys']))
    );
    if (structure == loadedStructure) return;
    loadedStructure = structure;

    const showSchemaName = _.uniq(tables.map(table => table.schemaName)).length > 1;
    const oldNodes = _.keyBy(get(nodes), 'id');
    const newNodes = tables.map(table => {
      const id = getNodeId(table.schemaName, table.pureName);
      return {
        ...oldNodes[id],
        id,
        type: 'table',
        position: oldNodes[id]?.position ?? { x: 0, y: 0 },
        data: { table, conid, database, showSchemaName },
      };
    });

    const nodeIds = new Set(newNodes.map(node => node.id));
    const newEdges = [];
    for (const table of tables) {
      for (const fk of table.foreignKeys || []) {
        const source = getNodeId(table.schemaName, table.pureName);
        const target = getNodeId(fk.refSchemaName, fk.refTableName);
        if (!nodeIds.has(target) || !fk.columns?.length) continue;
        newEdges.push({
          id: `${source}|${fk.constraintName || fk.columns.map(x => x.columnName).join(',')}`,
          type: 'relation',
          source,
          target,
          sourceHandle: `${fk.columns[0].columnName}:right`,
          targetHandle: `${fk.columns[0].refColumnName}:left`,
          data: { columns: fk.columns },
        });
      }
    }

    // a new or removed table gets a fresh layout, a changed column list keeps the positions
    const sameTables = _.isEqual(_.sortBy(Object.keys(oldNodes)), _.sortBy([...nodeIds]));
    nodes.set(newNodes);
    edges.set(newEdges);
    if (sameTables && isLaidOut) {
      tick().then(updateEdgeSides);
    } else {
      isLaidOut = false;
      needsLayout = true;
    }
  }

  function getHighlight(edges, activeNodeIds, hoveredEdgeId) {
    const edgeIds = [];
    const columns = {};
    for (const edge of edges) {
      if (
        edge.id != hoveredEdgeId &&
        !edge.selected &&
        !activeNodeIds.includes(edge.source) &&
        !activeNodeIds.includes(edge.target)
      ) {
        continue;
      }
      edgeIds.push(edge.id);
      for (const column of edge.data?.columns || []) {
        columns[edge.source] = [...(columns[edge.source] || []), column.columnName];
        columns[edge.target] = [...(columns[edge.target] || []), column.refColumnName];
      }
    }
    return { edgeIds, columns };
  }

  /** Lines leave and enter tables on the sides facing each other; tables above each other use the nearer side. */
  function updateEdgeSides() {
    const nodeById = _.keyBy(get(nodes), 'id');
    let changed = false;
    const newEdges = get(edges).map(edge => {
      const source = nodeById[edge.source];
      const target = nodeById[edge.target];
      if (!source?.measured || !target?.measured) return edge;
      const sourceLeft = source.position.x;
      const sourceRight = sourceLeft + source.measured.width;
      const targetLeft = target.position.x;
      const targetRight = targetLeft + target.measured.width;
      let sourceSide = 'right';
      let targetSide = 'right';
      if (sourceRight + 40 <= targetLeft) {
        targetSide = 'left';
      } else if (targetRight + 40 <= sourceLeft) {
        sourceSide = 'left';
      } else if (Math.abs(sourceLeft - targetLeft) < Math.abs(sourceRight - targetRight)) {
        sourceSide = targetSide = 'left';
      }
      const sourceHandle = `${edge.data.columns[0].columnName}:${sourceSide}`;
      const targetHandle = `${edge.data.columns[0].refColumnName}:${targetSide}`;
      if (sourceHandle == edge.sourceHandle && targetHandle == edge.targetHandle) return edge;
      changed = true;
      return { ...edge, sourceHandle, targetHandle };
    });
    if (changed) edges.set(newEdges);
  }

  export async function arrange() {
    const currentNodes = get(nodes);
    const graph = new GraphDefinition();
    for (const node of currentNodes) {
      graph.addNode(node.id, node.measured?.width ?? 240, node.measured?.height ?? 160, null);
    }
    for (const edge of get(edges)) {
      graph.addEdge(edge.source, edge.target);
    }
    graph.initialize();
    const layout = GraphLayout.createCircle(graph).springyAlg().solveOverlaps().fixViewBox();

    nodes.set(
      currentNodes.map(node => {
        const layoutNode = layout.nodes[node.id];
        return layoutNode ? { ...node, position: { x: layoutNode.left, y: layoutNode.top } } : node;
      })
    );
    updateEdgeSides();
    isLaidOut = true;
    await tick();
    fitView({ padding: 0.08, maxZoom: 1, duration: 0 });
  }

  export function getLayout() {
    return get(nodes).map(node => ({ table: node.data.table, position: node.position }));
  }
</script>

<div class="wrapper" class:isLaidOut data-testid="SchemaVisualizer_canvas">
  {#if !$dbInfo}
    <LoadingInfo message={_t('schemaVisualizer.loading', { defaultMessage: 'Loading database structure' })} />
  {:else if tables.length == 0}
    <div class="empty">
      {_t('schemaVisualizer.noTables', { defaultMessage: 'There are no tables in this schema' })}
    </div>
  {:else}
    <SvelteFlow
      {nodes}
      {edges}
      {nodeTypes}
      {edgeTypes}
      colorMode={$currentThemeType == 'dark' ? 'dark' : 'light'}
      connectionMode={ConnectionMode.Loose}
      nodesConnectable={false}
      deleteKey={null}
      minZoom={0.1}
      maxZoom={2}
      attributionPosition="top-right"
      on:nodedrag={updateEdgeSides}
      on:nodedragstop={updateEdgeSides}
      on:nodemouseenter={e => (hoveredNodeId = e.detail.node.id)}
      on:nodemouseleave={() => (hoveredNodeId = null)}
      on:edgemouseenter={e => (hoveredEdgeId = e.detail.edge.id)}
      on:edgemouseleave={() => (hoveredEdgeId = null)}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.25}
        patternColor="var(--theme-schema-visualizer-grid-dot)"
      />
      <Controls showLock={false} />
      <MiniMap
        pannable
        zoomable
        width={180}
        height={120}
        nodeBorderRadius={6}
        nodeColor="var(--theme-ui-border-strong)"
        maskColor="color-mix(in srgb, var(--theme-designer-background) 70%, transparent)"
        bgColor="var(--theme-ui-overlay)"
      />
    </SvelteFlow>
  {/if}

  <svg class="markers" aria-hidden="true">
    <defs>
      {#each ['', '-active'] as suffix}
        <marker
          id={`schema-visualizer-many${suffix}`}
          viewBox="-12 -7 14 14"
          markerWidth="14"
          markerHeight="14"
          refX="0"
          refY="0"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path class="marker" class:active={!!suffix} d="M -10 0 L 0 -5 M -10 0 L 0 5 M -10 0 L 0 0" />
        </marker>
        <marker
          id={`schema-visualizer-one${suffix}`}
          viewBox="-12 -7 14 14"
          markerWidth="14"
          markerHeight="14"
          refX="0"
          refY="0"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path class="marker" class:active={!!suffix} d="M -7 -5 L -7 5" />
        </marker>
      {/each}
    </defs>
  </svg>
</div>

<style>
  .wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    background: var(--theme-designer-background);

    --xy-background-color: var(--theme-designer-background);
    --xy-edge-stroke: var(--theme-schema-visualizer-relation-stroke);
    --xy-edge-stroke-selected: var(--theme-ui-accent);
    --xy-edge-stroke-width: 1.5;
    --xy-minimap-background-color: var(--theme-ui-overlay);
    --xy-controls-button-background-color: var(--theme-ui-overlay);
    --xy-controls-button-background-color-hover: var(--theme-ui-surface-2);
    --xy-controls-button-color: var(--theme-ui-text-secondary);
    --xy-controls-button-color-hover: var(--theme-ui-text);
    --xy-controls-button-border-color: var(--theme-ui-border);
    --xy-controls-box-shadow: var(--theme-schema-visualizer-card-shadow);
    --xy-attribution-background-color: transparent;
  }
  .wrapper > :global(.svelte-flow) {
    flex: 1;
  }

  /* the first render only measures the tables, they are shown once arranged */
  .wrapper:not(.isLaidOut) :global(.svelte-flow__viewport) {
    opacity: 0;
  }

  .empty {
    margin: 50px;
    font-size: 16px;
    color: var(--theme-ui-text-secondary);
  }

  .wrapper :global(.svelte-flow__node-table) {
    padding: 0;
    border: none;
    background: transparent;
  }
  .wrapper :global(.svelte-flow__node-table:focus-visible) {
    outline: var(--theme-focus-outline);
    outline-offset: 2px;
    border-radius: var(--dim-radius-lg);
  }
  .wrapper :global(.svelte-flow__edge-path.relation) {
    transition:
      stroke var(--dim-transition-fast),
      stroke-width var(--dim-transition-fast);
  }
  .wrapper :global(.svelte-flow__edge-path.relation.highlighted) {
    stroke: var(--theme-ui-accent);
    stroke-width: 2;
  }
  .wrapper :global(.svelte-flow__edge.selectable) {
    cursor: pointer;
  }

  .wrapper :global(.svelte-flow__controls) {
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    overflow: hidden;
  }
  .wrapper :global(.svelte-flow__controls-button) {
    width: 28px;
    height: 28px;
  }
  .wrapper :global(.svelte-flow__minimap) {
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    overflow: hidden;
    box-shadow: var(--theme-schema-visualizer-card-shadow);
  }
  .wrapper :global(.svelte-flow__attribution) {
    opacity: 0.6;
  }

  .markers {
    position: absolute;
    width: 0;
    height: 0;
  }
  .marker {
    fill: none;
    stroke: var(--theme-schema-visualizer-relation-stroke);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .marker.active {
    stroke: var(--theme-ui-accent);
    stroke-width: 2;
  }

  @media (prefers-reduced-motion: reduce) {
    .wrapper :global(.svelte-flow__edge-path.relation) {
      transition: none;
    }
  }
</style>
