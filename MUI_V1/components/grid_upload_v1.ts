import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef, GridRowModel } from "@mui/x-data-grid";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

/**
 * Process-aware upload panel (MUI) — strictly follows the flow you described:
 *
 * 1) Click **Upload** ➜ open right drawer that shows **only** the drag & drop picker.
 * 2) After the user selects/drops files ➜ a unique **hash** is created **based on the document name**.
 * 3) The drawer **expands** and then shows a **metadata grid** whose columns are defined by the selected process
 *    (e.g., Consumer Lending, CFS, BLAST, etc.).
 * 4) The grid shows **rows = number of uploaded documents**. Each cell is internally identified as
 *    `<fieldName>_<docHash>`. We also surface this identifier via the cell tooltip for transparency.
 * 5) The grid accommodates up to **maxVisibleColumns** (default 10) before introducing a **horizontal scrollbar**.
 *
 * Reuse options:
 *  - Use the hook `useProcessUpload()` for full control, or drop in `<ProcessUploadKit />` for out-of-the-box UI.
 */

// === Types ===
export type ProcessConfig = {
  id: string;
  label: string;
  /** Define grid columns for this process (field + headerName are required) */
  columns: Array<Pick<GridColDef, "field" | "headerName"> & Partial<GridColDef>>;
};

export type UseProcessUploadOptions = {
  processConfigs: ProcessConfig[];
  defaultProcessId?: string;
  maxFiles?: number;
  /** Max number of columns visible before horizontal scroll appears */
  maxVisibleColumns?: number; // default 10
  /** Fixed pixel width per column to drive horizontal scroll behavior */
  columnWidth?: number; // default 180
};

export type UseProcessUploadAPI = {
  processId: string;
  setProcessId: (id: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  files: File[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (fileKey: string) => void;
  clear: () => void;
  columns: GridColDef[];
  rows: GridRowModel[];
  processRowUpdate: (newRow: GridRowModel) => GridRowModel;
  drawerWidth: number;
  isDragging: boolean;
  dropZoneHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  fileKey: (f: File) => string;
  /** Hash derived from a file name (short, stable) */
  fileHash: (name: string) => string;
  /** Build a unique cell id as requested: <fieldName>_<docHash> */
  cellId: (field: string, docHash: string) => string;
  processConfigs: ProcessConfig[];
  /** Layout config */
  maxVisibleColumns: number;
  columnWidth: number;
  /** Whether we have files uploaded (used to show/hide grid) */
  hasFiles: boolean;
  /** Export payload where metadata keys are <field>_<docHash> */
  exportPayload: () => Array<{ docName: string; docHash: string; metadata: Record<string, any> }>; 
};

// === Hash util (based on document name) ===
// DJB2-derived simple hash of the file name; returns short base36 string
function hashFromName(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) + name.charCodeAt(i);
  }
  // Convert to unsigned and then to base36 for compactness
  return Math.abs(h >>> 0).toString(36);
}

// === Hook ===
export function useProcessUpload(options: UseProcessUploadOptions): UseProcessUploadAPI {
  const {
    processConfigs,
    defaultProcessId,
    maxFiles,
    maxVisibleColumns = 10,
    columnWidth = 180,
  } = options;

  const [open, setOpen] = React.useState(false);
  const [processId, setProcessId] = React.useState(
    defaultProcessId || processConfigs[0]?.id
  );
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setDragging] = React.useState(false);

  // Per-file row state (stores both displayed values and hashed keys for payload)
  type RowState = {
    fileKey: string;
    file: File;
    docHash: string; // hash derived from file.name
    // per-process plain values for display (keys = column.field)
    valuesByProcess: Record<string, Record<string, any>>;
    // per-process hashed values for export (keys = `${field}_${docHash}`)
    hashedByProcess: Record<string, Record<string, any>>;
  };
  const [rowsState, setRowsState] = React.useState<RowState[]>([]);

  const fileKey = React.useCallback((f: File) => `${f.name}-${f.size}-${f.lastModified}`,[/* stable */]);
  const fileHash = React.useCallback((name: string) => hashFromName(name), []);
  const cellId = React.useCallback((field: string, docHash: string) => `${field}_${docHash}`,[/* stable */]);

  const activeConfig = React.useMemo(
    () => processConfigs.find((p) => p.id === processId)!,
    [processId, processConfigs]
  );

  // Ensure columns have fixed widths to enable horizontal scroll after N columns
  const columns: GridColDef[] = React.useMemo(() => {
    const cols = activeConfig?.columns || [];
    return cols.map((c) => ({
      width: columnWidth,
      sortable: false,
      editable: true,
      ...c,
      flex: undefined, // force fixed width to allow horizontal scroll
      renderCell: (params) => {
        // Show the required unique cell id as a tooltip title
        const docHash = (params.row as any).docHash as string;
        const cid = cellId(params.field, docHash);
        return (
          <span title={cid} style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {params.value}
          </span>
        );
      },
    }));
  }, [activeConfig, columnWidth, cellId]);

  const addFiles = React.useCallback(
    (input: FileList | File[]) => {
      const incoming = Array.from(input);
      setFiles((prev) => {
        const currentKeys = new Set(prev.map(fileKey));
        const added: File[] = [];
        for (const f of incoming) {
          const k = fileKey(f);
          if (!currentKeys.has(k)) added.push(f);
        }
        const merged = [...prev, ...added];
        return maxFiles ? merged.slice(0, maxFiles) : merged;
      });
      // Drawer stays open; grid will appear automatically after state sync
    },
    [fileKey, maxFiles]
  );

  // Build/update rowsState whenever files or process configs change
  React.useEffect(() => {
    setRowsState((prev) => {
      const prevByKey = new Map(prev.map((r) => [r.fileKey, r]));
      const newRows: RowState[] = [];

      for (const f of files) {
        const k = fileKey(f);
        const existing = prevByKey.get(k);
        const docHash = existing?.docHash ?? fileHash(f.name);

        const valuesByProcess = existing?.valuesByProcess || {};
        const hashedByProcess = existing?.hashedByProcess || {};

        // ensure per-process objects and default empty strings for each field
        for (const pc of processConfigs) {
          valuesByProcess[pc.id] = valuesByProcess[pc.id] || {};
          hashedByProcess[pc.id] = hashedByProcess[pc.id] || {};
          for (const col of pc.columns) {
            const fld = col.field;
            if (!(fld in valuesByProcess[pc.id])) valuesByProcess[pc.id][fld] = "";
            const key = `${fld}_${docHash}`;
            if (!(key in hashedByProcess[pc.id])) hashedByProcess[pc.id][key] = "";
          }
        }

        newRows.push({ fileKey: k, file: f, docHash, valuesByProcess, hashedByProcess });
      }

      return newRows;
    });
  }, [files, fileKey, fileHash, processConfigs]);

  // Rows for DataGrid (display only). We also include docHash on each row for renderCell tooltip usage
  const rows: GridRowModel[] = React.useMemo(() => {
    return rowsState.map((r) => ({ id: r.fileKey, docHash: r.docHash, ...r.valuesByProcess[processId] }));
  }, [rowsState, processId]);

  // Persist edits both to plain values and hashed keys for the active process
  const processRowUpdate = React.useCallback(
    (newRow: GridRowModel) => {
      setRowsState((prev) => prev.map((r) => {
        if (r.fileKey !== newRow.id) return r;

        const nextValues = { ...r.valuesByProcess };
        const nextHashed = { ...r.hashedByProcess };

        const plain = { ...nextValues[processId] };
        const hashed = { ...nextHashed[processId] };

        for (const [k, v] of Object.entries(newRow)) {
          if (k === "id" || k === "docHash") continue;
          plain[k] = v;
          const key = `${k}_${r.docHash}`;
          hashed[key] = v;
        }

        nextValues[processId] = plain;
        nextHashed[processId] = hashed;
        return { ...r, valuesByProcess: nextValues, hashedByProcess: nextHashed };
      }));
      return newRow;
    },
    [processId]
  );

  const removeFile = React.useCallback((key: string) => {
    setFiles((prev) => prev.filter((f) => fileKey(f) !== key));
  }, [fileKey]);

  const clear = React.useCallback(() => {
    setFiles([]);
  }, []);

  // DnD handlers
  const dropZoneHandlers = React.useMemo(() => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setDragging(false);
      const dt = e.dataTransfer; if (dt?.files && dt.files.length > 0) addFiles(dt.files);
    },
  }), [addFiles]);

  // Drawer expands after files are present and process has columns
  const hasFiles = files.length > 0;
  const drawerWidth = hasFiles && columns.length > 0 ? 1024 : 420;

  const exportPayload = React.useCallback(() => {
    // Returns array of documents with hashed metadata keys as requested
    return rowsState.map((r) => ({
      docName: r.file.name,
      docHash: r.docHash,
      metadata: { ...r.hashedByProcess[processId] },
    }));
  }, [rowsState, processId]);

  return {
    processId,
    setProcessId,
    open,
    setOpen,
    files,
    addFiles,
    removeFile,
    clear,
    columns,
    rows,
    processRowUpdate,
    drawerWidth,
    isDragging,
    dropZoneHandlers,
    fileKey,
    fileHash,
    cellId,
    processConfigs,
    maxVisibleColumns,
    columnWidth,
    hasFiles,
    exportPayload,
  };
}

// === Example process schemas (replace with your bank's real metadata fields) ===
export const DEFAULT_PROCESS_CONFIGS: ProcessConfig[] = [
  {
    id: "BLAST",
    label: "BLAST Process",
    columns: [
      { field: "blastId", headerName: "BLAST ID" },
      { field: "region", headerName: "Region" },
      { field: "segment", headerName: "Segment" },
      { field: "owner", headerName: "Owner" },
      { field: "status", headerName: "Status" },
      { field: "remarks", headerName: "Remarks" },
    ],
  },
  {
    id: "CFS",
    label: "CFS Process",
    columns: [
      { field: "caseId", headerName: "Case ID" },
      { field: "branch", headerName: "Branch" },
      { field: "amount", headerName: "Amount" },
      { field: "currency", headerName: "Currency" },
      { field: "initiator", headerName: "Initiator" },
      { field: "dueDate", headerName: "Due Date" },
      { field: "checker", headerName: "Checker" },
      { field: "comments", headerName: "Comments" },
    ],
  },
  {
    id: "CONSUMER_LENDING",
    label: "Consumer Lending",
    columns: [
      { field: "applicationId", headerName: "Application ID" },
      { field: "customerId", headerName: "Customer ID" },
      { field: "product", headerName: "Product" },
      { field: "loanAmount", headerName: "Loan Amount" },
      { field: "tenure", headerName: "Tenure (mo)" },
      { field: "rate", headerName: "Rate (%)" },
      { field: "income", headerName: "Income" },
      { field: "employment", headerName: "Employment" },
      { field: "riskScore", headerName: "Risk Score" },
      { field: "coApplicant", headerName: "Co-Applicant" },
      { field: "purpose", headerName: "Purpose" },
      { field: "collateral", headerName: "Collateral" },
      { field: "channel", headerName: "Channel" },
      { field: "branch", headerName: "Branch" },
      { field: "rm", headerName: "RM" },
      { field: "sanctionDate", headerName: "Sanction Date" },
      { field: "disbursalDate", headerName: "Disbursal Date" },
      { field: "currentStatus", headerName: "Current Status" },
      { field: "remark1", headerName: "Remark 1" },
      { field: "remark2", headerName: "Remark 2" },
    ],
  },
];

// === Component (selector + upload button + drawer with upload screen; grid appears only after upload) ===
export type ProcessUploadKitProps = {
  processConfigs?: ProcessConfig[];
  defaultProcessId?: string;
  maxFiles?: number;
  maxVisibleColumns?: number; // default 10
  columnWidth?: number; // default 180
  hideSelector?: boolean;
  hideUploadButton?: boolean;
  uploadButtonText?: string;
};

export default function ProcessUploadKit({
  processConfigs = DEFAULT_PROCESS_CONFIGS,
  defaultProcessId,
  maxFiles,
  maxVisibleColumns,
  columnWidth,
  hideSelector,
  hideUploadButton,
  uploadButtonText = "Upload",
}: ProcessUploadKitProps) {
  const api = useProcessUpload({ processConfigs, defaultProcessId, maxFiles, maxVisibleColumns, columnWidth });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { open, setOpen, files, removeFile, clear, columns, rows, processRowUpdate, drawerWidth, isDragging, dropZoneHandlers, hasFiles } = api;

  const activeLabel = api.processConfigs.find((p) => p.id === api.processId)?.label || api.processId;

  const gridViewportWidth = api.columnWidth * api.maxVisibleColumns;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center">
        {!hideSelector && (<ProcessSelector api={api} />)}
        {!hideUploadButton && (
          <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => setOpen(true)}>
            {uploadButtonText}
          </Button>
        )}
      </Stack>

      {/* Hidden chooser */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => { if (e.target.files) api.addFiles(e.target.files); }}
      />

      {/* Right Drawer */}
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: drawerWidth, display: 'flex', flexDirection: 'column' } }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Upload to <strong>{activeLabel}</strong>
          </Typography>
          <Chip label={`${files.length} file${files.length === 1 ? '' : 's'}`} size="small" />
          <Tooltip title="Close"><IconButton onClick={() => setOpen(false)}><CloseIcon /></IconButton></Tooltip>
        </Box>
        <Divider />

        {/* Upload screen — ALWAYS visible; shows only picker before any files */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box
            {...dropZoneHandlers}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: isDragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragging ? 'action.hover' : 'transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Stack spacing={1} alignItems="center">
              <CloudUploadIcon />
              <Typography variant="subtitle1">Drag & drop files here</Typography>
              <Typography variant="body2">or click to choose multiple files</Typography>
            </Stack>
          </Box>

          {/* Selected files list (chips including hash tooltip) */}
          {files.length > 0 && (
            <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
              {files.map((f) => {
                const k = api.fileKey(f);
                const h = api.fileHash(f.name);
                return (
                  <Chip
                    key={k}
                    label={f.name}
                    title={`hash: ${h}`}
                    onDelete={() => removeFile(k)}
                    deleteIcon={<DeleteOutlineIcon />}
                    sx={{ maxWidth: 280 }}
                  />
                );
              })}
              <Chip color="error" variant="outlined" label="Clear all" onClick={clear} />
            </Stack>
          )}
        </Box>

        {/* Metadata Grid — appears ONLY after files are uploaded */}
        {hasFiles && (
          <Box sx={{ flex: 1, p: 2, overflowX: 'auto' }}>
            {columns?.length ? (
              <Box sx={{ width: gridViewportWidth, maxWidth: '100%' }}>
                <DataGrid
                  autoHeight={false}
                  rows={rows}
                  columns={columns}
                  editMode="row"
                  processRowUpdate={processRowUpdate}
                  experimentalFeatures={{ newEditingApi: true }}
                  disableColumnMenu
                  disableColumnSelector
                  rowSelection={false}
                  sx={{
                    height: '100%',
                    '& .MuiDataGrid-cell': { outline: 'none' },
                  }}
                />
              </Box>
            ) : (
              <EmptyState title="No columns for this process" subtitle="Configure metadata fields for the selected process." />
            )}
          </Box>
        )}
      </Drawer>
    </Box>
  );
}

// === Subcomponents ===
function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Stack height="100%" alignItems="center" justifyContent="center" spacing={1}>
      <Typography variant="subtitle1">{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
    </Stack>
  );
}

export function ProcessSelector({ api }: { api: UseProcessUploadAPI }) {
  return (
    <ToggleButtonGroup color="primary" value={api.processId} exclusive onChange={(_, val) => val && api.setProcessId(val)}>
      {api.processConfigs.map((p) => (
        <ToggleButton key={p.id} value={p.id}>
          {p.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// === Optional demo ===
export function DemoProcessUpload() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>Process Upload Demo</Typography>
      <ProcessUploadKit defaultProcessId="CONSUMER_LENDING" />
    </Box>
  );
}
