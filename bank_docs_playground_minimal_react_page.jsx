import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Play, Upload, ChevronDown, Sparkles, Loader2 } from "lucide-react";

/**
 * Minimal, elegant single-file React page for a bank documents "playground" redirect.
 *
 * Key features:
 * - Form selector (e.g., 10-K, 1099, 1040, W-2, etc.)
 * - Prompt picker (changes with form) + Run Extraction button
 * - PDF input (upload) and preview in left bottom pane
 * - Editable, spreadsheet-like table in right bottom pane
 * - Clicking any table cell highlights the corresponding PDF region
 * - Clean, minimal styling via Tailwind (no additional CSS required)
 * - Framer Motion micro-animations for a polished feel
 * - Single-file component, ready to drop into a React codebase
 *
 * Integration notes:
 * - Replace mockExtract() with a real API call to your AI agent.
 * - Expect the agent to return JSON with extraction values and normalized coords (0..1)
 *   for page-relative bounding boxes, e.g. { page: 1, bbox: [x, y, w, h] }.
 * - If you have absolute PDF coordinates, map them to normalized percentages
 *   using the rendered PDF pane size in this component.
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

// ---------------------------------------------
// Mock extraction. Replace with your real API call.
// ---------------------------------------------
async function mockExtract(_args: {
  form: string;
  prompt: string;
  pdfBlob?: Blob | null;
}): Promise<{
  fields: Array<{ id: string; label: string; value: string; coord?: { page: number; bbox: [number, number, number, number] } }>;
}> {
  // Fake latency
  await new Promise((r) => setTimeout(r, 900));

  // Very small demo schema; coordinates are normalized to the PDF pane
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

export default function BankDocsPlayground() {
  const [selectedForm, setSelectedForm] = useState(FORMS[0].value);
  const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_LIBRARY[FORMS[0].value][0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    fields: Array<{ id: string; label: string; value: string; coord?: { page: number; bbox: [number, number, number, number] } }>;
  } | null>(null);
  const [activeCoord, setActiveCoord] = useState<{ page: number; bbox: [number, number, number, number] } | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfPaneRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => PROMPT_LIBRARY[selectedForm] || [], [selectedForm]);

  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      const url = URL.createObjectURL(f);
      setPdfUrl(url);
    }
  }

  async function runExtraction() {
    setLoading(true);
    try {
      const effectivePrompt = customPrompt.trim() || selectedPrompt;
      // TODO: Replace mockExtract with your real API call
      const payload = await mockExtract({ form: selectedForm, prompt: effectivePrompt, pdfBlob: null });
      // Stabilize IDs
      const stabilized = payload.fields.map((f) => ({ ...f, id: f.id || uid("field") }));
      setResult({ fields: stabilized });
      if (stabilized[0]?.coord) setActiveCoord(stabilized[0].coord);
    } catch (err) {
      // eslint-disable-next-line no-console
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
            <p className="text-sm text-neutral-500 -mt-0.5">A safe, read-only space for users without admin privileges</p>
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
                onChange={(e) => {
                  setSelectedForm(e.target.value);
                  const firstPrompt = PROMPT_LIBRARY[e.target.value]?.[0] || "";
                  setSelectedPrompt(firstPrompt);
                  setCustomPrompt("");
                }}
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

          {/* Prompt picker */}
          <div className="md:col-span-5">
            <label className="block text-sm font-medium mb-2">Prompt</label>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 relative">
                <select
                  value={selectedPrompt}
                  onChange={(e) => setSelectedPrompt(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 pr-9 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900"
                >
                  {prompts.map((p, idx) => (
                    <option key={idx} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <Sparkles className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={16} />
              </div>
            </div>
            <p className="text-[12px] text-neutral-500 mt-2">Optionally override with a custom prompt below.</p>
          </div>

          {/* Custom prompt */}
          <div className="md:col-span-4">
            <label className="block text-sm font-medium mb-2">Custom prompt (optional)</label>
            <input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Type your own extraction instruction..."
              className="w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* PDF upload */}
          <div className="md:col-span-8">
            <label className="block text-sm font-medium mb-2">PDF document</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white px-3 py-2.5 text-sm cursor-pointer hover:shadow-sm transition">
                <Upload size={16} />
                <span>Upload PDF</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
              </label>
              {pdfUrl ? (
                <span className="text-sm text-neutral-600 truncate">Selected: <span className="font-medium">{pdfUrl.split("/").pop()}</span></span>
              ) : (
                <span className="text-sm text-neutral-400">No file selected</span>
              )}
            </div>
          </div>

          {/* Run extraction */}
          <div className="md:col-span-4 flex items-end">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={runExtraction}
              disabled={loading}
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

          {/* Table pane */}
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-medium">Extracted data (editable)</h2>
              <span className="text-xs text-neutral-500">Right pane</span>
            </div>

            <div className="p-4">
              {!result ? (
                <p className="text-sm text-neutral-500">Run an extraction to populate this table.</p>
              ) : result.fields.length === 0 ? (
                <p className="text-sm text-neutral-500">No fields returned by the extractor.</p>
              ) : (
                <div className="overflow-auto max-h-[70vh]">
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
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <footer className="mx-auto max-w-7xl px-4 pb-8">
        <div className="text-[12px] text-neutral-500">
          <p>
            This is a non-admin playground. No data is persisted. To integrate with production services, connect the Run
            Extraction action to your AI agent endpoint and map coordinates to highlight regions in the PDF pane.
          </p>
        </div>
      </footer>
    </div>
  );
}
