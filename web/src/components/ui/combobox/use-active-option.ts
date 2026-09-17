import { useCallback, useEffect, useMemo, useState } from "react";
import type { RegisteredItem } from "./context";

type MoveTarget = 1 | -1 | "first" | "last";

export function useActiveOption({
  open,
  query,
  value,
  enabledItems,
}: {
  open: boolean;
  query: string;
  value?: string;
  enabledItems: RegisteredItem[];
}) {
  const [activeValue, setActiveValue] = useState<string | null>(value ?? null)
  const visibleValues = useMemo(() => new Set(enabledItems.map((item) => item.value)), [enabledItems]);

  useEffect(() => {
    if (!open) return;
    setActiveValue((current) => (current && visibleValues.has(current) ? current : enabledItems[0]?.value));
  }, [enabledItems, open, query, visibleValues]);

  const moveActive = useCallback((target: MoveTarget) => {
    if (!enabledItems.length) return;
    setActiveValue((current) => {
      if (target === "first") return enabledItems[0].value;
      if (target === "last") return enabledItems[enabledItems.length - 1].value;
      const index = Math.max(0, enabledItems.findIndex((item) => item.value === current));
      return enabledItems[(index + target + enabledItems.length) % enabledItems.length].value;
    });
  }, [enabledItems]);

  return { activeValue, setActiveValue, moveActive };
}
