<script lang="ts">
  import { useDatabaseList } from '../utility/metadataLoaders';

  export let conid;

  $: databases = useDatabaseList({ conid });
</script>

<slot databases={$databases || []} />
