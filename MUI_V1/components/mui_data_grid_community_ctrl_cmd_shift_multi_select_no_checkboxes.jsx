import * as React from "react";
import { useMemo, useState } from "react";
import {
  DataGrid,
  type GridColDef,
  type GridRowParams,
  type GridSelectionModel,
  type GridRowId,
} from "@mui/x-data-grid";

/**
 * Community-only implementation of multi-row selection WITHOUT checkboxes.
 *
 * ✅ Works on MUI X DataGrid Community v5 and v6.
 *    - v5 uses `selectionModel` / `onSelectionModelChange` and `disableSelectionOnClick`.
 *    - v6 uses `rowSelectionModel` / `onRowSelectionModelChange` and `disableRowSelectionOnClick`.
 *
 * We use the v5-compatible props to avoid runtime mismatches like:
 *   "TypeError: can't access property 'size', e38.ids is undefined"
 * which can occur when mixing v6 prop names with a v5 grid.
 *
 * Interactions:
 * - Click      → selects the clicked row only (clears previous selection)
 * - Ctrl/Cmd   → toggles the clicked row in the selection (add/remove)
 * - Shift      → selects a RANGE from the last anchor to the clicked row
 * - Ctrl/Cmd+Shift → merges that range into the current selection
 *
 * Notes:
 * - Range selection order is based on the current order of the `rows` prop.
 *   If you enable client-side sorting/filtering, update `orderedIds` to match
 *   the grid's visible order (see comment near `orderedIds`).
 */

// ---------------- Demo data ----------------
interface Person {
  id: number;
  name: string;
  role: string;
  team: string;
}

const demoRows: Person[] = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  role: ["Engineer", "Designer", "PM", "Support"][i % 4],
  team: ["Alpha", "Beta", "Gamma"][i % 3],
}));

const columns: GridColDef[] = [
  { field: "id", headerName: "ID", width: 80 },
  { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
  { field: "role", headerName: "Role", width: 140 },
  { field: "team", headerName: "Team", width: 140 },
];

// ---------------- Utilities ----------------
const toArray = (value: unknown): GridSelectionModel => {
  if (Array.isArray(value)) return value as GridSelectionModel;
  if (value instanceof Set) return Array.from(value) as GridSelectionModel;
  if (value == null) return [];
  return [value as GridRowId];
};

function toggleId(ids: GridSelectionModel, id: GridRowId): GridSelectionModel {
  const set = new Set<GridRowId>(ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return Array.from(set);
}

function rangeBetween(idsInOrder: GridRowId[], a: GridRowId, b: GridRowId): GridRowId[] {
  const start = idsInOrder.indexOf(a);
  const end = idsInOrder.indexOf(b);
  if (start === -1 || end === -1) return [];
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  return idsInOrder.slice(lo, hi + 1);
}

export default function CommunityGridMultiSelectDemo() {
  const [rows] = useState<Person[]>(demoRows);

  // IMPORTANT: If you enable client-side sorting / filtering on the grid and
  // want Shift+click to follow the *visible* order, derive this from the grid's
  // API visible row ids instead of `rows.map((r) => r.id)`.
  const orderedIds = useMemo<GridRowId[]>(() => rows.map((r) => r.id), [rows]);

  // Always keep selection as an ARRAY of ids (GridSelectionModel) in state.
  const [selection, setSelection] = useState<GridSelectionModel>([]);
  const [anchorId, setAnchorId] = useState<GridRowId | null>(null);

  const handleRowClick = (params: GridRowParams, event: React.MouseEvent) => {
    const clickedId = params.id as GridRowId;
    const isCtrlLike = (event.ctrlKey || event.metaKey) && !event.shiftKey;
    const isShift = event.shiftKey;
    const isCtrlShift = (event.ctrlKey || event.metaKey) && event.shiftKey;

    if (isShift && anchorId != null) {
      const rangeIds = rangeBetween(orderedIds, anchorId, clickedId);

      if (isCtrlShift) {
        // Merge range into existing selection
        const merged = Array.from(new Set<GridRowId>([...selection, ...rangeIds]));
        setSelection(merged);
      } else {
        // Replace with range
        setSelection(rangeIds);
      }
    } else if (isCtrlLike) {
      // Toggle single id in/out
      setSelection((prev) => toggleId(prev, clickedId));
    } else {
      // Single selection
      setSelection([clickedId]);
    }

    setAnchorId(clickedId);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 space-y-3" data-testid="root">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Community Grid – Multi-Select (No Checkboxes)</div>
        <div className="text-sm opacity-80">
          Click = single · Ctrl/Cmd = add/remove · Shift = range · Ctrl/Cmd+Shift = merge range
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-2xl shadow text-sm border hover:shadow-md"
          onClick={() => setSelection([])}
          data-testid="clear-selection"
        >
          Clear selection ({selection.length})
        </button>
        {anchorId != null && (
          <div className="text-xs opacity-70" data-testid="anchor">Anchor: {String(anchorId)}</div>
        )}
      </div>

      <div style={{ height: 520, width: "100%" }} className="rounded-2xl overflow-hidden shadow">
        <DataGrid
          rows={rows}
          columns={columns}
          // v5-compatible controlled selection props. These are also accepted in v6 for backward compatibility.
          selectionModel={selection}
          onSelectionModelChange={(model) => setSelection(toArray(model))}
          disableSelectionOnClick // we handle selection ourselves via onRowClick
          onRowClick={handleRowClick}
          checkboxSelection={false}
          hideFooterSelectedRowCount
          density="compact"
        />
      </div>

      <div className="text-sm opacity-70">
        <p className="mb-2 font-medium">Implementation details</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            Selection is fully controlled via <code>selectionModel</code> (v5-compatible). We
            compute ranges using the current order of <code>rows</code> and a stored anchor (the
            last clicked id).
          </li>
          <li>
            If you enable client-side sorting/filtering, update <code>orderedIds</code> to reflect
            the visible order (e.g., via grid API) so Shift+click respects what the user sees.
          </li>
          <li>
            No checkboxes are used; all selection is driven by click + modifiers.
          </li>
        </ul>
      </div>

      {/* ---------------- Lightweight Tests (dev only) ---------------- */}
      {process.env.NODE_ENV !== "production" && (
        <TestArea orderedIds={orderedIds} />
      )}
    </div>
  );
}

/**
 * Lightweight runtime tests for the pure helpers.
 * These run only in development to avoid noisy console output in production.
 */
function TestArea({ orderedIds }: { orderedIds: GridRowId[] }) {
  React.useEffect(() => {
    try {
      // toggleId tests
      let out: GridSelectionModel = [];
      out = toggleId(out, 1); // add
      console.assert(JSON.stringify(out) === JSON.stringify([1]), "toggleId add failed");
      out = toggleId(out, 1); // remove
      console.assert(JSON.stringify(out) === JSON.stringify([]), "toggleId remove failed");

      // rangeBetween normal order
      const r1 = rangeBetween([1, 2, 3, 4, 5], 2, 4);
      console.assert(JSON.stringify(r1) === JSON.stringify([2, 3, 4]), "rangeBetween 2..4 failed");

      // rangeBetween reversed args
      const r2 = rangeBetween([1, 2, 3, 4, 5], 4, 2);
      console.assert(JSON.stringify(r2) === JSON.stringify([2, 3, 4]), "rangeBetween 4..2 failed");

      // rangeBetween with missing ids
      const r3 = rangeBetween([1, 2, 3, 4, 5], 99, 2);
      console.assert(r3.length === 0, "rangeBetween with missing id should be empty");

      // orderedIds sanity
      console.assert(Array.isArray(orderedIds) && orderedIds.length > 0, "orderedIds is not an array");

      // toArray normalizations
      console.assert(JSON.stringify(toArray([1, 2])) === JSON.stringify([1, 2]), "toArray array failed");
      console.assert(JSON.stringify(toArray(new Set([1, 2]))) === JSON.stringify([1, 2]), "toArray set failed");
      console.assert(JSON.stringify(toArray(null)) === JSON.stringify([]), "toArray null failed");
    } catch (e) {
      // Swallow in dev – keep grid running while still surfacing messages.
      console.error("Test failure:", e);
    }
  }, [orderedIds]);
  return null;
}
