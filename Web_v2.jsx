import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  FileText,
  Clock3,
  Trash2,
  Settings,
  LogOut,
  User,
  CalendarRange,
  ChevronDown,
  Search,
  X,
} from "lucide-react";

/**
 * DocFlow • Ultra-minimal, elegant, and fast document workspace
 * -------------------------------------------------------------
 * Highlights
 * - Sidebar navigation (icons-only by default) ✅
 * - Top-right user controls (profile, quit) ✅
 * - Overview board with 4 smart status cards showing live counts & micro-trends ✅
 * - Clicking a card opens a lightweight POP-UP Explorer with: ✅
 *    • A segmented tab selector (Processed / Unprocessed / In Processing / Trash)
 *    • Grid table for the selected status (each tab renders its own component)
 *    • Native-fast date range filter + quick picks (7d / 30d / All)
 *    • Search-as-you-type filter
 * - Components mount only when needed (lazy + Suspense). Pop-up unmounts on close ✅
 * - Keyboard shortcuts: [1..4] open status, ESC closes Explorer, '/' focuses search ✅
 * - Pure React + Tailwind + Framer Motion + Lucide icons ✅
 */

// ---------- Types ----------
/** @typedef {"processed"|"unprocessed"|"in-processing"|"trash"} Status */

// ---------- Utilities ----------
const cn = (...xs) => xs.filter(Boolean).join(" ");

const formatDate = (d) =>
  new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const inRange = (dateISO, start, end) => {
  const t = new Date(dateISO).setHours(0, 0, 0, 0);
  const s = start ? new Date(start).setHours(0, 0, 0, 0) : -Infinity;
  const e = end ? new Date(end).setHours(23, 59, 59, 999) : Infinity;
  return t >= s && t <= e;
};

// ---------- Sample Data ----------
const OWNERS = ["Aditi", "Ishaan", "Mina", "Ravi", "Lea", "Omar"];
const TITLES = [
  "Quarterly Report",
  "Supplier Contract",
  "Invoice Batch",
  "HR Onboarding",
  "R&D Notes",
  "Design Spec",
  "NDA Draft",
  "Audit Log",
  "Purchase Order",
  "Campaign Plan",
];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDateWithin = (daysBack = 120) => {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - daysBack);
  const t = rand(past.getTime(), now.getTime());
  return new Date(t).toISOString();
};
const makeDoc = (id, status) => ({
  id,
  title: `${TITLES[rand(0, TITLES.length - 1)]} #${String(id).padStart(3, "0")}`,
  status,
  sizeKB: rand(20, 2400),
  owner: OWNERS[rand(0, OWNERS.length - 1)],
  updatedAt: randomDateWithin(180),
});
const generateDocuments = () => {
  const docs = [];
  let id = 1;
  const add = (n, status) => { for (let i = 0; i < n; i++) docs.push(makeDoc(id++, status)); };
  add(34, "processed");
  add(21, "unprocessed");
  add(13, "in-processing");
  add(9, "trash");
  return docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
};

// ---------- Micro Sparkline (inline, zero-deps) ----------
function Spark({ points = [] }) {
  if (!points.length) return null;
  const w = 90, h = 24, pad = 2;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - pad * 2) + pad);
  const min = Math.min(...points), max = Math.max(...points);
  const ys = points.map((v) => {
    const n = (v - min) / (max - min || 1);
    return h - pad - n * (h - pad * 2);
  });
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} className="opacity-80">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Shared DataTable ----------
function DataTable({ data }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50/90 backdrop-blur">
            <tr className="text-left text-gray-600">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="group border-t border-gray-100 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 opacity-70" aria-hidden />
                    <span className="font-medium text-gray-900">{row.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.owner}</td>
                <td className="px-4 py-3 text-gray-700">{Math.round(row.sizeKB)} KB</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(row.updatedAt)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                  No documents match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Tab Components (each is its own component) ----------
const ProcessedTab = React.memo(function ProcessedTab({ rows }) { return <DataTable data={rows} />; });
const UnprocessedTab = React.memo(function UnprocessedTab({ rows }) { return <DataTable data={rows} />; });
const InProcessingTab = React.memo(function InProcessingTab({ rows }) { return <DataTable data={rows} />; });
const TrashTab = React.memo(function TrashTab({ rows }) { return <DataTable data={rows} />; });

// Lazy wrappers (keeps API, mounts only when used)
const LazyProcessed = lazy(() => Promise.resolve({ default: ProcessedTab }));
const LazyUnprocessed = lazy(() => Promise.resolve({ default: UnprocessedTab }));
const LazyInProcessing = lazy(() => Promise.resolve({ default: InProcessingTab }));
const LazyTrash = lazy(() => Promise.resolve({ default: TrashTab }));

// ---------- User Menu ----------
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const l = (e) => { if (!ref.current) return; if (!ref.current.contains(e.target)) handler?.(e); };
    document.addEventListener("mousedown", l);
    return () => document.removeEventListener("mousedown", l);
  }, [ref, handler]);
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useOnClickOutside(menuRef, () => setOpen(false));
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
          <User className="h-4 w-4" aria-hidden />
        </div>
        <span className="hidden sm:inline">You</span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
          >
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => alert("Profile")}> <User className="h-4 w-4" /> View profile</button>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => alert("Quit / Sign out")}> <LogOut className="h-4 w-4" /> Quit</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Segmented Tabs (inside Explorer) ----------
const TABS = [
  { key: "processed", label: "Processed" },
  { key: "unprocessed", label: "Unprocessed" },
  { key: "in-processing", label: "In Processing" },
  { key: "trash", label: "Trash" },
];

function SegmentedTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Status" className="inline-grid grid-flow-col gap-2 rounded-2xl bg-gray-100 p-1">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xl px-3 py-1.5 text-sm font-medium",
            value === key ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-200"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- Explorer POP-UP (Modal) ----------
function useKey(key, handler) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === key) handler(e); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler]);
}

function ExplorerModal({ open, onClose, allDocs, initialStatus }) {
  const [status, setStatus] = useState(/** @type {Status} */(initialStatus || "processed"));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const searchRef = useRef(null);

  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  // keyboard UX
  useKey("Escape", () => { if (open) onClose(); });
  useKey("/", (e) => { if (!open) return; e.preventDefault(); searchRef.current?.focus(); });

  // filtered rows
  const base = useMemo(() => allDocs.filter((d) => d.status === status), [allDocs, status]);
  const ranged = useMemo(() => (!from && !to ? base : base.filter((d) => inRange(d.updatedAt, from, to))), [base, from, to]);
  const rows = useMemo(() => (!q ? ranged : ranged.filter((d) => (d.title + d.owner).toLowerCase().includes(q.toLowerCase()))), [ranged, q]);

  // quick picks
  const pick = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  // modal body (portaled)
  if (!open) return null;
  return createPortal(
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
        <motion.div
          role="dialog"
          aria-modal
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-x-3 top-[6vh] z-50 mx-auto w-auto max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <SegmentedTabs value={status} onChange={setStatus} />
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden text-xs text-gray-500 sm:block">Quick picks:</div>
              <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => pick(7)}>7d</button>
              <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => pick(30)}>30d</button>
              <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => { setFrom(""); setTo(""); }}>All</button>
              <div className="mx-2 h-5 w-px bg-gray-200" />
              <label className="sr-only" htmlFor="from">From</label>
              <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/5" />
              <label className="sr-only" htmlFor="to">To</label>
              <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/5" />
              <div className="mx-2 h-5 w-px bg-gray-200" />
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm">
                <Search className="h-4 w-4 opacity-60" />
                <input ref={searchRef} placeholder="Search title or owner ( / )" value={q} onChange={(e) => setQ(e.target.value)} className="w-[160px] outline-none" />
              </div>
              <button aria-label="Close" onClick={onClose} className="ml-2 rounded-xl border border-gray-200 p-1 hover:bg-gray-50"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-gray-500">Loading…</div>}>
              {status === "processed" && <LazyProcessed rows={rows} />}
              {status === "unprocessed" && <LazyUnprocessed rows={rows} />}
              {status === "in-processing" && <LazyInProcessing rows={rows} />}
              {status === "trash" && <LazyTrash rows={rows} />}
            </Suspense>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ---------- Overview Cards ----------
function StatusCard({ title, total, trend, accent, onOpen, kbd }) {
  return (
    <button
      onClick={onOpen}
      onMouseEnter={onOpen /* prefetch by opening state with no render change */}
      className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">{kbd}</div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 flex items-end gap-2">
        <div className="text-2xl font-semibold leading-none text-gray-900">{total}</div>
        <div className="text-xs text-gray-500">docs</div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">last 14d</div>
        <div className={cn("text-gray-700", accent)}>
          <Spark points={trend} />
        </div>
      </div>
    </button>
  );
}

// ---------- Sidebar Nav ----------
function NavItem({ icon: Icon, label, active = false }) {
  return (
    <button className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm", active ? "bg-gray-900 text-white shadow" : "text-gray-700 hover:bg-gray-50")}>
      <Icon className="h-4 w-4" />
      <span className="hidden lg:inline font-medium">{label}</span>
    </button>
  );
}

// ---------- Root App ----------
export default function DocFlow() {
  const [allDocs, setAllDocs] = useState([]);
  const [booting, setBooting] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [initialStatus, setInitialStatus] = useState(/** @type {Status} */("processed"));

  // simulate data load
  useEffect(() => {
    const t = setTimeout(() => { setAllDocs(generateDocuments()); setBooting(false); }, 350);
    return () => clearTimeout(t);
  }, []);

  // counts & micro-trends
  const counts = useMemo(() => ({
    processed: allDocs.filter((d) => d.status === "processed").length,
    unprocessed: allDocs.filter((d) => d.status === "unprocessed").length,
    "in-processing": allDocs.filter((d) => d.status === "in-processing").length,
    trash: allDocs.filter((d) => d.status === "trash").length,
  }), [allDocs]);

  const trendFor = (status) => {
    // naive 14 bucket trend by day
    const days = 14; const buckets = Array.from({ length: days }, () => 0);
    const now = new Date().setHours(0,0,0,0);
    allDocs.forEach((d) => {
      if (d.status !== status) return;
      const diff = Math.floor((now - new Date(d.updatedAt).setHours(0,0,0,0)) / (1000*60*60*24));
      if (diff >= 0 && diff < days) buckets[days - diff - 1] += 1;
    });
    // flatten zero baseline for nicer sparkline
    return buckets.map((v) => v + 0.0001);
  };

  // keyboard shortcuts 1..4
  useKey("1", () => openExplorer("processed"));
  useKey("2", () => openExplorer("unprocessed"));
  useKey("3", () => openExplorer("in-processing"));
  useKey("4", () => openExplorer("trash"));

  function openExplorer(status) { setInitialStatus(status); setExplorerOpen(true); }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <div className="grid min-h-dvh grid-cols-[64px_1fr] lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="flex min-h-[56px] items-stretch border-r border-gray-200 bg-white">
          <div className="flex w-full flex-col">
            <div className="flex items-center gap-2 px-4 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-white shadow"><LayoutGrid className="h-4 w-4" /></div>
              <span className="hidden lg:block font-semibold tracking-tight">DocFlow</span>
            </div>
            <nav className="flex flex-1 flex-col gap-1 p-2">
              <NavItem icon={LayoutGrid} label="Overview" active />
              <NavItem icon={FileText} label="Archive" />
              <NavItem icon={Settings} label="Settings" />
              <div className="mt-auto p-2 text-[10px] text-gray-400">v1.1 • Minimal</div>
            </nav>
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-h-dvh flex-col">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-600"><CalendarRange className="h-4 w-4" /><span className="hidden sm:inline">Overview</span></div>
            <UserMenu />
          </header>

          {/* Overview board */}
          <section className="mx-auto w-full max-w-6xl px-4 py-8">
            {booting ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-3xl border border-gray-200 bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatusCard title="Processed" total={counts.processed} trend={trendFor("processed")} accent="text-emerald-600" onOpen={() => openExplorer("processed")} kbd="1" />
                <StatusCard title="Unprocessed" total={counts.unprocessed} trend={trendFor("unprocessed")} accent="text-amber-600" onOpen={() => openExplorer("unprocessed")} kbd="2" />
                <StatusCard title="In Processing" total={counts["in-processing"]} trend={trendFor("in-processing")} accent="text-sky-600" onOpen={() => openExplorer("in-processing")} kbd="3" />
                <StatusCard title="Trash" total={counts.trash} trend={trendFor("trash")} accent="text-rose-600" onOpen={() => openExplorer("trash")} kbd="4" />
              </div>
            )}

            <p className="mt-6 text-center text-xs text-gray-500">Tip: press 1–4 to open a status • press / to search • Esc to close</p>
          </section>

          {/* Explorer pop-up */}
          <ExplorerModal open={explorerOpen} onClose={() => setExplorerOpen(false)} allDocs={allDocs} initialStatus={initialStatus} />
        </main>
      </div>
    </div>
  );
}
