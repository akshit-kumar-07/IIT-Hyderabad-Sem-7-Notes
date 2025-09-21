import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Play,
  Upload,
  ChevronDown,
  Sparkles,
  Loader2,
  Plus,
  X,
  Check,
  Square,
  CheckSquare,
  Settings,
  Table as TableIcon,
  Code as CodeIcon,
  List as ListIcon,
} from "lucide-react";

/**
 * Bank Documents Playground — enhanced
 *
 * What changed (relative to the minimal starter):
 * 1) Custom prompts are extensible — you can add multiple custom prompts and select any subset.
 * 2) Pre‑selected (library) prompts are shown in a custom dropdown with checkboxes for multi‑select.
 * 3) If ONLY custom prompts are selected (no library prompts), show a one‑time configuration panel
 *    for Prompt Name, Model/System Configuration, and Field Names (document schema hints).
 * 4) If a mix of library and custom prompts is selected, system configuration defaults to the
 *    predefined config for the selected form (the custom section is hidden/ignored).
 * 5) The right pane now has three tabs to preview the extraction result as an Excel‑like table,
 *    JSON, and XML.
 *
 * Integration notes:
 * - Replace mockExtract() with a real API call. It now accepts multiple prompts and optional config.
 * - When ONLY custom prompts are selected, we pass the user‑provided model/config + field names.
 * - When any library prompt is selected, we pass the form defaults.
 */

const FORMS: Array<{ value: string; label: string }> = [
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

// Example default configs per form (replace with your actual production defaults)
const DEFAULT_CONFIGS: Record<string, { model: string; system: string }> = {
  "10-k": { model: "gpt-4o-mini", system: "Use 10-K tuned system with SEC heuristics." },
  "10-q": { model: "gpt-4o-mini", system: "Use 10-Q tuned system with quarterly deltas." },
  "1040": { model: "gpt-4o-mini", system: "US 1040 extraction defaults; mask PII like SSN." },
  "1099": { model: "gpt-4o-mini", system: "1099 box mapping + payer/recipient normalization." },
  w2: { model: "gpt-4o-mini", system: "W‑2 extraction defaults; wages/tax withheld focus." },
};

// ---------------------------------------------
// Mock extraction. Replace with your real API call.
// ---------------------------------------------
async function mockExtract(_args: {
  form: string;
  prompts: string[];
  pdfBlob?: Blob | null;
  config?: { model?: string; system?: string };
  fieldNames?: string[]; // only when ONLY custom prompts are selected
  promptSetName?: string; // optional metadata
}): Promise<{
  fields: Array<{
    id: string;
    label: string;
    value: string;
    coord?: { page: number; bbox: [number, number, number, number] };
  }>;
}> {
  // Fake latency
  await new Promise((r) => setTimeout(r, 900));

  // If the caller provided explicit fieldNames (ONLY custom prompts case), honor them.
  if (_args.fieldNames && _args.fieldNames.length) {
    const demo = _args.fieldNames.map((name, i) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/gi, "_") + "_" + i,
      label: name,
      value: `<<sample ${name}>>`,
      coord: { page: 1, bbox: [0.1 + i * 0.04, 0.2 + i * 0.05, 0.22, 0.035] },
    }));
    return { fields: demo };
  }

  // Otherwise, return a small demo schema. Coordinates are normalized to the PDF pane
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
        coord: { page: 1, bbox: [0.58, 0.82, 0.28, 0.04] },
      },
      {
        id: "revenue",
        label: "Revenue",
        value: "$ 1,234,567",
        coord: { page: 1, bbox: [0.65, 0.42, 0.18, 0.032] },
      },
    ],
  };
}

// Utility to generate a pleasant key
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Small helper to convert current result into XML text
function toXML(fields: Array<{ id: string; label: string; value: string }>) {
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

// Simple chip input for field names
function FieldNamesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange(Array.from(new Set([...value, t])));
    setDraft("");
  }
  function remove(name: string) {
    onChange(value.filter((x) => x !== name));
  }
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a field name (e.g., Company Name)"
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button onClick={add} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">Add</button>
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

// Multi-select dropdown for library prompts (with checkboxes)
function LibraryPromptMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = selected.size
    ? `${selected.size} selected`
    : "Choose prompt(s)";

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
              {options.map((opt, idx) => {
                const isOn = selected.has(opt);
                return (
                  <li key={idx}>
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

export default function BankDocsPlayground() {
  const [selectedForm, setSelectedForm] = useState(FORMS[0].value);

  // Library prompts (multi-select)
  const libraryPrompts = useMemo(() => PROMPT_LIBRARY[selectedForm] || [], [selectedForm]);
  const [selectedLibraryPrompts, setSelectedLibraryPrompts] = useState<Set<string>>(new Set([PROMPT_LIBRARY[FORMS[0].value][0]]));

  // Custom prompts list + selection
  const [customList, setCustomList] = useState<Array<{ id: string; text: string }>>([]);
  const [newCustomText, setNewCustomText] = useState("");
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(new Set());

  // Only‑custom configuration (single time)
  const [promptSetName, setPromptSetName] = useState("");
  const [customModel, setCustomModel] = useState("gpt-4o-mini");
  const [customSystem, setCustomSystem] = useState("");
  const [fieldNames, setFieldNames] = useState<string[]>([]);

  // Results / UI
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    fields: Array<{ id: string; label: string; value: string; coord?: { page: number; bbox: [number, number, number, number] } }>;
  } | null>(null);
  const [activeCoord, setActiveCoord] = useState<{ page: number; bbox: [number, number, number, number] } | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfPaneRef = useRef<HTMLDivElement>(null);

  // Right-pane preview tabs: "excel" | "json" | "xml"
  const [previewTab, setPreviewTab] = useState<"excel" | "json" | "xml">("excel");

  // Reset state when form changes
  useEffect(() => {
    setSelectedLibraryPrompts(new Set(PROMPT_LIBRARY[selectedForm]?.[0] ? [PROMPT_LIBRARY[selectedForm][0]] : []));
    // Keep custom prompts list as-is across form changes (so user entries persist)
    // Clear only-custom configuration specifics for a clean slate
    setPromptSetName("");
    setCustomModel("gpt-4o-mini");
    setCustomSystem("");
    setFieldNames([]);
    setResult(null);
    setActiveCoord(null);
  }, [selectedForm]);

  function toggleLibraryPrompt(p: string) {
    setSelectedLibraryPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function addCustomPrompt() {
    const t = newCustomText.trim();
    if (!t) return;
    const item = { id: uid("cust"), text: t };
    setCustomList((prev) => [item, ...prev]);
    setSelectedCustomIds((prev) => new Set(prev).add(item.id));
    setNewCustomText("");
  }

  function removeCustomPrompt(id: string) {
    setCustomList((prev) => prev.filter((x) => x.id !== id));
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleCustomSelected(id: string) {
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCustomPrompts: string[] = useMemo(
    () => customList.filter((c) => selectedCustomIds.has(c.id)).map((c) => c.text),
    [customList, selectedCustomIds]
  );

  const onlyCustom = selectedLibraryPrompts.size === 0 && selectedCustomPrompts.length > 0;
  const mixSelected = selectedLibraryPrompts.size > 0 && selectedCustomPrompts.length > 0;

  async function runExtraction() {
    setLoading(true);
    try {
      const promptsToRun = [
        ...Array.from(selectedLibraryPrompts),
        ...selectedCustomPrompts,
      ];

      // Decide config
      let config: { model?: string; system?: string } | undefined = undefined;
      let fieldsHint: string[] | undefined = undefined;
      let nameMeta: string | undefined = undefined;

      if (onlyCustom) {
        config = { model: customModel, system: customSystem };
        fieldsHint = fieldNames.length ? fieldNames : undefined;
        nameMeta = promptSetName || undefined;
      } else {
        // default to the form's config (even if it's a mix with custom prompts)
        const def = DEFAULT_CONFIGS[selectedForm];
        config = def ? { ...def } : undefined;
      }

      // TODO: Replace mockExtract with your real API call
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
    } catch (err) {
      console.error(err);
      alert("Extraction failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(id: string, value: string) {
    setResult((prev) => {
      if (!prev) return prev;
      const next = prev.fields.map((f) => (f.id === id ? { ...f, value } : f));
      return { fields: next };
    });
  }

  // JSON & XML strings
  const jsonText = useMemo(() => (result ? JSON.stringify(result, null, 2) : "{}"), [result]);
  const xmlText = useMemo(() => (result ? toXML(result.fields) : "<extraction/>"), [result]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-neutral-900 text-white grid place-items-center">
            <FileText size={18} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight">Bank Documents Playground</h1>
            <p className="text-sm text-neutral-500 -mt-0.5">A safe, read‑only space for users without admin privileges</p>
          </div>
        </div>
      </header>

      {/* Controls */}
      <section className="mx-auto max-w-7xl px-4 py-6">
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
            {/* Custom prompt list */}
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

        {/* Only‑custom configuration (shown ONCE, only when no library prompts are selected) */}
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

        {/* Mixed selection – show notice that defaults apply */}
        {mixSelected && (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            A mix of library and custom prompts is selected. The system will use the default configuration for <span className="font-medium">{FORMS.find(f => f.value === selectedForm)?.label}</span>.
          </div>
        )}
      </section>

      {/* Workspace split */}
      <section className="mx-auto max-w-7xl px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[62vh]">
          {/* PDF viewer pane */}
          <div ref={pdfPaneRef} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-medium">Document preview</h2>
              <span className="text-xs text-neutral-500">Left pane</span>
            </div>
            <div className="relative h-[70vh]">
              {pdfUrl ? (
                <>
                  {/* PDF content */}
                  <object data={pdfUrl} type="application/pdf" className="absolute inset-0 w-full h-full" aria-label="PDF Preview">
                    <p className="p-6 text-sm text-neutral-500">
                      Your browser can't display the PDF inline. <a className="underline" href={pdfUrl} target="_blank" rel="noreferrer">Open the file</a> instead.
                    </p>
                  </object>

                  {/* Highlight overlay (normalized coords) */}
                  {activeCoord && (
                    <div
                      className="pointer-events-none absolute border-2 border-amber-500/80 bg-amber-200/20 rounded"
                      style={{
                        left: `${activeCoord.bbox[0] * 100}%`,
                        top: `${activeCoord.bbox[1] * 100}%`,
                        width: `${activeCoord.bbox[2] * 100}%`,
                        height: `${activeCoord.bbox[3] * 100}%`,
                        boxShadow: "0 0 0 1px rgba(245, 158, 11, 0.35) inset",
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="h-full grid place-items-center p-8 text-center">
                  <div>
                    <Upload className="mx-auto mb-3" />
                    <p className="text-sm text-neutral-500 max-w-sm">Upload a PDF to preview it here. Extraction works best when you provide the exact document type you selected above.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right pane with tabs */}
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-medium">Results</h2>
              <span className="text-xs text-neutral-500">Right pane</span>
            </div>

            {/* Tabs */}
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
                <div className="overflow-auto max-h-[66vh]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-neutral-500 border-b">
                        <th className="py-2 pr-3 font-medium">Field</th>
                        <th className="py-2 pr-3 font-medium">Value (click to select)</th>
                        <th className="py-2 pr-3 font-medium">Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.fields.map((f) => (
                        <tr key={f.id} className="border-b last:border-none">
                          <td className="py-2 pr-3 align-top w-1/3">
                            <button
                              className="text-left hover:underline"
                              onClick={() => f.coord && setActiveCoord(f.coord)}
                              title="Highlight on PDF"
                            >
                              {f.label}
                            </button>
                          </td>
                          <td className="py-2 pr-3 align-top">
                            <input
                              value={f.value}
                              onChange={(e) => updateField(f.id, e.target.value)}
                              onFocus={() => f.coord && setActiveCoord(f.coord)}
                              className="w-full rounded-xl border border-neutral-300 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-neutral-900"
                            />
                          </td>
                          <td className="py-2 pr-3 align-top text-neutral-500">
                            {f.coord?.page ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : previewTab === "json" ? (
                <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto max-h-[66vh] whitespace-pre-wrap">{jsonText}</pre>
              ) : (
                <pre className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto max-h-[66vh] whitespace-pre-wrap">{xmlText}</pre>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <footer className="mx-auto max-w-7xl px-4 pb-8">
        <div className="text-[12px] text-neutral-500">
          <p>
            This is a non‑admin playground. No data is persisted. To integrate with production services, connect the Run
            Extraction action to your AI agent endpoint. When combining library & custom prompts, the component defaults
            to the form's predefined system configuration.
          </p>
        </div>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
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

function PdfUpload({ onUrl, url }: { onUrl: (u: string | null) => void; url: string | null }) {
  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
          <span className="text-sm text-neutral-600 truncate">Selected: <span className="font-medium">{url.split("/").pop()}</span></span>
        ) : (
          <span className="text-sm text-neutral-400">No file selected</span>
        )}
      </div>
    </div>
  );
}
