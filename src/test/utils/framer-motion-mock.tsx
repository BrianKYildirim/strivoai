/**
 * Tag-agnostic `framer-motion` test double.
 *
 * WHY THIS EXISTS. Both waiting-surface suites used to inline a mock that
 * exported exactly `motion.div` + `useReducedMotion`. That is the same class of
 * defect as the prop-contract hole behind quick 260803-fxz: the mock silently
 * covered ONE tag, so the first `motion.h2` / `motion.span` / `AnimatePresence`
 * added to a component turned a real render into `undefined is not a function`
 * at suite level rather than a visible, single-line contract change.
 *
 * The `Proxy` makes coverage structural — `motion.<anything>` resolves to a
 * memoised forwardRef host element, so adding a tag to a component never again
 * requires a test edit.
 *
 * Everything that is NOT framer-motion-specific passes straight through to the
 * DOM: `className`, `style`, `role`, `aria-*`, `data-*`, `tabIndex`, `onKeyDown`
 * and `ref`. The focus trap, the `role="dialog"` locator and every
 * `data-testid` query depend on that passthrough.
 */
import React from 'react';

/**
 * Props framer-motion consumes itself. They are object/function-valued and React
 * would warn (or serialise garbage) if they reached a host element, so they are
 * dropped rather than forwarded.
 */
const MOTION_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'viewport',
  'layout',
  'layoutId',
  'layoutDependency',
  'layoutScroll',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'custom',
  'inherit',
  'transformTemplate',
  'onAnimationStart',
  'onAnimationComplete',
  'onUpdate',
  'onDragStart',
  'onDragEnd',
  'onLayoutAnimationComplete',
]);

type AnyProps = Record<string, unknown>;

function stripMotionProps(props: AnyProps): AnyProps {
  const next: AnyProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (MOTION_ONLY_PROPS.has(key)) continue;
    next[key] = value;
  }
  return next;
}

export function createFramerMotionMock() {
  const cache = new Map<string, React.ElementType>();

  const motion = new Proxy({} as Record<string, React.ElementType>, {
    get(_target, tag) {
      // Symbols reach this trap during module interop probing (`Symbol.toStringTag`,
      // `Symbol.iterator`). They are not element tags.
      if (typeof tag === 'symbol') return undefined;
      const name = String(tag);
      const cached = cache.get(name);
      if (cached) return cached;

      const Component = React.forwardRef<unknown, AnyProps>((props, ref) =>
        React.createElement(name, { ...stripMotionProps(props), ref }),
      );
      Component.displayName = `motion.${name}`;
      cache.set(name, Component);
      return Component;
    },
  });

  const AnimatePresence = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  AnimatePresence.displayName = 'AnimatePresence';

  return {
    motion,
    AnimatePresence,
    useReducedMotion: () => false,
  };
}
