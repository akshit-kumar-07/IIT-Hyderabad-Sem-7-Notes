$1
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker (use a pinned CDN build or your own hosted worker)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js";

/**
 * Bank Documents Playground — Unified Details
 * ---------------------------------------------------------------
 * This variant merges the left (document preview) and right (results)
 * panes into a SINGLE component that expands/collapses together.
 *
 * Key changes vs playground_v5.tsx:
 *  - Removed `leftOpen` / `rightOpen` and introduced `detailsOpen`.
 *  - Added <UnifiedDetails/> that owns both preview and results.
 *  - One header + one toggle controls both at once.
 *  - `Esc` collapses the unified details if open; otherwise exits focus.
 */

// ---------- Static form/prompt data ----------
const FORMS = [
  { value: "10-k", label: "Form 10-K" },
  { value: "10-q", label: "Form 10-Q" },
  { value: "1040", label: "Form 1040 (US Individual Tax)" },
  { value: "1099", label: "Form 1099" },
  { value: "w2", label: "Form W-2" },
];

const PROMPT_LIBRARY: Record<string, string[]> = {
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

const DEFAULT_CONFIGS: Record<string, { model: string; system: string }> = {
  "10-k": { model: "gpt-4o-mini", system: "Use 10-K tuned system with SEC heuristics." },
  "10-q": { model: "gpt-4o-mini", system: "Use 10-Q tuned system with quarterly deltas." },
  "1040": { model: "gpt-4o-mini", system: "US 1040 extraction defaults; mask PII like SSN." },
  "1099": { model: "gpt-4o-mini", system: "1099 box mapping + payer/recipient normalization." },
  w2: { model: "gpt-4o-mini", system: "W-2 extraction defaults; wages/tax withheld focus." },
};

// ---------------------------------------------
// Mock extraction. Replace with your real API call.
// ---------------------------------------------
async function mockExtract(_args: any) {
  await new Promise((r) => setTimeout(r, 600));
  if (_args.fieldNames && _args.fieldNames.length) {
    const demo = _args.fieldNames.map((name: string, i: number) => ({
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
function toXML(fields: any[]) {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/\'/g, "&apos;");
  const rows = fields
    .map((f) => `  <field id="${esc(f.id)}" label="${esc(f.label)}">${esc(f.value)}</field>`) 
    .join("\n");
  return `<extraction>\n${rows}\n</extraction>`;
}

// ---------- UI bits ----------
function FieldNamesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    onChange(Array.from(new Set([...value, t])));
    setDraft("");
  }, [draft, value, onChange]);
  const remove = useCallback((name: string) => onChange(value.filter((x) => x !== name)), [value, onChange]);
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

function ExtractionJsonUpload({ onData }: { onData: (items: any[]) => void }) {
  function handleJsonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = (e.target.files && e.target.files[0]) || null;
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "[]"));
        onData(Array.isArray(data) ? data : (data?.items || []));
      } catch (e) {
        console.error(e);
        alert("Invalid JSON");
      }
    };
    reader.readAsText(f);
  }
  return (
    <div className="md:col-span-8">
      <label className="block text-sm font-medium mb-2">Extraction JSON</label>
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm cursor-pointer hover:shadow-sm transition">
          <Upload size={16} />
          <span>Upload Extracted JSON</span>
          <input type="file" accept="application/json" className="hidden" onChange={handleJsonUpload} />
        </label>
        <span className="text-sm text-neutral-500">Use the JSON we generated to lazy-load & highlight.</span>
      </div>
    </div>
  );
}

function LibraryPromptMultiSelect({ options, selected, onToggle }: { options: string[]; selected: Set<string>; onToggle: (opt: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
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
function PdfJsViewer({ url, allowedPages, highlight }: { url: string | null; allowedPages: Set<number>; highlight: any }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<any>(null);
  const renderedRef = useRef<Set<number>>(new Set());
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load PDF
  useEffect(() => {
    let canceled = false;
    async function load() {
      if (!url) return;
      const task = pdfjsLib.getDocument(url);
      const pdf = await task.promise;
      if (canceled) return;
      pdfRef.current = pdf;
      // reset
      if (containerRef.current) containerRef.current.innerHTML = "";
      renderedRef.current = new Set();
      const list = Array.from(allowedPages || new Set<number>()).sort((a, b) => a - b);
      if (list.length) await renderPage(list[0]);
    }
    load().catch(console.error);
    return () => {
      canceled = true;
      pdfRef.current = null;
    };
  }, [url]);

  // When allowed pages change, reset and show first allowed
  useEffect(() => {
    if (!pdfRef.current || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    renderedRef.current = new Set();
    const list = Array.from(allowedPages || new Set<number>()).sort((a, b) => a - b);
    if (list.length) renderPage(list[0]);
  }, [allowedPages]);

  // Re-render on resize to keep crisp
  useEffect(() => {
    if (!pdfRef.current || !containerRef.current) return;
    const pages = Array.from(renderedRef.current);
    containerRef.current.innerHTML = "";
    renderedRef.current = new Set();
    (async () => {
      for (const p of pages) await renderPage(p);
      drawHighlight();
    })();
  }, [containerWidth]);

  async function renderPage(pageNumber: number) {
    if (!pdfRef.current || !containerRef.current) return;
    if (!allowedPages || !allowedPages.has(pageNumber)) return; // restrict
    const page = await pdfRef.current.getPage(pageNumber);

    // Fit-to-width scaling
    const viewport0 = page.getViewport({ scale: 1 });
    const width = containerRef.current.clientWidth || viewport0.width;
    const scale = width / viewport0.width;
    const viewport = page.getViewport({ scale });

    // Page container
    const id = `pdf-page-${pageNumber}`;
    let pageDiv = document.getElementById(id) as HTMLDivElement | null;
    if (!pageDiv) {
      pageDiv = document.createElement("div");
      pageDiv.id = id;
      pageDiv.dataset.page = String(pageNumber);
      pageDiv.style.position = "relative";
      pageDiv.style.margin = "0 0 16px 0";
      containerRef.current.appendChild(pageDiv);
    }

    // Canvas
    let canvas = pageDiv.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      pageDiv.appendChild(canvas);
    }
    const context = canvas.getContext("2d");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    await page.render({ canvasContext: context as any, viewport }).promise;
    renderedRef.current.add(pageNumber);

    // Overlay for highlights
    let overlay = pageDiv.querySelector("div.__hl__") as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "__hl__";
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.pointerEvents = "none";
      pageDiv.appendChild(overlay);
    }
  }

  function drawHighlight() {
    if (!highlight || !highlight.page) return;
    const p = Number(highlight.page);
    const pageDiv = document.getElementById(`pdf-page-${p}`) as HTMLDivElement | null;
    if (!pageDiv) return;
    const overlay = pageDiv.querySelector("div.__hl__") as HTMLDivElement | null;
    if (!overlay) return;

    // Clear
    overlay.innerHTML = "";

    const canvas = pageDiv.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const styleW = parseFloat(canvas.style.width || "0");
    const styleH = parseFloat(canvas.style.height || "0");

    const [nx, ny, nw, nh] = highlight.bbox || [0, 0, 0, 0];

    const rect = document.createElement("div");
    rect.style.position = "absolute";
    rect.style.left = `${nx * styleW}px`;
    rect.style.top = `${ny * styleH}px`;
    rect.style.width = `${nw * styleW}px`;
    rect.style.height = `${nh * styleH}px`;
    rect.style.background = "rgba(255, 230, 0, 0.35)";
    rect.style.outline = "2px solid rgba(255, 200, 0, 0.8)";
    rect.style.borderRadius = "4px";
    overlay.appendChild(rect);

    if (highlight.scroll !== false) pageDiv.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    if (!highlight || !pdfRef.current) return;
    const p = Number(highlight.page || 1);
    if (!renderedRef.current.has(p)) {
      renderPage(p).then(() => drawHighlight());
    } else {
      drawHighlight();
    }
  }, [highlight, allowedPages]);

  return (
    <div className="relative h-full">
      {!url ? (
        <div className="h-full grid place-items-center p-8 text-center">
          <div>
            <Upload className="mx-auto mb-3" />
            <p className="text-sm text-neutral-500 max-w-sm">Upload a PDF to preview it here.</p>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="absolute inset-0 overflow-auto" />
      )}
    </div>
  );
}

// ---------- Virtualized table (dependency-free) ----------
function VirtualList({ height, itemCount, itemSize, width = "100%", itemData, overscanCount = 6, children: RowComponent }: any) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number>(0 as any);
  const onScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(containerRef.current ? containerRef.current.scrollTop : 0));
  }, []);
  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);
  const totalHeight = itemCount * itemSize;
  const visibleCount = Math.ceil(height / itemSize);
  let startIndex = Math.max(0, Math.floor(scrollTop / itemSize) - overscanCount);
  let endIndex = Math.min(itemCount - 1, startIndex + visibleCount + overscanCount * 2);
  const items = [] as any[];
  for (let i = startIndex; i <= endIndex; i++) {
    const style = { position: "absolute", top: i * itemSize, height: itemSize, left: 0, right: 0, width: "100%" } as React.CSSProperties;
    items.push(<RowComponent key={i} index={i} style={style} data={itemData} />);
  }
  return (
    <div ref={containerRef} onScroll={onScroll} style={{ height, width, overflow: "auto", position: "relative" }}>
      <div style={{ height: totalHeight, position: "relative" }}>{items}</div>
    </div>
  );
}

const Row = React.memo(function Row({ index, style, data }: any) {
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

// ---------- Unified Details (Preview + Results) ----------
function UnifiedDetails(props: {
  open: boolean;
  onToggle: () => void;
  title?: string;
  focused: boolean;
  // preview
  pdfUrl: string | null;
  allowedPages: Set<number>;
  highlight: any;
  // results
  result: { fields: any[] } | null;
  previewTab: "excel" | "json" | "xml";
  setPreviewTab: (t: "excel" | "json" | "xml") => void;
  vData: any;
  jsonText: string;
  xmlText: string;
}) {
  const { open, onToggle, title = "Document & Extracted Data", focused, pdfUrl, allowedPages, highlight, result, previewTab, setPreviewTab, vData, jsonText, xmlText } = props;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* Single header controlling BOTH panes */}
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 w-8 h-8"
            onClick={onToggle}
            title={open ? "Collapse details" : "Expand details"}
            aria-label={open ? "Collapse unified details" : "Expand unified details"}
          >
            {open ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <div className="truncate">
            <div className="text-[12px] text-neutral-500">Unified details</div>
            <div className="text-sm font-medium truncate">{title}</div>
          </div>
        </div>
        <span className="text-xs text-neutral-500">Press Esc to {open ? "collapse" : "expand"}</span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="unified-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: focused ? "80vh" : "70vh", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {/* Two panes INSIDE one component */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-4">
              {/* Left: PDF Preview */}
              <div className="relative h-full">
                <PdfJsViewer url={pdfUrl} allowedPages={allowedPages} highlight={highlight} />
              </div>

              {/* Right: Results */}
              <div className="flex h-full min-h-0 flex-col">
                {/* Tabs */}
                <div className="px-1 pt-1">
                  <div className="inline-flex rounded-xl border border-neutral-200 overflow-hidden">
                    <TabButton active={previewTab === "excel"} onClick={() => setPreviewTab("excel")} icon={<TableIcon size={14} />}>Excel</TabButton>
                    <TabButton active={previewTab === "json"} onClick={() => setPreviewTab("json")} icon={<CodeIcon size={14} />}>JSON</TabButton>
                    <TabButton active={previewTab === "xml"} onClick={() => setPreviewTab("xml")} icon={<ListIcon size={14} />}>XML</TabButton>
                  </div>
                </div>
                {/* Content */}
                <div className="p-4 flex-1 min-h-0">
                  {!result ? (
                    <p className="text-sm text-neutral-500">Run an extraction to populate this view.</p>
                  ) : result.fields.length === 0 ? (
                    <p className="text-sm text-neutral-500">No fields returned by the extractor.</p>
                  ) : previewTab === "excel" ? (
                    <div className="overflow-auto h-full">
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
                    <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto h-full">{jsonText}</pre>
                  ) : (
                    <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto h-full">{xmlText}</pre>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Main component ----------
export default function BankDocsPlaygroundUnified() {
  const [selectedForm, setSelectedForm] = useState(FORMS[0].value);

  // Prompts state
  const libraryPrompts = useMemo(() => PROMPT_LIBRARY[selectedForm] || [], [selectedForm]);
  const [selectedLibraryPrompts, setSelectedLibraryPrompts] = useState<Set<string>>(new Set([PROMPT_LIBRARY[FORMS[0].value][0]]));
  const [customList, setCustomList] = useState<{ id: string; text: string }[]>([]);
  const [newCustomText, setNewCustomText] = useState("");
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(new Set());

  // Only-custom configuration
  const [promptSetName, setPromptSetName] = useState("");
  const [customModel, setCustomModel] = useState("gpt-4o-mini");
  const [customSystem, setCustomSystem] = useState("");
  const [fieldNames, setFieldNames] = useState<string[]>([]);

  // Results / UI
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ fields: any[] } | null>(null);
  const [activeCoord, setActiveCoord] = useState<any>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Preview tabs (for results)
  const [previewTab, setPreviewTab] = useState<"excel" | "json" | "xml">("excel");

  // Unified details open/close
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const toggleLibraryPrompt = useCallback((p: string) => {
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

  const removeCustomPrompt = useCallback((id: string) => {
    setCustomList((prev) => prev.filter((x) => x.id !== id));
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleCustomSelected = useCallback((id: string) => {
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
      let config: any = undefined;
      let fieldsHint: any = undefined;
      let nameMeta: any = undefined;

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

      const stabilized = payload.fields.map((f: any) => ({ ...f, id: f.id || uid("field") }));
      setResult({ fields: stabilized });
      if (stabilized[0]?.coord) setActiveCoord(stabilized[0].coord);
      setPreviewTab("excel");

      // Enter focused workspace and OPEN the unified details
      setFocused(true);
      setDetailsOpen(true);
    } catch (err) {
      console.error(err);
      alert("Extraction failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [selectedLibraryPrompts, selectedCustomPrompts, onlyCustom, customModel, customSystem, fieldNames, promptSetName, selectedForm]);

  const updateField = useCallback((id: string, value: string) => {
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
  const xmlText = useMemo(() => (result ? toXML(result.fields) : "<extraction/>") , [result]);

  // Pages to pre-render (from coords)
  const allowedPages = useMemo(() => {
    const s = new Set<number>();
    if (result?.fields?.length) {
      for (const f of result.fields) {
        if (f.coord?.page) s.add(Number(f.coord.page));
      }
    }
    if (s.size === 0) s.add(1);
    return s;
  }, [result]);

  // Exit focused mode (Back)
  const handleBack = useCallback(() => {
    setFocused(false);
  }, []);

  // ESC behavior: collapse unified details if open; otherwise Back (if focused)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (detailsOpen) setDetailsOpen(false);
        else if (focused) setFocused(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen, focused]);

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
            <h1 className="text-lg font-semibold leading-tight">Bank Documents Playground (Unified)</h1>
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

              {/* Extraction JSON upload (use previously-extracted coords) */}
              <ExtractionJsonUpload onData={(items) => {
                try {
                  const fields = (items || [])
                    .filter((it: any) => it && it.page && Array.isArray(it.bbox_norm))
                    .map((it: any) => ({
                      id: uid("field"),
                      label: `${it.category || "item"}: ${it.label || ""}`.trim(),
                      value: (it.snippet || "").slice(0, 200),
                      coord: { page: Number(it.page), bbox: it.bbox_norm },
                    }));
                  if (fields.length === 0) {
                    alert("No valid items found in the JSON.");
                    return;
                  }
                  setResult({ fields });
                  setActiveCoord({ page: fields[0].coord.page, bbox: fields[0].coord.bbox, scroll: true });
                  setPreviewTab("excel");
                  setFocused(true);
                  setDetailsOpen(true);
                } catch (e) {
                  console.error(e);
                  alert("Failed to read extraction JSON");
                }
              }} />

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

      {/* Unified details (replaces split panes) */}
      <section className={(focused ? "max-w-[1600px]" : "max-w-7xl") + " mx-auto px-4 pb-8"}>
        <UnifiedDetails
          open={detailsOpen}
          onToggle={() => setDetailsOpen((v) => !v)}
          title="Document preview + Results"
          focused={focused}
          pdfUrl={pdfUrl}
          allowedPages={allowedPages}
          highlight={activeCoord}
          result={result}
          previewTab={previewTab}
          setPreviewTab={setPreviewTab}
          vData={vData}
          jsonText={jsonText}
          xmlText={xmlText}
        />
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

function TabButton({ active, onClick, children, icon }: any) {
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

function PdfUpload({ onUrl, url }: { onUrl: (u: string) => void; url: string | null }) {
  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = (e.target.files && e.target.files[0]) || null;
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
