"use client";

import { motion, type Transition } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePopoverPortalPosition } from "@/components/ui/popover-position";
import { cn } from "@/lib/utils";
import { useComboboxContext } from "./context";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

// The panel uses one weighted spring for both directions, so opening and
// closing travel through the same detached geometry.
const COMBOBOX_MORPH: Transition = {
  type: "spring",
  duration: 0.5,
  bounce: 0.22,
};
const VIEWPORT_PADDING = 8;

export interface ComboboxContentProps {
  children: ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  avoidCollisions?: boolean;
  className?: string;
}

export function ComboboxContent({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  avoidCollisions = true,
  className,
}: ComboboxContentProps) {
  const context = useComboboxContext("ComboboxContent");
  const measureRef = useRef<HTMLDivElement>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [actualSide, setActualSide] = useState<Side>(side);
  const [morphReady, setMorphReady] = useState(false);
  const layout = usePopoverPortalPosition(
    context.triggerRef,
    measureRef,
    portalReady,
  );

  useEffect(() => setPortalReady(true), []);
  useLayoutEffect(() => {
    if (!portalReady) return;
    const readyFrame = requestAnimationFrame(() => setMorphReady(true));
    return () => cancelAnimationFrame(readyFrame);
  }, [portalReady]);

  useLayoutEffect(() => {
    // Preserve the resolved side during exit, so top panels close upward.
    if (!context.open || !layout) return;
    if (!avoidCollisions) {
      setActualSide(side);
      return;
    }
    const below =
      window.innerHeight - (layout.trigger.top + layout.trigger.height);
    const above = layout.trigger.top;
    if (
      side === "bottom" &&
      below < layout.content.height + sideOffset &&
      above > below
    )
      setActualSide("top");
    else if (
      side === "top" &&
      above < layout.content.height + sideOffset &&
      below > above
    )
      setActualSide("bottom");
    else setActualSide(side);
  }, [avoidCollisions, context.open, layout, side, sideOffset]);

  if (!portalReady) return null;

  const triggerLeft = layout?.trigger.left ?? 0;
  const triggerWidth = layout?.trigger.width ?? 0;
  const contentWidth = layout?.content.width ?? triggerWidth;
  const desiredLeft =
    align === "end"
      ? triggerLeft + triggerWidth - contentWidth
      : align === "center"
        ? triggerLeft + (triggerWidth - contentWidth) / 2
        : triggerLeft;
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - contentWidth - VIEWPORT_PADDING,
  );
  const left = Math.min(Math.max(desiredLeft, VIEWPORT_PADDING), maxLeft);
  const availableHeight = layout
    ? actualSide === "bottom"
      ? window.innerHeight - (layout.trigger.top + layout.trigger.height) - VIEWPORT_PADDING
      : layout.trigger.top - VIEWPORT_PADDING
    : 0;
  const surfaceHeight = layout
    ? Math.min(layout.content.height, Math.max(120, availableHeight))
    : 0;

  return createPortal(
    <motion.div
      ref={context.contentRef}
      data-combobox-content=""
      data-side={actualSide}
      aria-hidden={!context.open}
      inert={!context.open}
      initial={false}
      animate={{
        height: context.open ? surfaceHeight : 0,
        opacity: context.open ? 1 : 0,
        y: context.open
          ? actualSide === "bottom"
            ? sideOffset
            : -sideOffset
          : 0,
      }}
      transition={
        context.reduce || !morphReady ? { duration: 0 } : COMBOBOX_MORPH
      }
      style={
        {
          left,
          top:
            actualSide === "bottom" && layout
              ? layout.trigger.top + layout.trigger.height
              : undefined,
          bottom:
            actualSide === "top" && layout
              ? window.innerHeight - layout.trigger.top
              : undefined,
          minWidth: triggerWidth,
          pointerEvents: context.open ? "auto" : "none",
          transformOrigin: actualSide === "bottom" ? "top" : "bottom",
          visibility: layout ? "visible" : "hidden",
          maxHeight: surfaceHeight ? `${surfaceHeight}px` : "calc(100dvh - 16px)",
          "--combobox-trigger-width": `${triggerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        /* Was stock shadcn: `z-[9999]` with `border-border bg-background`. The
           9999 was solving a real problem (a portalled list has to clear the
           chart tooltips and sticky headers) but it also sat above the toaster,
           so an open combobox covered notifications. `z-overlay` is the same
           layer every other portalled overlay uses, and the list already wins
           against those because they are all at the same layer and it is last in
           the DOM.

           `bg-background`/`border-border` came off with it: this is a portalled
           overlay like any other, so it takes the overlay tier rather than the
           opaque stock one. */
        "glass-strong glass-sheen fixed z-overlay w-(--combobox-trigger-width) overflow-hidden rounded-control text-popover-foreground outline-none will-change-[height,transform]",
        className,
      )}
    >
      <motion.div
        ref={measureRef}
        initial={false}
        animate={{ opacity: context.open ? 1 : 0 }}
        transition={
          context.reduce || !morphReady ? { duration: 0 } : COMBOBOX_MORPH
        }
      >
        <div className="max-h-[inherit] overflow-y-auto overscroll-contain [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
