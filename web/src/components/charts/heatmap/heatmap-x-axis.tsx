"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useHeatmap } from "./heatmap-context";
import {
  filterHeatmapTicksByLabelWidth,
  getHeatmapColumnMonthAnchor,
} from "./heatmap-utils";

export interface HeatmapXAxisProps {
  /** Additional class name for labels */
  className?: string;
}

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short" });

export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
}: HeatmapXAxisProps) {
  const { containerRef, data, margin, xScale } = useHeatmap();
  const [mounted, setMounted] = useState(false);
  const [fontEpoch, setFontEpoch] = useState(0);
  const measureRef = useMemo(() => ({ current: null as HTMLSpanElement | null }), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setFontEpoch((epoch) => epoch + 1));
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    document.fonts?.ready.then(refresh);
    document.fonts?.addEventListener("loadingdone", refresh);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", refresh);
    };
  }, [containerRef]);

  const labels = useMemo(() => {
    const ticks: { label: string; x: number; width: number; key: string }[] = [];
    let lastMonthKey = "";

    for (let columnIndex = 0; columnIndex < data.length; columnIndex++) {
      const column = data[columnIndex];
      if (!column) {
        continue;
      }

      const monthAnchor = getHeatmapColumnMonthAnchor(column);
      if (!monthAnchor) {
        continue;
      }

      const monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
      if (monthKey === lastMonthKey) {
        continue;
      }

      const label = monthFmt.format(monthAnchor);
      const measure = measureRef.current;
      if (!measure) return [];
      measure.textContent = label;
      ticks.push({
        label,
        x: margin.left + xScale(columnIndex),
        width: measure.getBoundingClientRect().width,
        key: monthKey,
      });
      lastMonthKey = monthKey;
    }

    return filterHeatmapTicksByLabelWidth(
      ticks,
      6,
      containerRef.current?.clientWidth ?? Number.POSITIVE_INFINITY
    );
  }, [containerRef, data, fontEpoch, margin.left, measureRef, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return createPortal(
    <>
      <span
        ref={(element) => { measureRef.current = element; }}
        aria-hidden="true"
        className={cn("pointer-events-none invisible absolute whitespace-nowrap text-chart-label text-xs", className)}
        style={{ top: 0, left: 0 }}
      />
      {labels.map((tick) => (
        <div
          className="pointer-events-none absolute"
          key={tick.key}
          style={{
            top: 0,
            left: tick.x,
            width: 0,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <span className={cn("whitespace-nowrap text-chart-label text-xs", className)}>
            {tick.label}
          </span>
        </div>
      ))}
    </>,
    container
  );
});

HeatmapXAxis.displayName = "HeatmapXAxis";

export default HeatmapXAxis;
