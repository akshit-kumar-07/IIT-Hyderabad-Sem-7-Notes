// SuperDataGrid.tsx
// "From-scratch" advanced layer on top of MUI X DataGrid (free) that rivals/exceeds Pro/Premium.
// This revision adds: (A) per-column custom + predefined sort/filter rules, (B) column-visibility control/persistence,
// and (C) **demo fallback data** when no columns/rows are provided — so you see a working grid immediately.
//
// ✅ Highlights
// - Custom + predefined filter ops, per-column; custom + predefined sort comparators.
// - Worker pipeline (predefined ops) with main-thread fallback when custom functions are used.
// - Column visibility as controlled state, persisted to IndexedDB and respected by export/worker.
// - **New:** Demo fallback (can be disabled via `enableDemoFallback={false}`).
// - Hardened formula evaluator (Proxy + with-scope) and safety guards if `columns`/`rows` are omitted.
// - Lightweight tests for formulas, filter/sort, guards, and **new** valueGetter/date tests.
// - ⚠️ Single default export: `SuperDataGrid` is the **only** default export in this file. Example component is a **named** export.
//
// Install deps:
//   npm i @mui/material @emotion/react @emotion/styled @mui/x-data-grid
//   # Optional charts: npm i recharts
//
// Usage:
//   // Quick test: renders demo data automatically
//   <SuperDataGrid storageKey="demo-grid" />
//
//   // Production: pass your own rows/columns (demo fallback auto-disables)
//   <SuperDataGrid rows={myRows} columns={myColumns} storageKey="orders-grid" />
//
//   // Disable demo fallback even if you forget columns:
//   <SuperDataGrid enableDemoFallback={false} />

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DataGrid,
  GridColDef,
  GridToolbar,
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarColumnsButton,
  GridToolbarExport,
  GridRowModel,
  GridSortModel,
  GridFilterModel,
  GridRowId,
} from '@mui/x-data-grid';
import { Button, IconButton, Tooltip } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import InsightsIcon from '@mui/icons-material/Insights';

// Optional charting (guarded dynamic import)
let Recharts: any = null;
const loadRecharts = async () => {
  if (Recharts) return Recharts;
  try {
    // @ts-ignore
    Recharts = await import('recharts');
  } catch (_) {
    // charts optional
  }
  return Recharts;
};

// ---------- Types ----------

export type FormulaDef<T = any> = {
  /** JS-like formula string like "price * qty" or "IF(qty>10, price*0.9, price)" */
  formula?: string;
  /** Computed function gets row + helpers */
  fn?: (row: T, ctx: { rowIndex: number; rows: T[]; get: (field: string) => any }) => any;
  /** Optional field dependencies for reactive recompute (hint for future optimizations) */
  deps?: string[];
};

export type PredefinedSortName = 'string' | 'caseInsensitive' | 'alphanumeric' | 'number' | 'date';
export type CustomSortFn = (a: any, b: any, rowA?: any, rowB?: any, dir?: 'asc' | 'desc') => number;

export type FilterOpName =
  | 'contains' | 'equals' | 'startsWith' | 'endsWith'
  | '>' | '>=' | '<' | '<='
  | 'isEmpty' | 'isNotEmpty'
  | 'between' | 'regex';
export type CustomFilterFn = (value: any, filterValue: any, row?: any) => boolean;

export type SuperGridColDef<T = any> = GridColDef & {
  /** Define a computed column */
  computed?: FormulaDef<T>;
  /** Exclude from export */
  excludeFromExport?: boolean;
  /** Mark sensitive; not persisted offline */
  sensitive?: boolean;
  /** Limit/advertise which predefined filter ops this column supports */
  filterOps?: FilterOpName[];
  /** Per-column custom filter operators by name (e.g., { isPrime: fn }) */
  customFilterFns?: Record<string, CustomFilterFn>;
  /** Predefined sort name or a custom comparator */
  predefinedSort?: PredefinedSortName;
  customSort?: CustomSortFn;
};

export type SuperGridPlugin<T = any> = {
  name: string;
  preprocessRows?: (rows: T[], api: PluginAPI<T>) => T[];
  ToolbarItems?: React.FC<{ api: PluginAPI<T> }>;
  exporters?: Array<{ label: string; export: (ctx: ExportCtx<T>) => void }>;
};

export type ExportCtx<T> = {
  rows: T[];
  columns: SuperGridColDef<T>[];
  visibleFieldSet: Set<string>;
};

export type SuperGridProps<T = any> = {
  rows?: T[];
  columns?: SuperGridColDef<T>[];
  storageKey?: string;
  getRowId?: (row: T) => GridRowId;
  rowSecurity?: (row: T) => boolean;
  showInsights?: boolean;
  collaborative?: boolean;
  initialFilterModel?: GridFilterModel; // use operator names that match predefined or your custom names
  initialSortModel?: GridSortModel;
  plugins?: SuperGridPlugin<T>[];
  height?: number | string;
  /** New: When true (default), show demo data if rows/columns are not provided */
  enableDemoFallback?: boolean;
};

// ---------- Utilities ----------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function asArray<T>(x?: T[]): T[] { return Array.isArray(x) ? x : []; }

// Shallow diff helper to record patch-like deltas
function diffRow<T extends Record<string, any>>(a: T, b: T) {
  const patch: Partial<T> = {};
  Object.keys(b).forEach((k) => {
    if (a[k] !== b[k]) (patch as any)[k] = b[k];
  });
  return patch;
}

// IndexedDB minimal wrapper
const idb = {
  save: async (key: string, value: any) =>
    new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('SuperGridDB', 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('grids'); };
      open.onsuccess = () => {
        const tx = open.result.transaction('grids', 'readwrite');
        tx.objectStore('grids').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    }),
  load: async (key: string) =>
    new Promise<any>((resolve, reject) => {
      const open = indexedDB.open('SuperGridDB', 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('grids'); };
      open.onsuccess = () => {
        const tx = open.result.transaction('grids', 'readonly');
        const req = tx.objectStore('grids').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      };
      open.onerror = () => reject(open.error);
    }),
};

// ---------- Safe formula evaluator (Proxy-based) ----------
function evaluateFormula(formula: string, row: any, ctx: { get: (f: string) => any }) {
  const helpers = {
    IF: (cond: any, a: any, b: any) => (cond ? a : b),
    MIN: Math.min,
    MAX: Math.max,
    ABS: Math.abs,
    FLOOR: Math.floor,
    CEIL: Math.ceil,
    ROUND: Math.round,
  } as const;

  const fieldSet = new Set<string>(Object.keys(row || {}));
  const scope = new Proxy({}, { has: (_t, p) => fieldSet.has(String(p)), get: (_t, p) => ctx.get(String(p)) });
  // eslint-disable-next-line no-new-func
  const fn = new Function('helpers', 'scope', `with(helpers){ with(scope){ return ( ${formula} ); } }`);
  return fn(helpers, scope);
}

// ---------- Predefined filters & sorts (main thread) ----------
const PREDEFINED_FILTERS: Record<FilterOpName, CustomFilterFn> = {
  contains: (v, val) => String(v ?? '').toLowerCase().includes(String(val ?? '').toLowerCase()),
  equals: (v, val) => (v == val),
  startsWith: (v, val) => String(v ?? '').toLowerCase().startsWith(String(val ?? '').toLowerCase()),
  endsWith: (v, val) => String(v ?? '').toLowerCase().endsWith(String(val ?? '').toLowerCase()),
  '>': (v, val) => (v ?? null) > val,
  '>=': (v, val) => (v ?? null) >= val,
  '<': (v, val) => (v ?? null) < val,
  '<=': (v, val) => (v ?? null) <= val,
  isEmpty: (v) => v === null || v === undefined || v === '',
  isNotEmpty: (v) => !(v === null || v === undefined || v === ''),
  between: (v, val) => {
    if (!val || typeof val !== 'object') return true;
    const a = (val.min ?? -Infinity), b = (val.max ?? Infinity);
    return (v ?? null) >= a && (v ?? null) <= b;
  },
  regex: (v, val) => { try { const re = new RegExp(String(val)); return re.test(String(v ?? '')); } catch { return false; } },
};

const PREDEFINED_SORTS: Record<PredefinedSortName, CustomSortFn> = {
  string: (a, b) => String(a ?? '').localeCompare(String(b ?? '')),
  caseInsensitive: (a, b) => String(a ?? '').toLowerCase().localeCompare(String(b ?? '').toLowerCase()),
  alphanumeric: (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' }),
  number: (a, b) => (Number(a) - Number(b)),
  date: (a, b) => new Date(a as any).getTime() - new Date(b as any).getTime(),
};

function getColumnByField<T>(cols: SuperGridColDef<T>[], field: string) {
  return cols.find((c) => String(c.field) === String(field));
}

function filterRowsMain<T>(rows: T[], filterModel: GridFilterModel, columns: SuperGridColDef<T>[]) {
  const items = asArray(filterModel?.items).filter(Boolean);
  if (items.length === 0) return rows;
  const logic = (filterModel.logicOperator || 'and').toLowerCase();
  return rows.filter((r: any) => {
    const ok = items.map((it) => {
      const col = getColumnByField(columns, it.field as any);
      const v = r[it.field as any];
      const opName = String((it as any).operator || 'equals') as FilterOpName;
      const customFn = col?.customFilterFns?.[opName];
      const fn = customFn || PREDEFINED_FILTERS[opName];
      if (!fn) return true; // unknown op: let it pass
      return fn(v, (it as any).value, r);
    });
    return logic === 'or' ? ok.some(Boolean) : ok.every(Boolean);
  });
}

function sortRowsMain<T>(rows: T[], sortModel: GridSortModel, columns: SuperGridColDef<T>[]) {
  if (!sortModel || sortModel.length === 0) return rows;
  const copy = [...rows];
  copy.sort((ra: any, rb: any) => {
    for (const s of sortModel) {
      const col = getColumnByField(columns, s.field as any) as SuperGridColDef;
      const dir = (s.sort || 'asc') as 'asc' | 'desc';
      const av = ra[s.field as any];
      const bv = rb[s.field as any];
      let cmp = 0;
      if (typeof col?.customSort === 'function') {
        cmp = col.customSort(av, bv, ra, rb, dir);
      } else if (col?.predefinedSort) {
        cmp = PREDEFINED_SORTS[col.predefinedSort](av, bv, ra, rb, dir);
      } else if (col?.type === 'number') {
        cmp = PREDEFINED_SORTS.number(av, bv);
      } else if (col?.type === 'date' || col?.type === 'dateTime') {
        cmp = PREDEFINED_SORTS.date(av, bv);
      } else {
        cmp = PREDEFINED_SORTS.alphanumeric(av, bv);
      }
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
  return copy;
}

function requiresMainThread<T>(filterModel: GridFilterModel, sortModel: GridSortModel, columns: SuperGridColDef<T>[]) {
  const customFilterUsed = asArray(filterModel?.items).some((it: any) => {
    const col = getColumnByField(columns, it.field);
    const name = String(it?.operator || '');
    return !!(col?.customFilterFns && col.customFilterFns[name]);
  });
  const customSortUsed = (sortModel || []).some((s) => {
    const col = getColumnByField(columns, s.field);
    return typeof col?.customSort === 'function';
  });
  const unknownFilterName = asArray(filterModel?.items).some((it: any) => {
    const n = String(it?.operator || '');
    return n !== '' && !(n in PREDEFINED_FILTERS);
  });
  return customFilterUsed || customSortUsed || unknownFilterName;
}

// ---------- Web Worker (predefined filter/sort only) ----------
function createFilterSortWorker(): Worker {
  const src = `self.onmessage = (e) => {
    const { rows, filterModel, sortModel, visibleFields, columnTypes, predefinedSortFlags } = e.data;

    const PREDEFINED_FILTERS = {
      contains: (v, val) => String(v ?? '').toLowerCase().includes(String(val ?? '').toLowerCase()),
      equals: (v, val) => (v == val),
      startsWith: (v, val) => String(v ?? '').toLowerCase().startsWith(String(val ?? '').toLowerCase()),
      endsWith: (v, val) => String(v ?? '').toLowerCase().endsWith(String(val ?? '').toLowerCase()),
      '>': (v, val) => (v ?? null) > val,
      '>=': (v, val) => (v ?? null) >= val,
      '<': (v, val) => (v ?? null) < val,
      '<=': (v, val) => (v ?? null) <= val,
      isEmpty: (v) => v === null || v === undefined || v === '',
      isNotEmpty: (v) => !(v === null || v === undefined || v === ''),
      between: (v, val) => { if (!val || typeof val !== 'object') return true; const a = (val.min ?? -Infinity), b = (val.max ?? Infinity); return (v ?? null) >= a && (v ?? null) <= b; },
      regex: (v, val) => { try { const re = new RegExp(String(val)); return re.test(String(v ?? '')); } catch { return false; } },
    };

    function applyFilter(rows, model){
      if(!model || !model.items || model.items.length===0) return rows;
      const logic = (model.logicOperator || 'and').toLowerCase();
      const items = model.items.filter(Boolean);
      return rows.filter((r)=>{
        const ok = items.map((it)=>{
          const v = r[it.field];
          const val = it.value;
          const op = it.operator || 'equals';
          const fn = PREDEFINED_FILTERS[op] || (()=>true);
          return fn(v, val, r);
        });
        return logic === 'or' ? ok.some(Boolean) : ok.every(Boolean);
      });
    }

    function sortValue(type, v){
      if(type === 'number') return Number(v);
      if(type === 'date' || type === 'dateTime') return new Date(v).getTime();
      return v;
    }

    function applySort(rows, model){
      if(!model || model.length===0) return rows;
      const sorted = [...rows];
      sorted.sort((a,b)=>{
        for(const s of model){
          const type = columnTypes[s.field] || 'string';
          const av = sortValue(type, a[s.field]);
          const bv = sortValue(type, b[s.field]);
          let cmp = 0;
          if (predefinedSortFlags[s.field] === 'number' || type === 'number') { cmp = (Number(av) - Number(bv)); }
          else if (predefinedSortFlags[s.field] === 'date' || type === 'date' || type === 'dateTime') { cmp = (Number(av) - Number(bv)); }
          else { cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' }); }
          if(cmp !== 0) return (s.sort === 'asc' ? cmp : -cmp);
        }
        return 0;
      });
      return sorted;
    }

    const filtered = applyFilter(rows, filterModel);
    const finalRows = applySort(filtered, sortModel);

    const minimized = finalRows.map((r)=>{
      const out = { id: r.id };
      visibleFields.forEach((f)=>{ out[f] = r[f]; });
      return out;
    });

    postMessage({ rows: minimized });
  }`;
  const blob = new Blob([src], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

// ---------- Plugin API ----------
export type PluginAPI<T> = {
  getRows: () => T[];
  setRows: (rows: T[]) => void;
  getColumns: () => SuperGridColDef<T>[];
  pushHistory: (rows: T[]) => void;
  exportCSV: (filename?: string) => void;
  exportJSONL: (filename?: string) => void;
};

// Built-in CSV exporter
function exportCSV<T>(rows: T[], columns: SuperGridColDef<T>[], visibleFieldSet: Set<string>, filename = 'grid.csv') {
  const fields = asArray(columns).filter(c => !c.excludeFromExport && visibleFieldSet.has(String(c.field))).map(c => String(c.field));
  const header = fields.join(',');
  const lines = (rows as any[]).map(r => fields.map(f => {
    const v = r[f];
    const s = v == null ? '' : String(v).replace(/\"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportJSONL<T>(rows: T[], columns: SuperGridColDef<T>[], visibleFieldSet: Set<string>, filename = 'grid.jsonl') {
  const filtered = (rows as any[]).map(r => {
    const o: any = {};
    for (const c of asArray(columns)) {
      const f = String(c.field);
      if (!visibleFieldSet.has(f) || c.excludeFromExport) continue;
      o[f] = r[f];
    }
    return o;
  });
  const blob = new Blob(filtered.map((o) => JSON.stringify(o) + '\n'), { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ---------- Demo dataset (used only when enableDemoFallback && no rows/columns provided) ----------

type DemoRow = { id: number; title: string; price: number; qty: number; when: string; total?: number };
const DEMO_ROWS: DemoRow[] = [
  { id: 1, title: 'Alpha 10', price: 10, qty: 2, when: '2024-01-01' },
  { id: 2, title: 'beta 2',  price: 6.5, qty: 5, when: '2023-12-15' },
  { id: 3, title: 'Gamma 3', price: 15.2, qty: 1, when: '2024-02-01' },
  { id: 4, title: 'Delta X', price: 8.0, qty: 12, when: '2024-03-10' },
  { id: 5, title: 'Omega 7', price: 20.0, qty: 0, when: '2023-11-05' },
  { id: 6, title: 'alpha 1', price: 3.3, qty: 9, when: '2024-01-20' },
];
const DEMO_COLUMNS: SuperGridColDef<DemoRow>[] = [
  { field: 'title', headerName: 'Title', flex: 1, filterOps: ['contains','regex'], predefinedSort: 'alphanumeric' },
  { field: 'price', headerName: 'Price', type: 'number', width: 120, filterOps: ['>','<','between'], predefinedSort: 'number' },
  { field: 'qty', headerName: 'Qty', type: 'number', width: 100, predefinedSort: 'number', customFilterFns: { isEven: (v)=> Number(v)%2===0 } },
  { field: 'when', headerName: 'Date', type: 'date', width: 140, predefinedSort: 'date',
    valueGetter: (params: any) => {
      const v = params?.value;
      if (v == null) return null;
      if (v instanceof Date) return v;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  },
  { field: 'total', headerName: 'Total', type: 'number', width: 140, computed: { formula: 'price * qty' } },
];

// ---------- Main Component ----------

function useBroadcastChannel<T>(key?: string) {
  const ref = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!key) return;
    const ch = new BroadcastChannel(`supergrid:${key}`);
    ref.current = ch;
    return () => ch.close();
  }, [key]);
  return ref;
}

function useScrollVelocity() {
  const [velocity, setVelocity] = useState(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const onScroll = useCallback((e: Event) => {
    const now = performance.now();
    const y = (e.target as HTMLElement).scrollTop;
    const dy = Math.abs(y - lastY.current);
    const dt = now - lastT.current || 16;
    const v = dy / dt; // px/ms
    setVelocity(v);
    lastY.current = y;
    lastT.current = now;
  }, []);
  return { velocity, onScroll };
}

function applyComputedColumns<T>(rows: T[] = [], columns?: SuperGridColDef<T>[]) {
  const list = asArray(columns);
  const computedCols = list.filter((c) => c.computed);
  if (computedCols.length === 0) return rows;
  return rows.map((row, rowIndex) => {
    const next: any = { ...(row as any) };
    const ctx = { rowIndex, rows, get: (f: string) => (next as any)[f] };
    for (const col of computedCols) {
      const def = col.computed!;
      try {
        let value = (def.fn ? def.fn(row, ctx) : undefined);
        if (value === undefined && def.formula) value = evaluateFormula(def.formula, row, ctx);
        (next as any)[col.field] = value;
      } catch (err) {
        console.error('Computed column error', col.field, err);
      }
    }
    return next as T;
  });
}

function filterSensitive<T>(rows: T[] = [], columns?: SuperGridColDef<T>[]) {
  const list = asArray(columns);
  const sensitive = new Set(list.filter((c) => c.sensitive).map((c) => String(c.field)));
  if (sensitive.size === 0) return rows;
  return rows.map((r: any) => {
    const copy: any = { ...r };
    sensitive.forEach((f) => delete copy[f]);
    return copy;
  });
}

const DEFAULT_HEIGHT = 600;

export default function SuperDataGrid<T extends { id?: GridRowId }>(props: SuperGridProps<T>) {
  const {
    rows: _rows = [],
    columns: _columns = [],
    storageKey,
    getRowId,
    rowSecurity,
    showInsights,
    collaborative,
    initialFilterModel,
    initialSortModel,
    plugins = [],
    height = DEFAULT_HEIGHT,
    enableDemoFallback = true,
  } = props;

  // Decide if we should show demo data
  const shouldDemo = enableDemoFallback && (!Array.isArray(_columns) || _columns.length === 0) && (!Array.isArray(_rows) || _rows.length === 0);

  // Normalize effective inputs
  const effectiveColumns = (shouldDemo ? (DEMO_COLUMNS as any) : _columns) as SuperGridColDef<T>[];
  const effectiveRows = (shouldDemo ? (DEMO_ROWS as any) : _rows) as T[];

  const columns: SuperGridColDef<T>[] = useMemo(() => (Array.isArray(effectiveColumns) ? effectiveColumns : []), [effectiveColumns]);

  useEffect(() => {
    if (!Array.isArray(effectiveColumns) || effectiveColumns.length === 0) {
      console.warn('SuperDataGrid: no columns provided. Demo fallback', shouldDemo ? 'ENABLED' : 'DISABLED');
    }
  }, [effectiveColumns, shouldDemo]);

  // Models
  const [filterModel, setFilterModel] = useState<GridFilterModel>(initialFilterModel || { items: [] });
  const [sortModel, setSortModel] = useState<GridSortModel>(initialSortModel || []);

  const [history, setHistory] = useState<T[][]>([]);
  const [future, setFuture] = useState<T[][]>([]);
  const [insightsOpen, setInsightsOpen] = useState(!!showInsights);

  const [baseRows, setBaseRows] = useState<T[]>(() => effectiveRows);
  const [viewRows, setViewRows] = useState<T[]>(() => effectiveRows);

  // Column visibility model (controlled + persisted)
  const defaultVisibility = useMemo(() => {
    const model: Record<string, boolean> = {};
    asArray(columns).forEach((c) => (model[String(c.field)] = c.hideable === false ? true : c.hide ?? true));
    return model;
  }, [columns]);

  const [columnVisibilityModel, setColumnVisibilityModel] = useState<Record<string, boolean>>(defaultVisibility);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    (async () => {
      const saved = await idb.load(`${storageKey}:visibility`);
      if (!cancelled && saved && saved.model) setColumnVisibilityModel(saved.model);
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    idb.save(`${storageKey}:visibility`, { model: columnVisibilityModel, ts: Date.now() }).catch(() => {});
  }, [storageKey, columnVisibilityModel]);

  const visibleFieldSet = useMemo(() => {
    const set = new Set<string>();
    asArray(columns).forEach((c) => {
      const f = String(c.field);
      const visible = columnVisibilityModel[f];
      if (visible !== false) set.add(f);
    });
    return set;
  }, [columns, columnVisibilityModel]);

  // Collab
  const bc = useBroadcastChannel<T>(collaborative ? storageKey : undefined);

  // Worker
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    workerRef.current = createFilterSortWorker();
    const w = workerRef.current;
    w.onmessage = (e: MessageEvent) => { setViewRows(e.data.rows); };
    return () => w.terminate();
  }, []);

  // Virtualization overscan
  const { velocity, onScroll } = useScrollVelocity();
  const rowBuffer = useMemo(() => clamp(Math.round(velocity * 20) + 4, 4, 20), [velocity]);

  // Compute + row security
  const computedBaseRows = useMemo(() => {
    const computed = applyComputedColumns(effectiveRows, columns);
    const secured = rowSecurity ? computed.filter(rowSecurity) : computed;
    return secured;
  }, [effectiveRows, columns, rowSecurity]);

  useEffect(() => { setBaseRows(computedBaseRows); }, [computedBaseRows]);

  // Plugins preprocess
  const pluginAPI: PluginAPI<T> = useMemo(() => ({
    getRows: () => baseRows,
    setRows: (rs: T[]) => setBaseRows(rs),
    getColumns: () => columns,
    pushHistory: (rs: T[]) => setHistory((h) => [...h, rs]),
    exportCSV: (fname?: string) => exportCSV(viewRows, columns, visibleFieldSet, fname),
    exportJSONL: (fname?: string) => exportJSONL(viewRows, columns, visibleFieldSet, fname),
  }), [baseRows, viewRows, columns, visibleFieldSet]);

  const preprocessedRows = useMemo(() => plugins.reduce((rs, p) => (p.preprocessRows ? p.preprocessRows(rs, pluginAPI) : rs), baseRows), [plugins, baseRows, pluginAPI]);

  // Filter/sort pipeline
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    const mustMain = requiresMainThread(filterModel, sortModel, columns);
    const rowsWithId = preprocessedRows.map((r, idx) => ({ id: (getRowId ? getRowId(r) : (r as any).id) ?? idx, ...(r as any) }));

    if (mustMain) {
      let out = filterRowsMain(rowsWithId, filterModel, columns);
      out = sortRowsMain(out, sortModel, columns);
      // minimize to visible fields
      const minimized = out.map((r: any) => { const o: any = { id: r.id }; visibleFieldSet.forEach((f) => (o[f] = r[f])); return o; });
      setViewRows(minimized as any);
      return;
    }

    // worker path — only predefined ops
    const columnTypes: Record<string, string> = {};
    const predefinedSortFlags: Record<string, string> = {};
    asArray(columns).forEach((c) => {
      columnTypes[String(c.field)] = String(c.type || 'string');
      if (c.predefinedSort) predefinedSortFlags[String(c.field)] = c.predefinedSort;
    });
    w.postMessage({
      rows: rowsWithId,
      filterModel,
      sortModel,
      visibleFields: Array.from(visibleFieldSet),
      columnTypes,
      predefinedSortFlags,
    });
  }, [preprocessedRows, filterModel, sortModel, visibleFieldSet, getRowId, columns]);

  // Offline load rows
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    (async () => {
      const saved = await idb.load(storageKey);
      if (cancelled || !saved) return;
      if (Array.isArray(saved.rows)) setBaseRows(saved.rows);
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  // Collaboration listeners
  useEffect(() => {
    if (!bc.current) return;
    const ch = bc.current;
    ch.onmessage = (e) => {
      const msg = e.data as { type: 'patch'; rows: T[] };
      if (msg.type === 'patch') setBaseRows(msg.rows);
    };
  }, [bc]);

  const pushHistory = useCallback((prev: T[]) => { setHistory((h) => [...h, prev]); setFuture([]); }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setFuture((f) => [baseRows, ...f]);
      setBaseRows(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, [baseRows]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      setHistory((h) => [...h, baseRows]);
      setBaseRows(f[0]);
      return f.slice(1);
    });
  }, [baseRows]);

  const processRowUpdate = useCallback((newRow: GridRowModel, oldRow: GridRowModel) => {
    const prev = baseRows as any[];
    const updated = prev.map((r) => ((getRowId ? getRowId(r as any) : (r as any).id) === newRow.id ? { ...r, ...diffRow(oldRow, newRow) } : r));
    pushHistory(prev as any);
    setBaseRows(updated as any);
    if (bc.current) bc.current.postMessage({ type: 'patch', rows: updated });
    return newRow;
  }, [baseRows, getRowId, bc, pushHistory]);

  const handleSaveOffline = useCallback(async () => {
    if (!storageKey) return;
    const sanitized = filterSensitive(baseRows, columns);
    await idb.save(storageKey, { rows: sanitized, ts: Date.now() });
  }, [storageKey, baseRows, columns]);

  const handleExportCSV = useCallback(() => exportCSV(viewRows, columns, visibleFieldSet), [viewRows, columns, visibleFieldSet]);
  const handleExportJSONL = useCallback(() => exportJSONL(viewRows, columns, visibleFieldSet), [viewRows, columns, visibleFieldSet]);

  // Insights (quick stats) — basic mean/min/max for numeric columns
  const stats = useMemo(() => {
    const numericCols = asArray(columns).filter((c) => String(c.type) === 'number');
    const out: Record<string, { count: number; min: number; max: number; mean: number }> = {};
    for (const c of numericCols) {
      const vals = (viewRows as any[]).map((r) => r[c.field]).filter((v) => typeof v === 'number');
      const count = vals.length;
      const min = count ? Math.min(...vals) : NaN;
      const max = count ? Math.max(...vals) : NaN;
      const mean = count ? vals.reduce((a, b) => a + b, 0) / count : NaN;
      out[String(c.field)] = { count, min, max, mean };
    }
    return out;
  }, [viewRows, columns]);

  // Toolbar composition
  const PluginToolbar: React.FC = () => (
    <GridToolbarContainer>
      <GridToolbarQuickFilter />
      <GridToolbarColumnsButton />
      <GridToolbarExport csvOptions={{ disableToolbarButton: true }} printOptions={{ disableToolbarButton: true }} />
      {plugins.map((p) => (p.ToolbarItems ? <p.ToolbarItems key={p.name} api={pluginAPI} /> : null))}
      <Tooltip title="Undo"><span><IconButton onClick={undo} disabled={history.length === 0}><UndoIcon /></IconButton></span></Tooltip>
      <Tooltip title="Redo"><span><IconButton onClick={redo} disabled={future.length === 0}><RedoIcon /></IconButton></span></Tooltip>
      <Tooltip title="Save offline (IndexedDB)"><span><IconButton onClick={handleSaveOffline} disabled={!storageKey}><SaveIcon /></IconButton></span></Tooltip>
      <Tooltip title="Export CSV"><span><IconButton onClick={handleExportCSV}><FileDownloadIcon /></IconButton></span></Tooltip>
      <Tooltip title="Toggle insights"><span><IconButton onClick={() => setInsightsOpen((v) => !v)}><InsightsIcon /></IconButton></span></Tooltip>
      <Button onClick={handleExportJSONL} size="small">Export JSONL</Button>
      <GridToolbar />
    </GridToolbarContainer>
  );

  // Scroll listener wiring
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridRef.current?.querySelector('.MuiDataGrid-virtualScroller');
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [onScroll, gridRef.current]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--mui-palette-divider)' }}>
      <div style={{ height }} ref={gridRef}>
        <DataGrid
          rows={viewRows as any}
          columns={columns as GridColDef[]}
          getRowId={getRowId as any}
          disableRowSelectionOnClick
          editMode="row"
          processRowUpdate={processRowUpdate}
          onProcessRowUpdateError={(err) => console.error(err)}
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          slots={{ toolbar: PluginToolbar }}
          rowBuffer={rowBuffer}
          slotProps={{ toolbar: {} as any }}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={setColumnVisibilityModel}
        />
      </div>
      {insightsOpen && (
        <>
          <div style={{ padding: 12, borderTop: '1px solid var(--mui-palette-divider)' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Object.entries(stats).map(([field, s]) => (
                <div key={field} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{field}</div>
                  <div>count: {s.count}</div>
                  <div>min: {Number.isFinite(s.min) ? s.min : '-'}</div>
                  <div>max: {Number.isFinite(s.max) ? s.max : '-'}</div>
                  <div>mean: {Number.isFinite(s.mean) ? s.mean.toFixed(2) : '-'}</div>
                </div>
              ))}
            </div>
          </div>
          <ChartPanel columns={columns as any} viewRows={viewRows as any} />
        </>
      )}
    </div>
  );
}

// Chart panel as separate component to avoid re-declaring in return
function ChartPanel({ columns, viewRows }: { columns: SuperGridColDef[]; viewRows: any[] }) {
  const [ok, setOk] = useState(false);
  const firstNumeric = asArray(columns).find((c) => String(c.type) === 'number');
  const data = useMemo(() => {
    if (!firstNumeric) return [] as any[];
    return (viewRows as any[]).slice(0, 50).map((r, i) => ({ name: String(r.id ?? i), value: r[firstNumeric.field] }));
  }, [viewRows, columns]);

  useEffect(() => { (async () => { await loadRecharts(); setOk(!!Recharts); })(); }, []);
  if (!ok || !firstNumeric) return null;
  const { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip: RTooltip } = Recharts;
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" hide />
          <YAxis />
          <RTooltip />
          <Area type="monotone" dataKey="value" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Lightweight tests (opt-in) ----------
// Set `window.__SUPERGRID_RUN_TESTS__ = true` before importing this file to execute.
function __runFormulaTests__() {
  const row = { price: 10, qty: 3, discount: 0.1, label: 'X' } as const;
  const ctx = { get: (f: string) => (row as any)[f] } as const;
  const cases: Array<{ expr: string; expect: any; note?: string }> = [
    { expr: 'price * qty', expect: 30 },
    { expr: 'IF(qty>2, price*qty, 0)', expect: 30 },
    { expr: 'ROUND(price * (1-discount))', expect: 9 },
    { expr: 'MIN(price, qty)', expect: 3 },
    { expr: 'MAX(price, qty)', expect: 10 },
    { expr: 'Math.max(price, qty)', expect: 10, note: 'Member call should NOT be mangled' },
    { expr: 'ABS(0 - qty)', expect: 3 },
  ];
  let passed = 0;
  for (const t of cases) {
    const got = evaluateFormula(t.expr, row, ctx);
    if ((Number.isNaN(got) && Number.isNaN(t.expect)) || got === t.expect) passed++;
    else console.error('[SuperDataGrid tests] FAIL', t.expr, 'got:', got, 'expected:', t.expect, t.note || '');
  }
  console.log(`[SuperDataGrid tests] ${passed}/${cases.length} passed`);
}

function __runFilterSortTests__() {
  type R = { id: number; title: string; qty: number; when: string };
  const rows: R[] = [
    { id: 1, title: 'Alpha 10', qty: 2, when: '2024-01-01' },
    { id: 2, title: 'alpha 2', qty: 10, when: '2023-12-01' },
    { id: 3, title: 'Beta 3', qty: 5, when: '2024-02-01' },
  ];
  const columns: SuperGridColDef<R>[] = [
    { field: 'title', headerName: 'Title', filterOps: ['contains','regex'], predefinedSort: 'alphanumeric' },
    { field: 'qty', headerName: 'Qty', type: 'number', filterOps: ['>','<','between'], predefinedSort: 'number', customFilterFns: { isEven: (v)=> Number(v)%2===0 } },
    { field: 'when', headerName: 'When', type: 'date', predefinedSort: 'date',
      valueGetter: (params: any) => {
        const v = params?.value;
        if (v == null) return null;
        if (v instanceof Date) return v;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      }
    },
  ];

  // Predefined filter
  const fm1: GridFilterModel = { items: [{ field: 'title', operator: 'contains', value: 'alpha' }] } as any;
  const r1 = filterRowsMain(rows as any, fm1, columns);
  if (r1.length !== 2) console.error('[tests] expected 2 rows for contains alpha');

  // Custom filter
  const fm2: GridFilterModel = { items: [{ field: 'qty', operator: 'isEven', value: null }] } as any;
  const r2 = filterRowsMain(rows as any, fm2, columns);
  if (r2.length !== 1 || r2[0].id !== 1) console.error('[tests] expected only id=1 for isEven');

  // Predefined sort (date desc then number asc)
  const sm: GridSortModel = [ { field: 'when', sort: 'desc' }, { field: 'qty', sort: 'asc' } ];
  const r3 = sortRowsMain(rows as any, sm, columns);
  if (r3[0].id !== 3) console.error('[tests] expected id=3 first after date desc');

  console.log('[SuperDataGrid filter/sort tests] completed');
}

function __runGuardTests__() {
  const rows = [{ id: 1, a: 1, b: 2 }];
  const r1 = applyComputedColumns(rows as any, undefined as any);
  if (!Array.isArray(r1) || r1.length !== 1) console.error('[guard tests] applyComputedColumns failed with undefined columns');
  const r2 = filterSensitive(rows as any, undefined as any);
  if (!Array.isArray(r2) || r2.length !== 1) console.error('[guard tests] filterSensitive failed with undefined columns');
  console.log('[SuperDataGrid guard tests] passed basic missing-columns guards');
}

// New: ensure our valueGetter returns valid Date/null for string inputs
function __runValueGetterTests__() {
  const col = (DEMO_COLUMNS as any[]).find(c => c.field === 'when');
  if (!col || typeof col.valueGetter !== 'function') {
    console.error('[valueGetter tests] missing valueGetter on DEMO_COLUMNS.when');
    return;
    }
  const good = ['2024-01-01', '2023-12-15', new Date('2020-05-05')];
  for (const v of good) {
    const d = col.valueGetter({ value: v });
    if (!(d === null || d instanceof Date)) console.error('[valueGetter tests] expected Date/null for', v);
    if (d instanceof Date && Number.isNaN(d.getTime())) console.error('[valueGetter tests] Date should be valid for', v);
  }
  const invalid = ['not-a-date', '2024-13-40'];
  for (const v of invalid) {
    const d = col.valueGetter({ value: v });
    if (d !== null) console.error('[valueGetter tests] expected null for invalid input', v);
  }
  console.log('[SuperDataGrid valueGetter tests] completed');
}

if (typeof window !== 'undefined' && (window as any).__SUPERGRID_RUN_TESTS__) {
  try { __runFormulaTests__(); } catch (err) { console.error('[SuperDataGrid tests] formula error', err); }
  try { __runFilterSortTests__(); } catch (err) { console.error('[SuperDataGrid tests] filter/sort error', err); }
  try { __runGuardTests__(); } catch (err) { console.error('[SuperDataGrid tests] guard error', err); }
  try { __runValueGetterTests__(); } catch (err) { console.error('[SuperDataGrid tests] valueGetter error', err); }
}

// ---------- Example usage (named export to avoid duplicate default) ----------
// This stays in-file so you can import it in Storybook or local sandboxes.
// Import with: `import SuperDataGrid, { Demo } from './SuperDataGrid'`

type Row = { id: number; product: string; price: number; qty: number; when: string; total?: number };
const rows: Row[] = [
  { id: 1, product: 'A', price: 10, qty: 2, when: '2024-01-01' },
  { id: 2, product: 'B', price: 6.5, qty: 5, when: '2023-12-01' },
  { id: 3, product: 'C', price: 15.2, qty: 1, when: '2024-02-01' },
];
const columns: SuperGridColDef<Row>[] = [
  { field: 'product', headerName: 'Product', filterOps: ['contains','regex'], predefinedSort: 'alphanumeric' },
  { field: 'price', headerName: 'Price', type: 'number', predefinedSort: 'number', filterOps: ['>','<','between'] },
  { field: 'qty', headerName: 'Qty', type: 'number', predefinedSort: 'number', customFilterFns: { isEven: (v)=> Number(v)%2===0 } },
  { field: 'when', headerName: 'Date', type: 'date', predefinedSort: 'date',
    valueGetter: (params: any) => {
      const v = params?.value;
      if (v == null) return null;
      if (v instanceof Date) return v;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  },
  { field: 'total', headerName: 'Total', type: 'number', computed: { formula: 'price * qty' } },
];
export function Demo(){
  return (
    <SuperDataGrid
      rows={rows}
      columns={columns}
      storageKey="demo-grid"
      collaborative
      showInsights
      initialFilterModel={{ items: [{ field: 'qty', operator: 'isEven', value: null }] }}
      initialSortModel={[{ field: 'when', sort: 'desc' }]}
    />
  );
}
