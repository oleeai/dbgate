<script lang="ts">
  import { BaseEdge, getBezierPath } from '@xyflow/svelte';
  import { getContext } from 'svelte';

  export let id;
  export let sourceX;
  export let sourceY;
  export let targetX;
  export let targetY;
  export let sourcePosition;
  export let targetPosition;
  export let selected = false;

  const highlight: any = getContext('schemaVisualizerHighlight');

  $: [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  $: isHighlighted = selected || $highlight.edgeIds.includes(id);
  $: markerSuffix = isHighlighted ? '-active' : '';
</script>

<!-- crow's foot (many) on the referencing column, a bar (one) on the referenced column -->
<BaseEdge
  {id}
  {path}
  class={isHighlighted ? 'relation highlighted' : 'relation'}
  markerStart={`url(#schema-visualizer-many${markerSuffix})`}
  markerEnd={`url(#schema-visualizer-one${markerSuffix})`}
  interactionWidth={14}
/>
