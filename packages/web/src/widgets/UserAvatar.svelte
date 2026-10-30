<script lang="ts">
  import { getUserHue, getUserInitial } from '../utility/queryPanelTools';

  export let login;
  export let name = null;
  export let size = 14;
</script>

<span
  class="avatar"
  style:--avatar-hue={getUserHue(login)}
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:font-size={`${Math.round(size * 0.62)}px`}
  aria-hidden="true">{getUserInitial(login, name)}</span
>

<style>
  .avatar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: oklch(0.6 0.11 var(--avatar-hue));
    color: #fff;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0;
  }
</style>
