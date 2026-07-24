"use client";

// Reveal — staggered entry for table rows, cards, and page-mount transitions.
//
// V2 (perf audit): the previous impl imported `motion/react` which shipped a
// 40KB chunk to /admin/conversations/[id] for the equivalent of three opacity
// fades. This version uses a 1KB IntersectionObserver + CSS transitions. Same
// observable behavior, near-zero JS. Honors prefers-reduced-motion by leaving
// items in their final state.

import { useEffect, useRef, useState, type ReactNode } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function preferReduced(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function Reveal({
  children,
  index = 0,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  index?: number;
  as?: "div" | "li" | "tr" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (preferReduced()) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    // stagger — clamp to 320ms so a 50-row table doesn't wait 2s for the last row
    const delay = Math.min(index * 40, 320);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.setTimeout(() => setShown(true), delay);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index]);

  // When shown or reduced-motion: render the final state (no transform).
  // Otherwise: invisible until the observer fires.
  const style = shown
    ? undefined
    : {
        opacity: 0,
        transform: "translateY(6px)",
      };

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={style}
    >
      {children}
    </Tag>
  );
}
