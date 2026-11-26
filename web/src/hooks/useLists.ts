import { useEffect, useState } from "react";

export function useLists(initialActiveList: string | null = null) {
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const [customLists, setCustomLists] = useState<Record<string, number[]>>({});
  const [activeList, setActiveList] = useState<string | null>(initialActiveList);

  useEffect(() => {
    fetch("/api/saved")
      .then((r) => (r.ok ? r.json() : { saved_ids: [] }))
      .then((d) => {
        if (Array.isArray(d.saved_ids)) setSavedIds(d.saved_ids);
      })
      .catch(() => {});

    fetch("/api/hidden")
      .then((r) => (r.ok ? r.json() : { hidden_ids: [] }))
      .then((d) => {
        if (Array.isArray(d.hidden_ids)) setHiddenIds(d.hidden_ids);
      })
      .catch(() => {});

    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : { lists: {} }))
      .then((d) => {
        if (d && typeof d.lists === "object") setCustomLists(d.lists);
      })
      .catch(() => {});
  }, []);

  const toggleSave = async (id: number) => {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      const resp = await fetch(`/api/saved/${id}`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.saved_ids)) setSavedIds(data.saved_ids);
      }
    } catch {
      // Keep optimistic state
    }
  };

  const toggleHide = async (id: number) => {
    setHiddenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      const resp = await fetch(`/api/hidden/${id}`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.hidden_ids)) setHiddenIds(data.hidden_ids);
      }
    } catch {
      // Keep optimistic state
    }
  };

  const createCustomList = async (name: string, initialId?: number) => {
    const clean = name.trim();
    if (!clean) return;
    setCustomLists((prev) => ({
      ...prev,
      [clean]:
        initialId != null
          ? Array.from(new Set([...(prev[clean] || []), initialId]))
          : prev[clean] || [],
    }));
    try {
      if (initialId != null) {
        const resp = await fetch(`/api/lists/${encodeURIComponent(clean)}/toggle/${initialId}`, {
          method: "POST",
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.lists) setCustomLists(data.lists);
        }
      } else {
        const resp = await fetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clean }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.lists) setCustomLists(data.lists);
        }
      }
    } catch {
      // Keep optimistic state
    }
  };

  const toggleInCustomList = async (listName: string, id: number) => {
    setCustomLists((prev) => {
      const cur = prev[listName] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [listName]: next };
    });
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(listName)}/toggle/${id}`, {
        method: "POST",
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.lists) setCustomLists(data.lists);
      }
    } catch {
      // Keep optimistic state
    }
  };

  const deleteCustomList = async (listName: string) => {
    setCustomLists((prev) => {
      const next = { ...prev };
      delete next[listName];
      return next;
    });
    if (activeList === listName) setActiveList(null);
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(listName)}`, { method: "DELETE" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.lists) setCustomLists(data.lists);
      }
    } catch {
      // Keep optimistic state
    }
  };

  return {
    savedIds,
    hiddenIds,
    customLists,
    activeList,
    setActiveList,
    toggleSave,
    toggleHide,
    createCustomList,
    toggleInCustomList,
    deleteCustomList,
  };
}
