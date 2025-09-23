import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  FileText,
  Trash2,
  Settings,
  LogOut,
  User,
  CalendarRange,
  ChevronDown,
  Search,
  X,
  ArrowLeft,
} from "lucide-react";

/**
 * DocFlow • Inline Explorer + Process Search (v2 → v3)
 * ------------------------------------------------------------------
 * Changes vs original (v2):
 * 1) Process search added on the main page. Selecting a process
 *    filters the four status cards and trends. A compact stats strip
 *    appears for the chosen process.
 * 2) Clicking any of the four cards no longer opens a modal. Instead,
 *    the clicked card is highlighted and pinned at the top with a Back
 *    button, and the document grid (with date range + search) renders
 *    inline in the remainder of the page.
 * 3) Back button or ESC returns to the default four-card overview.
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

function useKey(key, handler) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === key) handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler]);
}

// ---------- Sample Data ----------
const CURRENT_USER = "You";
const OWNERS = [CURRENT_USER, "Aditi", "Ishaan", "Mina", "Ravi", "Lea", "Omar"];
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
  const add = (n, status) => {
    for (let i = 0; i < n; i++) docs.push(makeDoc(id++, status));
  };
  add(34, "processed");
  add(21, "unprocessed");
  add(13, "in-processing");
  add(9, "trash");
  return docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
};

// ---------- Micro Sparkline (inline, zero-deps) ----------
function Spark({ points = [] }) {
  if (!points.length) return null;
  const w = 90,
    h = 24,
    pad = 2;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - pad * 2) + pad);
  const min = Math.min(...points),
    max = Math.max(...points);
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

// ---------- "My Documents" panel (below cards) ----------
function MyDocsPanel({ docs, currentUser }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | processed | unprocessed | in-processing | trash

  const myDocs = useMemo(() => docs.filter((d) => d.owner === currentUser), [docs, currentUser]);

  const rows = useMemo(() => {
    let r = myDocs;
    if (tab !== "all") r = r.filter((d) => d.status === tab);
    if (q) {
      const n = q.toLowerCase();
      r = r.filter((d) => (d.title + d.owner).toLowerCase().includes(n));
    }
    return r;
  }, [myDocs, tab, q]);

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "rounded-full px-3 py-1 text-xs border",
        tab === id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">Your documents</span>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{myDocs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Tab id="all" label="All" />
          <Tab id="processed" label="Processed" />
          <Tab id="unprocessed" label="Unprocessed" />
          <Tab id="in-processing" label="In Processing" />
          <Tab id="trash" label="Trash" />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm">
        <Search className="h-4 w-4 opacity-60" />
        <input
          placeholder="Search your docs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full outline-none"
        />
      </div>

      <DataTable data={rows} />

      {myDocs.length === 0 && (
        <div className="text-sm text-gray-500">
          No documents currently assigned to you{docs.length ? " for this process" : ""}.
        </div>
      )}
    </div>
  );
}

// ---------- User Menu ----------
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const l = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) handler?.(e);
    };
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
        <ChevronDown className="h-4 w-4" aria-hidden />
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
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => alert("Profile")}>
              <User className="h-4 w-4" /> View profile
            </button>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => alert("Quit / Sign out")}>
              <LogOut className="h-4 w-4" /> Quit
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Process Picker (search-on-main) ----------
function ProcessPicker({ value, onChange, processes, inputRef }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return processes;
    return processes.filter((p) => p.toLowerCase().includes(needle));
  }, [q, processes]);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  return (
    <div className="relative w-full max-w-lg">
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm">
        <Search className="h-4 w-4 opacity-60" />
        <input
          ref={inputRef}
          placeholder="Search process ( / )"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full outline-none"
        />
        {value && (
          <button
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => {
              onChange(null);
              setQ("");
              setOpen(false);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
          role="listbox"
        >
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => {
              onChange(null);
              setQ("");
              setOpen(false);
            }}
          >
            All processes
          </button>
          {filtered.map((p) => (
            <button
              key={p}
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => {
                onChange(p);
                setQ(p);
                setOpen(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {value && (
        <div className="mt-2 text-xs text-gray-600">
          Filtering by process: <span className="font-medium">{value}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Inline Explorer (replaces modal) ----------
function InlineExplorer({
  status,
  docs, // already filtered by process
  onBack,
  searchRef,
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  useKey("Escape", () => onBack?.());

  const base = useMemo(() => docs.filter((d) => d.status === status), [docs, status]);
  const ranged = useMemo(
    () => (!from && !to ? base : base.filter((d) => inRange(d.updatedAt, from, to))),
    [base, from, to]
  );
  const rows = useMemo(
    () => (!q ? ranged : ranged.filter((d) => (d.title + d.owner).toLowerCase().includes(q.toLowerCase()))),
    [ranged, q]
  );

  const pick = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="hidden text-xs text-gray-500 sm:block">Quick picks:</div>
          <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => pick(7)}>
            7d
          </button>
          <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => pick(30)}>
            30d
          </button>
          <button
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            All
          </button>
          <div className="mx-2 h-5 w-px bg-gray-200" />
          <label className="sr-only" htmlFor="from">
            From
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/5"
          />
          <label className="sr-only" htmlFor="to">
            To
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/5"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm">
          <Search className="h-4 w-4 opacity-60" />
          <input
            ref={searchRef}
            placeholder="Search title or owner ( / )"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-[220px] outline-none"
          />
          <button aria-label="Back" onClick={onBack} className="ml-2 rounded-xl border border-gray-200 p-1 hover:bg-gray-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <DataTable data={rows} />
    </div>
  );
}

// ---------- Status Card ----------
function StatusCard({ title, total, mine = 0, trend, accent, onOpen, kbd, selected }) {
  return (
    <motion.button
      layout
      onClick={onOpen}
      className={cn(
        "group relative overflow-hidden rounded-3xl border p-5 text-left shadow-sm transition-transform",
        selected
          ? cn(
              "border-gray-900 bg-white/80 shadow-md ring-2",
              accent?.includes("emerald")
                ? "ring-emerald-500/40"
                : accent?.includes("amber")
                ? "ring-amber-500/40"
                : accent?.includes("sky")
                ? "ring-sky-500/40"
                : "ring-rose-500/40"
            )
          : "border-gray-200 bg-white hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <div className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">
        {kbd}
      </div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 flex items-end gap-2">
        <div className="text-2xl font-semibold leading-none text-gray-900">{total}</div>
        <div className="text-xs text-gray-500">docs</div>
      </div>
      {typeof mine === "number" && (
        <div className="mt-1 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-gray-700 shadow-sm">
            <User className="h-3 w-3" aria-hidden /> {mine} yours
          </span>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">last 14d</div>
        <div className={cn("text-gray-700", accent)}>
          <Spark points={trend} />
        </div>
      </div>
    </motion.button>
  );
}

// ---------- Sidebar Nav ----------
function NavItem({ icon: Icon, label, active = false }) {
  return (
    <button
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
        active ? "bg-gray-900 text-white shadow" : "text-gray-700 hover:bg-gray-50"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden lg:inline font-medium">{label}</span>
    </button>
  );
}

// ---------- Root App ----------
export default function DocFlow() {
  const [allDocs, setAllDocs] = useState([]);
  const [booting, setBooting] = useState(true);

  // process + inline explorer state
  const [selectedProcess, setSelectedProcess] = useState(null); // string | null
  const [selectedStatus, setSelectedStatus] = useState(null); // Status | null

  // refs for keyboard focus routing
  const processInputRef = useRef(null);
  const docSearchRef = useRef(null);

  // simulate data load
  useEffect(() => {
    const t = setTimeout(() => {
      setAllDocs(generateDocuments());
      setBooting(false);
    }, 350);
    return () => clearTimeout(t);
  }, []);

  // derive processes (from title stems before #)
  const processes = useMemo(() => Array.from(new Set(TITLES)), []);

  // filter docs by selected process (title starts with process name)
  const docsByProcess = useMemo(() => {
    if (!selectedProcess) return allDocs;
    return allDocs.filter((d) => d.title.toLowerCase().startsWith(selectedProcess.toLowerCase()));
  }, [allDocs, selectedProcess]);

  // counts & micro-trends based on current process filter
  const counts =
    useMemo(
      () => ({
        processed: docsByProcess.filter((d) => d.status === "processed").length,
        unprocessed: docsByProcess.filter((d) => d.status === "unprocessed").length,
        "in-processing": docsByProcess.filter((d) => d.status === "in-processing").length,
        trash: docsByProcess.filter((d) => d.status === "trash").length,
      }),
      [docsByProcess]
    );

  const mineCounts = useMemo(
    () => ({
      processed: docsByProcess.filter((d) => d.status === "processed" && d.owner === CURRENT_USER).length,
      unprocessed: docsByProcess.filter((d) => d.status === "unprocessed" && d.owner === CURRENT_USER).length,
      "in-processing": docsByProcess.filter((d) => d.status === "in-processing" && d.owner === CURRENT_USER).length,
      trash: docsByProcess.filter((d) => d.status === "trash" && d.owner === CURRENT_USER).length,
    }),
    [docsByProcess]
  );

  const trendFor = (status) => {
    const days = 14;
    const buckets = Array.from({ length: days }, () => 0);
    const now = new Date().setHours(0, 0, 0, 0);
    docsByProcess.forEach((d) => {
      if (d.status !== status) return;
      const diff = Math.floor((now - new Date(d.updatedAt).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < days) buckets[days - diff - 1] += 1;
    });
    return buckets.map((v) => v + 0.0001);
  };

  // keyboard shortcuts 1..4 to open a status inline
  useKey("1", () => setSelectedStatus("processed"));
  useKey("2", () => setSelectedStatus("unprocessed"));
  useKey("3", () => setSelectedStatus("in-processing"));
  useKey("4", () => setSelectedStatus("trash"));

  // '/' focuses process search (overview) or document search (inline explorer)
  useKey("/", (e) => {
    e.preventDefault();
    if (selectedStatus) docSearchRef.current?.focus();
    else processInputRef.current?.focus();
  });

  // ESC: if inline explorer open → back to four cards
  useKey("Escape", () => {
    if (selectedStatus) setSelectedStatus(null);
  });

  const backToOverview = () => setSelectedStatus(null);

  const statusCards = (
    <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatusCard
        title="Processed"
        total={counts.processed}
        mine={mineCounts.processed}
        trend={trendFor("processed")}
        accent="text-emerald-600"
        onOpen={() => setSelectedStatus("processed")}
        kbd="1"
        selected={selectedStatus === "processed"}
      />
      <StatusCard
        title="Unprocessed"
        total={counts.unprocessed}
        mine={mineCounts.unprocessed}
        trend={trendFor("unprocessed")}
        accent="text-amber-600"
        onOpen={() => setSelectedStatus("unprocessed")}
        kbd="2"
        selected={selectedStatus === "unprocessed"}
      />
      <StatusCard
        title="In Processing"
        total={counts["in-processing"]}
        mine={mineCounts["in-processing"]}
        trend={trendFor("in-processing")}
        accent="text-sky-600"
        onOpen={() => setSelectedStatus("in-processing")}
        kbd="3"
        selected={selectedStatus === "in-processing"}
      />
      <StatusCard
        title="Trash"
        total={counts.trash}
        mine={mineCounts.trash}
        trend={trendFor("trash")}
        accent="text-rose-600"
        onOpen={() => setSelectedStatus("trash")}
        kbd="4"
        selected={selectedStatus === "trash"}
      />
    </motion.div>
  );

  const ProcessStatsStrip = () => null;

  // Title of the selected card for the inline header
  const selectedTitle =
    selectedStatus === "processed"
      ? "Processed"
      : selectedStatus === "unprocessed"
      ? "Unprocessed"
      : selectedStatus === "in-processing"
      ? "In Processing"
      : selectedStatus === "trash"
      ? "Trash"
      : null;

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <div className="grid min-h-dvh grid-cols-[64px_1fr] lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="flex min-h-[56px] items-stretch border-r border-gray-200 bg-white">
          <div className="flex w-full flex-col">
            <div className="flex items-center gap-2 px-4 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-white shadow">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <span className="hidden lg:block font-semibold tracking-tight">DocFlow</span>
            </div>
            <nav className="flex flex-1 flex-col gap-1 p-2">
              <NavItem icon={LayoutGrid} label="Overview" active />
              <NavItem icon={FileText} label="Archive" />
              <NavItem icon={Settings} label="Settings" />
              <div className="mt-auto p-2 text-[10px] text-gray-400">v1.2 • Inline</div>
            </nav>
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-h-dvh flex-col">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CalendarRange className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </div>
            <UserMenu />
          </header>

          {/* Overview + Process Search */}
          <section className="mx-auto w-full max-w-6xl px-4 py-8">
            {/* Process search on main */}
            <ProcessPicker
              value={selectedProcess}
              onChange={setSelectedProcess}
              processes={processes}
              inputRef={processInputRef}
            />
            <ProcessStatsStrip />

            {/* Cards OR Inline Explorer */}
            {booting ? (
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-3xl border border-gray-200 bg-gray-100" />
                ))}
              </div>
            ) : !selectedStatus ? (
              <div className="mt-6">
                {statusCards}
                <div className="mt-8">
                  <MyDocsPanel docs={docsByProcess} currentUser={CURRENT_USER} />
                </div>
              </div>
            ) : (
              <div className="mt-6">
                {/* Highlighted selected card pinned to top with Back */}
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="mb-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={backToOverview}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back
                      </button>
                      <div className="text-sm text-gray-500">Viewing</div>
                    </div>
                    <div className="text-xs text-gray-500">Press Esc to go back</div>
                  </div>
                  <div className="mt-3">
                    <StatusCard
                      title={selectedTitle}
                      total={
                        selectedStatus === "processed"
                          ? counts.processed
                          : selectedStatus === "unprocessed"
                          ? counts.unprocessed
                          : selectedStatus === "in-processing"
                          ? counts["in-processing"]
                          : counts.trash
                      }
                      mine={
                        selectedStatus === "processed"
                          ? mineCounts.processed
                          : selectedStatus === "unprocessed"
                          ? mineCounts.unprocessed
                          : selectedStatus === "in-processing"
                          ? mineCounts["in-processing"]
                          : mineCounts.trash
                      }
                      trend={trendFor(selectedStatus)}
                      accent={
                        selectedStatus === "processed"
                          ? "text-emerald-600"
                          : selectedStatus === "unprocessed"
                          ? "text-amber-600"
                          : selectedStatus === "in-processing"
                          ? "text-sky-600"
                          : "text-rose-600"
                      }
                      onOpen={() => {}}
                      kbd={
                        selectedStatus === "processed"
                          ? "1"
                          : selectedStatus === "unprocessed"
                          ? "2"
                          : selectedStatus === "in-processing"
                          ? "3"
                          : "4"
                      }
                      selected
                    />
                  </div>
                </motion.div>

                {/* Inline explorer body (table + filters) */}
                <InlineExplorer
                  status={selectedStatus}
                  docs={docsByProcess}
                  onBack={backToOverview}
                  searchRef={docSearchRef}
                />
              </div>
            )}

            <p className="mt-6 text-center text-xs text-gray-500">
              Tip: press 1–4 to open a status • press / to focus search • Esc to go back
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
