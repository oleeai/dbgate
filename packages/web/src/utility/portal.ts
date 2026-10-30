// Moves a node to the screen root, so a fixed popover isn't trapped under the grid's sticky header cells.
export default function portal(node: HTMLElement) {
  const target = document.querySelector('.dbgate-screen') ?? document.body;
  target.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
