// One motion for every menu, popover and toast. They grow out of what was clicked with a critically damped
// spring and leave a little faster with an ease-out. Each animation starts from what is on screen right now,
// so closing a menu that is still opening (or reopening one that is closing) turns around without a jump.
// With reduced motion only a short fade is left.
//
// Use as Svelte transitions:  in:popoverIn={{ anchor: domTrigger }} out:popoverOut

export type MotionAnchor = Element | DOMRect | { x: number; y: number } | null | undefined;

export interface PopoverMotionParams {
  // the trigger (element, rect or point); the popover grows from its edge or corner nearest to it
  anchor?: MotionAnchor | (() => MotionAnchor);
  // pixels to rise from (toasts come up from below instead of growing from a trigger)
  rise?: number;
  // leave without animating, e.g. when another popover takes this one's place
  instant?: boolean | (() => boolean);
}

const ANIMATION_ID = 'olee-popover-motion';
const IN_MS = 210;
const OUT_MS = 140;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 90;
const START_SCALE = 0.96;
const END_SCALE = 0.98;
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';

let springEasing: string = null;

// x(t) = 1 - (1 + ωt)·e^(-ωt), a critically damped spring (no overshoot), sampled into a CSS linear() curve
function getSpringEasing() {
  if (springEasing) return springEasing;
  const omega = 7.5;
  const steps = 24;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(i == steps ? 1 : Number((1 - (1 + omega * t) * Math.exp(-omega * t)).toFixed(4)));
  }
  const easing = `linear(${points.join(', ')})`;
  springEasing = globalThis.CSS?.supports?.('animation-timing-function', easing) ? easing : EASE_OUT;
  return springEasing;
}

export function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function ownAnimations(node: Element): Animation[] {
  return node.getAnimations?.().filter(x => x.id == ANIMATION_ID) ?? [];
}

// what is on screen right now, including a running animation
function readState(node: Element) {
  const style = getComputedStyle(node);
  const opacity = parseFloat(style.opacity);
  const scale = parseFloat(style.scale);
  const y = parseFloat((style.translate || '').split(' ')[1]);
  return {
    opacity: isNaN(opacity) ? 1 : opacity,
    scale: isNaN(scale) ? 1 : scale,
    y: isNaN(y) ? 0 : y,
  };
}

function resolveAnchorRect(anchor: PopoverMotionParams['anchor']) {
  const value = typeof anchor == 'function' ? anchor() : anchor;
  if (!value) return null;
  if (value instanceof Element) return value.isConnected ? value.getBoundingClientRect() : null;
  if ('width' in value) return value;
  return { left: value.x, right: value.x, top: value.y, bottom: value.y };
}

// The popover's edge or corner nearest to the anchor: below a trigger it grows from its top edge, above it from
// its bottom edge, beside it (submenus) from the side. Along that edge it lines up with the anchor's middle.
function getTransformOrigin(node: Element, anchor: PopoverMotionParams['anchor']) {
  const a = resolveAnchorRect(anchor);
  if (!a) return null;
  // measured while the origin is 0 0, so the scale doesn't move the top left corner
  const r = node.getBoundingClientRect();
  const width = (node as HTMLElement).offsetWidth || r.width;
  const height = (node as HTMLElement).offsetHeight || r.height;
  if (!width || !height) return null;
  const clamp = (value, max) => Math.min(Math.max(value, 0), max);
  let x = clamp((a.left + a.right) / 2 - r.left, width);
  let y = clamp((a.top + a.bottom) / 2 - r.top, height);
  if (r.top >= a.bottom - 2) y = 0;
  else if (r.top + height <= a.top + 2) y = height;
  else if (r.left >= a.right - 2) x = 0;
  else if (r.left + width <= a.left + 2) x = width;
  return `${Math.round(x)}px ${Math.round(y)}px`;
}

function animate(node: Element, from, to, duration: number, easing: string, fill: FillMode) {
  // test DOMs (jsdom) have no Web Animations
  if (!node.animate) return;
  const animation = node.animate(
    [
      { opacity: from.opacity, scale: `${from.scale}`, translate: `0 ${from.y}px` },
      { opacity: to.opacity, scale: `${to.scale}`, translate: `0 ${to.y}px` },
    ],
    { duration, easing, fill }
  );
  animation.id = ANIMATION_ID;
}

export function popoverIn(node: HTMLElement, params: PopoverMotionParams = {}) {
  const reduced = prefersReducedMotion();
  const running = ownAnimations(node);
  const reversing = running.length > 0;
  const from = reversing
    ? readState(node)
    : { opacity: 0, scale: reduced ? 1 : START_SCALE, y: reduced ? 0 : (params.rise ?? 0) };
  running.forEach(x => x.cancel());
  node.style.pointerEvents = '';

  if (!reversing && !reduced && params.anchor) {
    // the popover may still be placed after it is inserted, so the origin is worked out before the first paint
    node.style.transformOrigin = '0 0';
    requestAnimationFrame(() => {
      const origin = getTransformOrigin(node, params.anchor);
      if (origin) node.style.transformOrigin = origin;
    });
  }

  const duration = Math.round((reduced ? FADE_IN_MS : IN_MS) * Math.max(0.5, 1 - from.opacity));
  animate(node, from, { opacity: 1, scale: 1, y: 0 }, duration, reduced ? EASE_OUT : getSpringEasing(), 'none');
  return { duration };
}

export function popoverOut(node: HTMLElement, params: PopoverMotionParams = {}) {
  const reduced = prefersReducedMotion();
  const instant = typeof params.instant == 'function' ? params.instant() : params.instant;
  const from = readState(node);
  ownAnimations(node).forEach(x => x.cancel());
  node.style.pointerEvents = 'none';
  if (instant) {
    animate(node, from, { ...from, opacity: 0 }, 1, 'linear', 'forwards');
    return { duration: 1 };
  }

  const duration = Math.max(1, Math.round((reduced ? FADE_OUT_MS : OUT_MS) * from.opacity));
  const to = reduced
    ? { ...from, opacity: 0 }
    : { opacity: 0, scale: Math.min(from.scale, END_SCALE), y: (params.rise ?? 0) / 2 };
  animate(node, from, to, duration, EASE_OUT, 'forwards');
  return { duration };
}
