"use client";

// Reveal — staggered entry for table rows, cards, and page-mount transitions.
// Uses motion/react's whileInView so items fade-in only when scrolled into
// view (not on mount thousands of rows deep). Honors prefers-reduced-motion
// via the library's useReducedMotion() hook: when the user has reduced motion
// on, the items render in their final state with zero transition.
//
// Per the redesign-skill canonical skeleton:
//   <ul><Reveal index={0}><li>…</li></Reveal> <Reveal index={1}><li>…</li></Reveal> …</ul>
// Each item is its own motion.div tagged with index → stagger = clamp(i*40ms, 0..320ms).

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function Reveal({
  children,
  index = 0,
  as = "div",
  className,
}: {
  children: ReactNode;
  index?: number;
  as?: "div" | "li" | "tr" | "article";
  className?: string;
}) {
  const reduce = useReducedMotion();

  // Motion wrapper. The library accepts any DOM element via the `as` prop
  // when using the `motion(component)` pattern, but typed properly here.
  const MotionTag = motion[as] as typeof motion.div;

  if (reduce) {
    // Reduced-motion: skip animation entirely, render the plain element so
    // no transform/opacity are applied. Avoids the fade altogether.
    return (
      <MotionTag className={className} style={{ opacity: 1 }}>
        {children}
      </MotionTag>
    );
  }

  // Stagger — clamp index*40ms to a 320ms max so 50-row tables don't wait
  // 2 seconds for the last row.
  const delay = Math.min(index * 0.04, 0.32);

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.32, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}

// RevealGroup — for staggering a known set of children without manually
// passing index to each. Use for page-mount cards (Login card, Usage grid).
export function RevealGroup({
  children,
  className,
  stagger = 0.06,
}: {
  children: ReactNode[];
  className?: string;
  stagger?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className}>
        {children.map((c, i) => (
          <div key={i} style={{ opacity: 1 }}>
            {c}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.32,
                delay: i * stagger,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {c}
            </motion.div>
          ))
        : children}
    </div>
  );
}
