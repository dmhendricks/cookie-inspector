import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

export function useSelection(visibleIds: readonly string[], keyboardEnabled: boolean) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const visibleIdIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < visibleIds.length; i++) m.set(visibleIds[i]!, i);
    return m;
  }, [visibleIds]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIdIndex.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setAnchorId((prev) => (prev && visibleIdIndex.has(prev) ? prev : null));
    setFocusId((prev) => (prev && visibleIdIndex.has(prev) ? prev : null));
  }, [visibleIdIndex]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
    setFocusId(null);
  }, []);

  const selectOnly = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
    setAnchorId(id);
    setFocusId(id);
  }, []);

  /** Keep multi-select when right-clicking inside it; otherwise select the target row. */
  const prepareContextMenu = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearSelection();
        return;
      }
      if (selectedIds.size < 2 && !selectedIds.has(id)) {
        selectOnly(id);
      }
    },
    [clearSelection, selectOnly, selectedIds],
  );

  useEffect(() => {
    if (!keyboardEnabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
        if (inEditable) return;
        e.preventDefault();
        setSelectedIds(new Set(visibleIds));
        setAnchorId(visibleIds[0] ?? null);
        setFocusId(visibleIds[visibleIds.length - 1] ?? null);
        return;
      }

      if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        if (inEditable) return;
        if (visibleIds.length === 0) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const curFocusIdx = focusId !== null ? visibleIdIndex.get(focusId) : undefined;
        const curAnchorIdx = anchorId !== null ? visibleIdIndex.get(anchorId) : undefined;
        let nextFocusIdx: number;
        let nextAnchorIdx: number;
        if (curFocusIdx !== undefined && curAnchorIdx !== undefined) {
          nextFocusIdx = Math.max(0, Math.min(visibleIds.length - 1, curFocusIdx + dir));
          nextAnchorIdx = curAnchorIdx;
        } else {
          nextFocusIdx = dir === 1 ? 0 : visibleIds.length - 1;
          nextAnchorIdx = nextFocusIdx;
        }
        e.preventDefault();
        const [lo, hi] =
          nextAnchorIdx < nextFocusIdx
            ? [nextAnchorIdx, nextFocusIdx]
            : [nextFocusIdx, nextAnchorIdx];
        setSelectedIds(new Set(visibleIds.slice(lo, hi + 1)));
        setAnchorId(visibleIds[nextAnchorIdx]!);
        setFocusId(visibleIds[nextFocusIdx]!);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    keyboardEnabled,
    visibleIds,
    visibleIdIndex,
    anchorId,
    focusId,
    clearSelection,
  ]);

  const onRowClick = useCallback(
    (e: MouseEvent, id: string) => {
      const additive = e.ctrlKey || e.metaKey;
      const range = e.shiftKey;
      if (range && anchorId) {
        const a = visibleIdIndex.get(anchorId);
        const b = visibleIdIndex.get(id);
        if (a === undefined || b === undefined) {
          selectOnly(id);
          return;
        }
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(new Set(visibleIds.slice(lo, hi + 1)));
        setFocusId(id);
        return;
      }
      if (additive) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchorId(id);
        setFocusId(id);
        return;
      }
      selectOnly(id);
    },
    [anchorId, visibleIdIndex, visibleIds, selectOnly],
  );

  return {
    selectedIds,
    clearSelection,
    prepareContextMenu,
    onRowClick,
  };
}
