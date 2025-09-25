import React, { useEffect, useMemo, useRef, useState, useCallback, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Upload,
  ChevronDown,
  Loader2,
  Plus,
  X,
  CheckSquare,
  Square,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  Code as CodeIcon,
  List as ListIcon,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker (CDN for demo). Replace with your hosted worker in production.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js";

// ------------------------------ Utilities ------------------------------
function uid(prefix = "id") { return `${prefix}_${Math.random().toString(36).slice(2, 9)}`; }
function toXML(fields) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/\'/g, "&apos;");
  const rows = fields.map((f) => `  <field id="${esc(f.id)}" label="${esc(f.label)}">${esc(f.value)}</field>`).join("\n");
  return `<extraction>\n${rows}\n</extraction>`;
}
const TabButton = ({ active, onClick, children, icon }) => (
  <button onClick={onClick} className={"inline-flex items-center gap-1.5 px-3 py-1.5 text-xs " + (active ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50")}>{icon}{children}</button>
);

// ------------------------------ PDF Viewer ------------------------------
function PdfJsViewer({ url, allowedPages, highlight }) {
  const containerRef = useRef(null);
  const pdfRef = useRef(null);
  const renderedRef = useRef(new Set());
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let canceled = false;
    async function load() {
      if (!url) return;
      const task = pdfjsLib.getDocument(url);
      const pdf = await task.promise;
      if (canceled) return;
      pdfRef.current = pdf;
      if (containerRef.current) containerRef.current.innerHTML = "";
      renderedRef.current = new Set();
      const list = Array.from(allowedPages || new Set()).sort((a,b)=>a-b);
      if (list.length) await renderPage(list[0]);
    }
    load().catch(console.error);
    return () => { canceled = true; pdfRef.current = null; };
  }, [url]);

  useEffect(() => {
    if (!pdfRef.current || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    renderedRef.current = new Set();
    const list = Array.from(allowedPages || new Set()).sort((a,b)=>a-b);
    if (list.length) renderPage(list[0]);
  }, [allowedPages]);

  useEffect(() => {
    if (!pdfRef.current || !containerRef.current) return;
    const pages = Array.from(renderedRef.current);
    containerRef.current.innerHTML = "";
    renderedRef.current = new Set();
    (async () => { for (const p of pages) await renderPage(p); drawHighlight(); })();
  }, [containerWidth]);

  async function renderPage(pageNumber) {
    if (!pdfRef.current || !containerRef.current) return;
    if (!allowedPages || !allowedPages.has(pageNumber)) return;
    const page = await pdfRef.current.getPage(pageNumber);
    const viewport0 = page.getViewport({ scale: 1 });
    const width = containerRef.current.clientWidth || viewport0.width;
    const scale = width / viewport0.width;
    const viewport = page.getViewport({ scale });

    const id = `pdf-page-${pageNumber}`;
    let pageDiv = document.getElementById(id);
    if (!pageDiv) {
      pageDiv = document.createElement("div");
      pageDiv.id = id; pageDiv.dataset.page = String(pageNumber);
      pageDiv.style.position = "relative"; pageDiv.style.margin = "0 0 16px 0";
      containerRef.current.appendChild(pageDiv);
    }

    let canvas = pageDiv.querySelector("canvas");
    if (!canvas) { canvas = document.createElement("canvas"); pageDiv.appendChild(canvas); }
    const context = canvas.getContext("2d");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;

    await page.render({ canvasContext: context, viewport }).promise;
    renderedRef.current.add(pageNumber);

    let overlay = pageDiv.querySelector("div.__hl__");
    if (!overlay) { overlay = document.createElement("div"); overlay.className = "__hl__"; Object.assign(overlay.style,{position:"absolute",left:0,top:0,right:0,bottom:0,pointerEvents:"none"}); pageDiv.appendChild(overlay); }
  }

  function drawHighlight() {
    if (!highlight || !highlight.page) return;
    const p = Number(highlight.page);
    const pageDiv = document.getElementById(`pdf-page-${p}`);
    if (!pageDiv) return;
    const overlay = pageDiv.querySelector("div.__hl__");
    if (!overlay) return;
    overlay.innerHTML = "";
    const canvas = pageDiv.querySelector("canvas");
    if (!canvas) return;
    const styleW = parseFloat(canvas.style.width || "0");
    const styleH = parseFloat(canvas.style.height || "0");
    const [nx, ny, nw, nh] = highlight.bbox || [0,0,0,0];
    const rect = document.createElement("div");
    Object.assign(rect.style,{
      position:"absolute", left:`${nx*styleW}px`, top:`${ny*styleH}px`, width:`${nw*styleW}px`, height:`${nh*styleH}px`,
      background:"rgba(255,230,0,0.35)", outline:"2px solid rgba(255,200,0,0.8)", borderRadius:"4px"
    });
    overlay.appendChild(rect);
    if (highlight.scroll !== false) pageDiv.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    if (!highlight || !pdfRef.current) return;
    const p = Number(highlight.page || 1);
    if (!renderedRef.current.has(p)) {
      renderPage(p).then(() => drawHighlight());
    } else { drawHighlight(); }
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

// ------------------------------ Unified Details ------------------------------
function UnifiedDetails({
  open, onToggle, title = "Document & Extracted Data", focused,
  pdfUrl, allowedPages, highlight,
  result, previewTab, setPreviewTab, vData, jsonText, xmlText,
  livePreview, onToggleLivePreview
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggle} className="inline-flex items-center justify-center rounded-lg border border-neutral-200 w-8 h-8" title={open?"Collapse details":"Expand details"} aria-label="toggle-details">
            {open ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
          </button>
          <div className="truncate">
            <div className="text-[12px] text-neutral-500">Unified details</div>
            <div className="text-sm font-medium truncate">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-neutral-600">Canvas live preview</label>
          <button role="switch" aria-checked={livePreview} onClick={onToggleLivePreview}
            className={"relative inline-flex h-6 w-11 items-center rounded-full transition " + (livePreview?"bg-neutral-900":"bg-neutral-300")}> 
            <span className={"inline-block h-5 w-5 transform rounded-full bg-white transition " + (livePreview?"translate-x-5":"translate-x-1")} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="unified-body" initial={{height:0,opacity:0}} animate={{height:focused?"80vh":"70vh",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-4">
              <div className="relative h-full">
                <PdfJsViewer url={pdfUrl} allowedPages={allowedPages} highlight={highlight} />
              </div>
              <div className="flex h-full min-h-0 flex-col">
                <div className="px-1 pt-1">
                  <div className="inline-flex rounded-xl border border-neutral-200 overflow-hidden">
                    <TabButton active={previewTab==="excel"} onClick={()=>setPreviewTab("excel")} icon={<TableIcon size={14}/>}>Excel</TabButton>
                    <TabButton active={previewTab==="json"} onClick={()=>setPreviewTab("json")} icon={<CodeIcon size={14}/>}>JSON</TabButton>
                    <TabButton active={previewTab==="xml"} onClick={()=>setPreviewTab("xml")} icon={<ListIcon size={14}/>}>XML</TabButton>
                  </div>
                </div>
                <div className="p-4 flex-1 min-h-0">
                  {!result ? (
                    <p className="text-sm text-neutral-500">Upload extraction JSON to populate this view.</p>
                  ) : result.fields.length===0 ? (
                    <p className="text-sm text-neutral-500">No fields.</p>
                  ) : previewTab === "excel" ? (
                    <div className="overflow-auto h-full">
                      <div className="grid grid-cols-[1fr,2fr,64px] text-left text-neutral-500 border-b px-2">
                        <div className="py-2 pr-3 font-medium">Field</div>
                        <div className="py-2 pr-3 font-medium">Value (hover/click)</div>
                        <div className="py-2 pr-3 font-medium">Page</div>
                      </div>
                      <VirtualList height={520} itemCount={result.fields.length} itemSize={56} width="100%" itemData={{
                        items: result.fields,
                        onFocus: (coord)=>vData.onFocus(coord),
                        onHover: (coord)=>vData.onHover(coord),
                        onChange: (id,val)=>vData.onChange(id,val),
                        livePreview
                      }} overscanCount={6}>{Row}
                      </VirtualList>
                    </div>
                  ) : previewTab === "json" ? (
                    <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto h-full">{vData.jsonText}</pre>
                  ) : (
                    <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto h-full">{vData.xmlText}</pre>
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

// ------------------------------ Virtual List & Row ------------------------------
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
  const handleHover = () => { if (data.livePreview && f.coord) data.onHover({ ...f.coord, scroll: false }); };
  const handleClick = () => { if (f.coord) data.onFocus({ ...f.coord, scroll: true }); };
  return (
    <div style={style} className="grid grid-cols-[1fr,2fr,64px] items-start gap-3 px-2 border-b last:border-b-0 bg-white">
      <button className="text-left hover:underline py-2" onMouseEnter={handleHover} onClick={handleClick} title="Highlight on PDF">{f.label}</button>
      <div className="py-2">
        <input value={f.value} onChange={(e)=>data.onChange(f.id, e.target.value)} onMouseEnter={handleHover} onFocus={handleClick} className="w-full rounded-xl border border-neutral-300 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-neutral-900" />
      </div>
      <div className="py-2 text-neutral-500">{f.coord?.page ?? "-"}</div>
    </div>
  );
});

// ------------------------------ Uploaders ------------------------------
function PdfUpload({ onUrl, url }) {
  function handlePdfUpload(e) {
    const f = (e.target.files && e.target.files[0]) || null;
    if (f) { const url = URL.createObjectURL(f); onUrl(url); }
  }
  return (
    <div className="md:col-span-6">
      <label className="block text-sm font-medium mb-2">PDF document</label>
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm cursor-pointer hover:shadow-sm transition">
          <Upload size={16} />
          <span>Upload PDF</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
        </label>
        {url ? <span className="text-sm text-neutral-600 truncate">Selected: <span className="font-medium">{url.split("/").pop()}</span></span> : <span className="text-sm text-neutral-400">No file selected</span>}
      </div>
    </div>
  );
}

function ExtractionJsonUpload({ onData }) {
  function handleJsonUpload(e) {
    const f = (e.target.files && e.target.files[0]) || null;
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "[]"));
        onData(Array.isArray(data) ? data : (data?.items || []));
      } catch (e) { console.error(e); alert("Invalid JSON"); }
    };
    reader.readAsText(f);
  }
  return (
    <div className="md:col-span-6">
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

// ------------------------------ App ------------------------------
export default function App() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [activeCoord, setActiveCoord] = useState(null);
  const [previewTab, setPreviewTab] = useState("excel");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [livePreview, setLivePreview] = useState(true);
  const [focused, setFocused] = useState(true);

  const allowedPages = useMemo(() => {
    const s = new Set();
    if (result?.fields?.length) for (const f of result.fields) if (f.coord?.page) s.add(Number(f.coord.page));
    return s;
  }, [result]);

  const vData = useMemo(() => ({
    items: result?.fields || [],
    onFocus: setActiveCoord,
    onHover: (coord) => setActiveCoord(coord),
    onChange: (id, value) => {
      setResult((prev) => {
        if (!prev) return prev;
        const next = prev.fields.map((f) => (f.id === id ? { ...f, value } : f));
        return { fields: next };
      });
    },
    jsonText: result ? JSON.stringify(result, null, 2) : "{}",
    xmlText: result ? toXML(result.fields) : "<extraction/>",
  }), [result]);

  function mapExtractionItems(items) {
    const fields = (items || [])
      .filter((it) => it && it.page && Array.isArray(it.bbox_norm))
      .map((it) => ({ id: uid("field"), label: `${it.category || "item"}: ${it.label || ""}`.trim(), value: (it.snippet || "").slice(0, 200), coord: { page: Number(it.page), bbox: it.bbox_norm } }));
    if (fields.length === 0) { alert("No valid items found in the JSON."); return; }
    setResult({ fields });
    setActiveCoord({ page: fields[0].coord.page, bbox: fields[0].coord.bbox, scroll: true });
    setPreviewTab("excel");
    setFocused(true);
    setDetailsOpen(true);
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-neutral-900 text-white grid place-items-center"><FileText size={18} /></div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight">PDF Highlight Playground — Live Canvas Preview</h1>
            <p className="text-sm text-neutral-500 -mt-0.5">Upload a PDF and an extracted JSON to try click-to-highlight.</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <PdfUpload onUrl={(u)=>setPdfUrl(u)} url={pdfUrl} />
          <ExtractionJsonUpload onData={mapExtractionItems} />
        </div>
      </section>

      <section className={(focused ? "max-w-[1600px]" : "max-w-7xl") + " mx-auto px-4 pb-8"}>
        <UnifiedDetails
          open={detailsOpen}
          onToggle={() => setDetailsOpen((v)=>!v)}
          title="Document preview + Results"
          focused={focused}
          pdfUrl={pdfUrl}
          allowedPages={allowedPages}
          highlight={activeCoord}
          result={result}
          previewTab={previewTab}
          setPreviewTab={setPreviewTab}
          vData={vData}
          jsonText={vData.jsonText}
          xmlText={vData.xmlText}
          livePreview={livePreview}
          onToggleLivePreview={() => setLivePreview((v)=>!v)}
        />
      </section>
    </div>
  );
}
