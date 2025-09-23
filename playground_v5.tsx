import React, { useEffect, useMemo, useRef, useState, useCallback, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Play,
  Upload,
  ChevronDown,
  Loader2,
  Plus,
  X,
  CheckSquare,
  Square,
  Settings,
  Table as TableIcon,
  Code as CodeIcon,
  List as ListIcon,
  ArrowLeft,
  Maximize2,
  Minimize2,
} from "lucide-react";

/**
 * Bank Documents Playground — enhanced with:
 * 1) Collapsible panes (default collapsed).
 * 2) Focused workspace after extraction with "Back" to restore options.
 * 3) Lazy PDF rendering using pdf.js: pre-render only extracted pages; lazy load the rest.
 * 4) Fast, virtualized "web-excel" table using react-window + memoized rows.
 */

// ---------- Static form/prompt data ----------
const FORMS = [
  { value: "10-k", label: "Form 10-K" },
  { value: "10-q", label: "Form 10-Q" },
  { value: "1040", label: "Form 1040 (US Individual Tax)" },
  { value: "1099", label: "Form 1099" },
  { value: "w2", label: "Form W-2" },
];

const PROMPT_LIBRARY = {
  "10-k": [
    "Extract company name, CIK, fiscal year, and auditor name.",
    "List risk factors with page references.",
    "Pull MD&A summary and key metrics (revenue, net income).",
  ],
  "10-q": [
    "Extract quarter, year, company name, and outstanding shares.",
    "Summarize material changes in risk factors.",
  ],
  "1040": [
    "Extract taxpayer name, SSN (masked), AGI, and refund/amount due.",
    "Capture filing status, dependents, and total income.",
  ],
  "1099": [
    "Extract payer name, recipient name, TIN (masked), and amounts in boxes.",
    "List all reported income categories and totals.",
  ],
  w2: [
    "Extract employer, employee, wages, federal income tax withheld.",
    "Capture SSN (masked), state wages, and local wages.",
  ],
};

const DEFAULT_CONFIGS = {
  "10-k": { model: "gpt-4o-mini", system: "Use 10-K tuned system with SEC heuristics." },
  "10-q": { model: "gpt-4o-mini", system: "Use 10-Q tuned system with quarterly deltas." },
  "1040": { model: "gpt-4o-mini", system: "US 1040 extraction defaults; mask PII like SSN." },
  "1099": { model: "gpt-4o-mini", system: "1099 box mapping + payer/recipient normalization." },
  w2: { model: "gpt-4o-mini", system: "W-2 extraction defaults; wages/tax withheld focus." },
};

// ---------------------------------------------
// Mock extraction. Replace with your real API call.
// ---------------------------------------------
async function mockExtract(_args) {
  await new Promise((r) => setTimeout(r, 600));
  if (_args.fieldNames && _args.fieldNames.length) {
    const demo = _args.fieldNames.map((name, i) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/gi, "_") + "_" + i,
      label: name,
      value: `<<sample ${name}>>`,
      coord: { page: (i % 3) + 1, bbox: [0.1 + i * 0.04, 0.2 + i * 0.05, 0.22, 0.035] },
    }));
    return { fields: demo };
  }
  return {
    fields: [
      {
        id: "company_name",
        label: "Company Name",
        value: "Acme Corp",
        coord: { page: 1, bbox: [0.12, 0.18, 0.24, 0.035] },
      },
      {
        id: "fiscal_year",
        label: "Fiscal Year",
        value: "FY 2024",
        coord: { page: 1, bbox: [0.12, 0.23, 0.14, 0.03] },
      },
      {
        id: "auditor",
        label: "Auditor",
        value: "Example & Co. LLP",
        coord: { page: 2, bbox: [0.58, 0.82, 0.28, 0.04] },
      },
      {
        id: "revenue",
        label: "Revenue",
        value: "$ 1,234,567",
        coord: { page: 3, bbox: [0.65, 0.42, 0.18, 0.032] },
      },
    ],
  };
}

// ---------- small utils ----------
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
function toXML(fields) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/\'/g, "&apos;");
  const rows = fields.map((f) => `  <field id="${esc(f.id)}" label="${esc(f.label)}">${esc(f.value)}</field>`).join("\n");
  return `<extraction>\n${rows}\n</extraction>`;
}

// ---------- UI bits ----------
function FieldNamesEditor({ value, onChange }) {
  const [draft, setDraft] = useState("");
  const add = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    onChange(Array.from(new Set([...value, t])));
    setDraft("");
  }, [draft, value, onChange]);
  const remove = useCallback((name) => onChange(value.filter((x) => x !== name)), [value, onChange]);
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a field name (e.g., Company Name)"
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button onClick={add} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {value.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-300 px-2 py-1 text-xs">
              {n}
              <button onClick={() => remove(n)} className="opacity-70 hover:opacity-100" title="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryPromptMultiSelect({ options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const label = selected.size ? `${selected.size} selected` : "Choose prompt(s)";
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full appearance-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 pr-9 text-sm text-left outline-none transition focus:ring-2 focus:ring-neutral-900"
      >
        <div className="flex items-center justify-between">
          <span className="truncate">{label}</span>
          <ChevronDown size={16} />
        </div>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-2xl border border-neutral-200 bg-white shadow-lg max-h-60 overflow-auto">
          {options.length === 0 ? (
            <div className="p-3 text-sm text-neutral-500">No prompts for this form.</div>
          ) : (
            <ul className="py-1">
              {options.map((opt) => {
                const isOn = selected.has(opt);
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onClick={() => onToggle(opt)}
                      className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-neutral-50"
                    >
                      {isOn ? <CheckSquare size={16} className="mt-0.5" /> : <Square size={16} className="mt-0.5" />}
                      <span className="text-sm">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- PDF viewer (CDN-safe fallback: native viewer, page jump only) ----------
function PdfViewer({ url, preRenderPages, highlight }) {
  const objectRef = useRef(null);
  const firstPage = useMemo(() => {
    if (!preRenderPages || preRenderPages.size === 0) return 1;
    return Math.min(...Array.from(preRenderPages));
  }, [preRenderPages]);

  useEffect(() => {
    if (!url || !objectRef.current) return;
    objectRef.current.data = `${url}#page=${firstPage}&zoom=page-width`;
  }, [url, firstPage]);

  useEffect(() => {
    if (!url || !highlight || !objectRef.current) return;
    const p = Number(highlight.page || 1);
    objectRef.current.data = `${url}#page=${p}&zoom=page-width`;
  }, [highlight, url]);

  if (!url) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div>
          <Upload className="mx-auto mb-3" />
          <p className="text-sm text-neutral-500 max-w-sm">Upload a PDF to preview it here. Extraction works best when you provide the exact document type you selected above.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto">
      <object ref={objectRef} data={url} type="application/pdf" className="w-full h-[80vh] rounded-xl border border-neutral-200" />
    </div>
  );
}

// ---------- Virtualized table (dependency-free) ----------
function VirtualList({ height, itemCount, itemSize, width = "100%", itemData, overscanCount = 6, children: RowComponent }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(0);
  const onScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(containerRef.current ? containerRef.current.scrollTop : 0));
  }, []);
  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);
  const totalHeight = itemCount * itemSize;
  const visibleCount = Math.ceil(height / itemSize);
  let startIndex = Math.max(0, Math.floor(scrollTop / itemSize) - overscanCount);
  let endIndex = Math.min(itemCount - 1, startIndex + visibleCount + overscanCount * 2);
  const items = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const style = { position: "absolute", top: i * itemSize, height: itemSize, left: 0, right: 0, width: "100%" };
    items.push(<RowComponent key={i} index={i} style={style} data={itemData} />);
  }
  return (
    <div ref={containerRef} onScroll={onScroll} style={{ height, width, overflow: "auto", position: "relative" }}>
      <div style={{ height: totalHeight, position: "relative" }}>{items}</div>
    </div>
  );
}

const Row = React.memo(function Row({ index, style, data }) {
  const f = data.items[index];
  const onFocus = data.onFocus;
  const onChange = data.onChange;
  return (
    <div style={style} className="grid grid-cols-[1fr,2fr,64px] items-start gap-3 px-2 border-b last:border-b-0 bg-white">
      <button className="text-left hover:underline py-2" onClick={() => f.coord && onFocus(f.coord)} title="Highlight on PDF">{f.label}</button>
      <div className="py-2">
        <input value={f.value} onChange={(e) => onChange(f.id, e.target.value)} onFocus={() => f.coord && onFocus(f.coord)} className="w-full rounded-xl border border-neutral-300 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-neutral-900" />
      </div>
      <div className="py-2 text-neutral-500">{f.coord?.page ?? "-"}</div>
    </div>
  );
});

// ---------- Main component ----------
export default function BankDocsPlayground() {
  const [selectedForm, setSelectedForm] = useState(FORMS[0].value);

  // Prompts state
  const libraryPrompts = useMemo(() => PROMPT_LIBRARY[selectedForm] || [], [selectedForm]);
  const [selectedLibraryPrompts, setSelectedLibraryPrompts] = useState(new Set([PROMPT_LIBRARY[FORMS[0].value][0]]));
  const [customList, setCustomList] = useState([]);
  const [newCustomText, setNewCustomText] = useState("");
  const [selectedCustomIds, setSelectedCustomIds] = useState(new Set());

  // Only-custom configuration
  const [promptSetName, setPromptSetName] = useState("");
  const [customModel, setCustomModel] = useState("gpt-4o-mini");
  const [customSystem, setCustomSystem] = useState("");
  const [fieldNames, setFieldNames] = useState([]);

  // Results / UI
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeCoord, setActiveCoord] = useState(null);

  const [pdfUrl, setPdfUrl] = useState(null);

  // Right-pane preview tabs
  const [previewTab, setPreviewTab] = useState("excel");

  // Collapsible panes (default collapsed)
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // Focused workspace mode after extraction
  const [focused, setFocused] = useState(false);

  // optimization: transition for input edits
  const [isPending, startTransition] = useTransition();

  // Reset relevant state when form changes
  useEffect(() => {
    setSelectedLibraryPrompts(new Set(PROMPT_LIBRARY[selectedForm]?.[0] ? [PROMPT_LIBRARY[selectedForm][0]] : []));
    setPromptSetName("");
    setCustomModel("gpt-4o-mini");
    setCustomSystem("");
    setFieldNames([]);
    setResult(null);
    setActiveCoord(null);
  }, [selectedForm]);

  const selectedCustomPrompts = useMemo(
    () => customList.filter((c) => selectedCustomIds.has(c.id)).map((c) => c.text),
    [customList, selectedCustomIds]
  );
  const onlyCustom = selectedLibraryPrompts.size === 0 && selectedCustomPrompts.length > 0;
  const mixSelected = selectedLibraryPrompts.size > 0 && selectedCustomPrompts.length > 0;

  const toggleLibraryPrompt = useCallback((p) => {
    setSelectedLibraryPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const addCustomPrompt = useCallback(() => {
    const t = newCustomText.trim();
    if (!t) return;
    const item = { id: uid("cust"), text: t };
    setCustomList((prev) => [item, ...prev]);
    setSelectedCustomIds((prev) => new Set(prev).add(item.id));
    setNewCustomText("");
  }, [newCustomText]);

  const removeCustomPrompt = useCallback((id) => {
    setCustomList((prev) => prev.filter((x) => x.id !== id));
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleCustomSelected = useCallback((id) => {
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runExtraction = useCallback(async () => {
    setLoading(true);
    try {
      const promptsToRun = [...Array.from(selectedLibraryPrompts), ...selectedCustomPrompts];
      let config = undefined;
      let fieldsHint = undefined;
      let nameMeta = undefined;

      if (onlyCustom) {
        config = { model: customModel, system: customSystem };
        fieldsHint = fieldNames.length ? fieldNames : undefined;
        nameMeta = promptSetName || undefined;
      } else {
        const def = DEFAULT_CONFIGS[selectedForm];
        config = def ? { ...def } : undefined;
      }

      const payload = await mockExtract({
        form: selectedForm,
        prompts: promptsToRun,
        pdfBlob: null,
        config,
        fieldNames: fieldsHint,
        promptSetName: nameMeta,
      });

      const stabilized = payload.fields.map((f) => ({ ...f, id: f.id || uid("field") }));
      setResult({ fields: stabilized });
      if (stabilized[0]?.coord) setActiveCoord(stabilized[0].coord);
      setPreviewTab("excel");

      // Enter focused workspace and open both panes
      setFocused(true);
      setLeftOpen(true);
      setRightOpen(true);
    } catch (err) {
      console.error(err);
      alert("Extraction failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [selectedLibraryPrompts, selectedCustomPrompts, onlyCustom, customModel, customSystem, fieldNames, promptSetName, selectedForm]);

  const updateField = useCallback((id, value) => {
    startTransition(() => {
      setResult((prev) => {
        if (!prev) return prev;
        const next = prev.fields.map((f) => (f.id === id ? { ...f, value } : f));
        return { fields: next };
      });
    });
  }, []);

  // JSON & XML strings
  const jsonText = useMemo(() => (result ? JSON.stringify(result, null, 2) : "{}"), [result]);
  const xmlText = useMemo(() => (result ? toXML(result.fields) : "<extraction/>"), [result]);

  // Pages to pre-render (from coords)
  const prePages = useMemo(() => {
    const s = new Set();
    if (result?.fields?.length) {
      for (const f of result.fields) {
        if (f.coord?.page) s.add(Number(f.coord.page));
      }
    }
    if (s.size === 0) s.add(1);
    return s;
  }, [result]);

  // track page sizes
  const pageSizeRef = useRef(new Map());
  const handleRenderedPageSize = useCallback((pageNo, size) => {
    pageSizeRef.current.set(pageNo, size);
  }, []);

  // Exit focused mode (Back)
  const handleBack = useCallback(() => {
    setFocused(false);
  }, []);

  // Collapsible helpers for panes
  const PaneShell = ({ title, side, isOpen, onToggle, children }) => (
    <div className="relative self-start overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 w-7 h-7"
            onClick={onToggle}
            title={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        <span className="text-xs text-neutral-500">{side} pane</span>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="pane-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: focused ? "80vh" : "70vh", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  );

  // Virtualized rows data
  const vData = useMemo(
    () => ({
      items: result?.fields || [],
      onFocus: setActiveCoord,
      onChange: updateField,
    }),
    [result]
  );

  return (
    <div className={"min-h-screen bg-neutral-50 text-neutral-900 " + (focused ? "overflow-hidden" : "") }>
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          {focused ? (
            <button
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              onClick={handleBack}
              title="Back to options"
            >
              <ArrowLeft size={16} className="mr-2" /> Back
            </button>
          ) : (
            <div className="w-9 h-9 rounded-2xl bg-neutral-900 text-white grid place-items-center">
              <FileText size={18} />
            </div>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight">Bank Documents Playground</h1>
            <p className="text-sm text-neutral-500 -mt-0.5">A safe, read-only space for users without admin privileges</p>
          </div>
        </div>
      </header>

      {/* Controls (hide in focused mode) */}
      <AnimatePresence initial={false}>
        {!focused && (
          <motion.section
            key="controls"
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="mx-auto max-w-7xl px-4 py-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Form selector */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium mb-2">Choose a form</label>
                <div className="relative">
                  <select
                    value={selectedForm}
                    onChange={(e) => setSelectedForm(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 pr-9 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900"
                  >
                    {FORMS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={16} />
                </div>
              </div>

              {/* Prompt picker (library) */}
              <div className="md:col-span-5">
                <label className="block text-sm font-medium mb-2">Library prompts</label>
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 relative">
                    <LibraryPromptMultiSelect
                      options={libraryPrompts}
                      selected={selectedLibraryPrompts}
                      onToggle={toggleLibraryPrompt}
                    />
                    <p className="text-[12px] text-neutral-500 mt-2">Select multiple prompts using the checkboxes.</p>
                  </div>
                </div>
              </div>

              {/* Custom prompts (extensible) */}
              <div className="md:col-span-4">
                <label className="block text-sm font-medium mb-2">Custom prompts</label>
                <div className="flex gap-2">
                  <input
                    value={newCustomText}
                    onChange={(e) => setNewCustomText(e.target.value)}
                    placeholder="Type a custom prompt and click Add"
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={addCustomPrompt}
                    className="inline-flex items-center gap-1 rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm hover:shadow-sm"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
                {customList.length > 0 ? (
                  <div className="mt-3 space-y-2 max-h-36 overflow-auto pr-1">
                    {customList.map((c) => {
                      const isOn = selectedCustomIds.has(c.id);
                      return (
                        <div key={c.id} className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCustomSelected(c.id)}
                            className="mt-0.5"
                            title={isOn ? "Unselect" : "Select"}
                          >
                            {isOn ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                          <div className="flex-1 text-sm">{c.text}</div>
                          <button
                            type="button"
                            onClick={() => removeCustomPrompt(c.id)}
                            className="opacity-70 hover:opacity-100"
                            title="Remove"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-neutral-500 mt-2">No custom prompts yet.</p>
                )}
              </div>

              {/* PDF upload */}
              <PdfUpload onUrl={(u) => setPdfUrl(u)} url={pdfUrl} />

              {/* Run extraction */}
              <div className="md:col-span-4 flex items-end">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={runExtraction}
                  disabled={loading || (selectedLibraryPrompts.size === 0 && selectedCustomPrompts.length === 0)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow transition disabled:opacity-60 disabled:cursor-not-allowed w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Running extraction...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Run extraction
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Only-custom configuration */}
            {onlyCustom && (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings size={16} />
                  <h3 className="text-sm font-medium">Custom prompt run configuration</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium mb-2">Prompt set name (optional)</label>
                    <input
                      value={promptSetName}
                      onChange={(e) => setPromptSetName(e.target.value)}
                      placeholder="e.g., Risk & Revenue Pull"
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium mb-2">AI model</label>
                    <select
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                      <option value="llama-3.1-70b-instruct">llama-3.1-70b-instruct</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium mb-2">System instructions (optional)</label>
                    <input
                      value={customSystem}
                      onChange={(e) => setCustomSystem(e.target.value)}
                      placeholder="Add a system prompt (guidelines)"
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div className="md:col-span-12">
                    <label className="block text-sm font-medium mb-2">Field names from the document</label>
                    <FieldNamesEditor value={fieldNames} onChange={setFieldNames} />
                    <p className="text-[12px] text-neutral-500 mt-1">These hint the extractor about the desired schema.</p>
                  </div>
                </div>
              </div>
            )}

            {mixSelected && (
              <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                A mix of library and custom prompts is selected. The system will use the default configuration for <span className="font-medium">{FORMS.find((f) => f.value === selectedForm)?.label}</span>.
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Workspace split */}
      <section className={"mx-auto px-4 pb-8 " + (focused ? "max-w-[1600px]" : "max-w-7xl") }>
        <div className={"grid grid-cols-1 lg:grid-cols-2 gap-6 " + (focused ? "min-h-[84vh]" : "min-h-[62vh]") }>
          {/* PDF viewer pane */}
          <PaneShell
            title="Document preview"
            side="Left"
            isOpen={leftOpen}
            onToggle={() => setLeftOpen((v) => !v)}
          >
            <div className="relative h-full">
              <PdfViewer
                url={pdfUrl}
                preRenderPages={prePages}
                highlight={activeCoord}
                onRenderedPageSize={handleRenderedPageSize}
              />
            </div>
          </PaneShell>

          {/* Right pane with tabs */}
          <PaneShell
            title="Results"
            side="Right"
            isOpen={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
          >
            <div className="px-3 pt-3">
              <div className="inline-flex rounded-xl border border-neutral-200 overflow-hidden">
                <TabButton active={previewTab === "excel"} onClick={() => setPreviewTab("excel")} icon={<TableIcon size={14} />}>Excel</TabButton>
                <TabButton active={previewTab === "json"} onClick={() => setPreviewTab("json")} icon={<CodeIcon size={14} />}>JSON</TabButton>
                <TabButton active={previewTab === "xml"} onClick={() => setPreviewTab("xml")} icon={<ListIcon size={14} />}>XML</TabButton>
              </div>
            </div>

            <div className="p-4">
              {!result ? (
                <p className="text-sm text-neutral-500">Run an extraction to populate this view.</p>
              ) : result.fields.length === 0 ? (
                <p className="text-sm text-neutral-500">No fields returned by the extractor.</p>
              ) : previewTab === "excel" ? (
                <div className="overflow-auto" style={{ height: focused ? "calc(80vh - 100px)" : "calc(70vh - 100px)" }}>
                  <div className="grid grid-cols-[1fr,2fr,64px] text-left text-neutral-500 border-b px-2">
                    <div className="py-2 pr-3 font-medium">Field</div>
                    <div className="py-2 pr-3 font-medium">Value (click to select)</div>
                    <div className="py-2 pr-3 font-medium">Page</div>
                  </div>
                  <VirtualList
                    height={(focused ? 80 : 70) * 8}
                    itemCount={result.fields.length}
                    itemSize={56}
                    width="100%"
                    itemData={vData}
                    overscanCount={6}
                  >
                    {Row}
                  </VirtualList>
                </div>
              ) : previewTab === "json" ? (
                <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto" style={{ height: focused ? "calc(80vh - 100px)" : "calc(70vh - 100px)" }}>{jsonText}</pre>
              ) : (
                <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto" style={{ height: focused ? "calc(80vh - 100px)" : "calc(70vh - 100px)" }}>{xmlText}</pre>
              )}
            </div>
          </PaneShell>
        </div>
      </section>

      {/* Footer note */}
      {!focused && (
        <footer className="mx-auto max-w-7xl px-4 pb-8">
          <div className="text-[12px] text-neutral-500">
            <p>
              This is a non-admin playground. No data is persisted. To integrate with production services, connect the Run Extraction action to your AI agent endpoint. When combining library & custom prompts, the component defaults to the form's predefined system configuration.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs " +
        (active ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50")
      }
    >
      {icon}
      {children}
    </button>
  );
}

function PdfUpload({ onUrl, url }) {
  function handlePdfUpload(e) {
    const f = e.target.files?.[0];
    if (f) {
      const url = URL.createObjectURL(f);
      onUrl(url);
    }
  }
  return (
    <div className="md:col-span-8">
      <label className="block text-sm font-medium mb-2">PDF document</label>
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm cursor-pointer hover:shadow-sm transition">
          <Upload size={16} />
          <span>Upload PDF</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
        </label>
        {url ? (
          <span className="text-sm text-neutral-600 truncate">
            Selected: <span className="font-medium">{url.split("/").pop()}</span>
          </span>
        ) : (
          <span className="text-sm text-neutral-400">No file selected</span>
        )}
      </div>
    </div>
  );
}
