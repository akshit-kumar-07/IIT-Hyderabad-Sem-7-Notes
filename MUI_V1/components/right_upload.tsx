import * as React from "react";
import {
  Box,
  Drawer,
  Paper,
  Stack,
  Typography,
  IconButton,
  Button,
  Divider,
  TextField,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UploadFileIcon from "@mui/icons-material/UploadFile";

/**
 * useRightUploadPanel — a reusable hook that shows a focused right-side Drawer for uploads.
 *
 * Requirements:
 *  - Opens when an upload button somewhere on the page is clicked
 *  - Drawer is focused (modal) and anchored to the RIGHT
 *  - Two parts:
 *     (1) Drag & Drop + multi-file chooser
 *     (2) ICMP Metadata form + upload
 *
 * Purely MUI (no external drop libraries). Uses native drag/drop + input[type=file].
 */

export type IcmpMetadata = {
  type: string; // 0-255
  code: string; // 0-255
  checksum: string; // hex string or number
  identifier?: string;
  sequence?: string;
  payload?: string;
};

export type UseRightUploadPanelOptions = {
  onUploadFiles?: (files: File[]) => Promise<void> | void;
  onUploadWithMetadata?: (files: File[], metadata: IcmpMetadata) => Promise<void> | void;
  drawerWidth?: number; // default 420
  title?: string; // default "Upload"
};

/**
 * VALIDATOR (robust to undefined/null/partial input)
 * Defaults missing fields to empty strings and coerces values to strings.
 * Never throws.
 */
export function validateIcmpMetadata(metaInput?: Partial<IcmpMetadata> | null) {
  const base: IcmpMetadata = {
    type: "",
    code: "",
    checksum: "",
    identifier: "",
    sequence: "",
    payload: "",
  };

  const src = metaInput && typeof metaInput === "object" ? metaInput : {};
  // Coerce to strings to tolerate numeric/null/undefined inputs.
  const meta: IcmpMetadata = {
    ...base,
    ...(src as any),
    type: (src as any)?.type != null ? String((src as any).type) : "",
    code: (src as any)?.code != null ? String((src as any).code) : "",
    checksum: (src as any)?.checksum != null ? String((src as any).checksum) : "",
    identifier: (src as any)?.identifier != null ? String((src as any).identifier) : "",
    sequence: (src as any)?.sequence != null ? String((src as any).sequence) : "",
    payload: (src as any)?.payload != null ? String((src as any).payload) : "",
  };

  const errors: Partial<Record<keyof IcmpMetadata, string>> = {};

  const intInRange = (v: string, name: keyof IcmpMetadata) => {
    const val = (v ?? "").trim();
    if (val === "") {
      errors[name] = "Required";
      return;
    }
    // Only integers 0..255
    if (!/^\d+$/.test(val)) {
      errors[name] = "Must be an integer 0–255";
      return;
    }
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0 || n > 255) errors[name] = "Must be an integer 0–255";
  };

  intInRange(meta.type, "type");
  intInRange(meta.code, "code");

  const checksumVal = (meta.checksum ?? "").trim();
  if (checksumVal === "") errors.checksum = "Required";
  else {
    const hexOk = /^([0-9a-fA-F]{1,8})$/.test(checksumVal);
    const numOk = /^\d+$/.test(checksumVal);
    if (!hexOk && !numOk) errors.checksum = "Use hex (e.g. ff02) or decimal";
  }

  return errors;
}

export function useRightUploadPanel(options: UseRightUploadPanelOptions = {}) {
  const { onUploadFiles, onUploadWithMetadata, drawerWidth = 420, title = "Upload" } = options;

  const [open, setOpen] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Initialize meta with empty strings so fields are always defined.
  const [meta, setMeta] = React.useState<IcmpMetadata>({
    type: "",
    code: "",
    checksum: "",
    identifier: "",
    sequence: "",
    payload: "",
  });
  const [metaErrors, setMetaErrors] = React.useState<Partial<Record<keyof IcmpMetadata, string>>>({});

  // Derived: is the current metadata valid? (Live validation)
  const isMetaValid = React.useMemo(() => Object.keys(validateIcmpMetadata(meta)).length === 0, [meta]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const openPanel = React.useCallback(() => setOpen(true), []);
  const closePanel = React.useCallback(() => {
    if (busy) return; // avoid closing mid-upload
    setOpen(false);
  }, [busy]);

  const onFilesChosen = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const onDragOverHandler: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDragLeaveHandler: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleUploadFiles = async () => {
    if (!onUploadFiles) return;
    try {
      setBusy(true);
      await onUploadFiles(files);
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  const handleUploadWithMeta = async () => {
    if (!onUploadWithMetadata) return;
    // Validate robustly (handles undefined/null/partial)
    const errs = validateIcmpMetadata(meta);
    setMetaErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      setBusy(true);
      await onUploadWithMetadata(files, meta);
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  const RightUploadPanel = React.useCallback(
    () => (
      <Drawer
        anchor="right"
        open={open}
        onClose={closePanel}
        variant="temporary"
        keepMounted
        ModalProps={{ disableEnforceFocus: false }}
        PaperProps={{ sx: { width: drawerWidth, display: "flex" } }}
      >
        <Stack direction="column" sx={{ height: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5 }}>
            <Typography variant="h6">{title}</Typography>
            <IconButton onClick={closePanel} aria-label="Close" disabled={busy}>
              <CloseIcon />
            </IconButton>
          </Stack>
          {busy && <LinearProgress />}
          <Divider />

          {/* Part 1: Drag & Drop + Multi-file picker */}
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Files
            </Typography>
            <Paper
              variant="outlined"
              onDrop={onDrop}
              onDragOver={onDragOverHandler}
              onDragLeave={onDragLeaveHandler}
              sx={{
                p: 2,
                textAlign: "center",
                borderStyle: dragOver ? "solid" : "dashed",
                borderWidth: 2,
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <CloudUploadIcon />
              <Typography variant="body2" sx={{ mt: 1 }}>
                Drag & drop files here, or click to select
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => onFilesChosen(e.target.files)}
                aria-label="Choose files"
              />
            </Paper>

            {files.length > 0 && (
              <List dense>
                {files.map((f, i) => (
                  <ListItem
                    key={`${f.name}-${i}`}
                    divider
                    secondaryAction={
                      <Tooltip title="Remove">
                        <IconButton edge="end" onClick={() => removeFile(i)}>
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <ListItemText primary={f.name} secondary={`${(f.size / 1024).toFixed(1)} KB`} />
                  </ListItem>
                ))}
              </List>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                onClick={handleUploadFiles}
                disabled={!onUploadFiles || files.length === 0 || busy}
              >
                Upload Files
              </Button>
            </Stack>
          </Box>

          <Divider />

          {/* Part 2: ICMP Metadata upload */}
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              ICMP Metadata
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                label="Type (0-255)"
                size="small"
                value={meta.type}
                onChange={(e) => setMeta((m) => ({ ...m, type: e.target.value }))}
                error={!!metaErrors.type}
                helperText={metaErrors.type}
                sx={{ width: 140 }}
              />
              <TextField
                label="Code (0-255)"
                size="small"
                value={meta.code}
                onChange={(e) => setMeta((m) => ({ ...m, code: e.target.value }))}
                error={!!metaErrors.code}
                helperText={metaErrors.code}
                sx={{ width: 140 }}
              />
              <TextField
                label="Checksum (hex or dec)"
                size="small"
                value={meta.checksum}
                onChange={(e) => setMeta((m) => ({ ...m, checksum: e.target.value }))}
                error={!!metaErrors.checksum}
                helperText={metaErrors.checksum}
              />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                label="Identifier"
                size="small"
                value={meta.identifier}
                onChange={(e) => setMeta((m) => ({ ...m, identifier: e.target.value }))}
              />
              <TextField
                label="Sequence"
                size="small"
                value={meta.sequence}
                onChange={(e) => setMeta((m) => ({ ...m, sequence: e.target.value }))}
              />
            </Stack>
            <TextField
              label="Payload"
              size="small"
              value={meta.payload}
              onChange={(e) => setMeta((m) => ({ ...m, payload: e.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleUploadWithMeta}
                disabled={!onUploadWithMetadata || busy || !isMetaValid}
                startIcon={<CloudUploadIcon />}
              >
                Upload With Metadata
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Drawer>
    ),
    [open, closePanel, drawerWidth, title, dragOver, files, busy, meta, metaErrors, isMetaValid]
  );

  return {
    openPanel,
    closePanel,
    RightUploadPanel,
    files,
    setFiles,
    meta,
    setMeta,
  } as const;
}

/**
 * Example usage component (used for live preview here)
 */
export function UploadButtonDemo() {
  const { openPanel, RightUploadPanel } = useRightUploadPanel({
    onUploadFiles: async (files) => {
      // Simulate upload
      await new Promise((r) => setTimeout(r, 400));
      console.log("Uploaded files:", files.map((f) => f.name));
    },
    onUploadWithMetadata: async (files, meta) => {
      // Simulate upload with metadata
      await new Promise((r) => setTimeout(r, 400));
      console.log("Uploaded with ICMP metadata:", { files: files.map((f) => f.name), meta });
    },
  });

  return (
    <Box>
      <Button variant="contained" onClick={openPanel} startIcon={<CloudUploadIcon />}>
        Open Upload
      </Button>
      <RightUploadPanel />
    </Box>
  );
}

// Default export so the canvas can render a live preview
export default function Preview() {
  return <UploadButtonDemo />;
}

// --- Minimal test cases (run under Jest/Vitest) ---
// These do not run automatically in the browser; they're here to clarify the expected behavior.
// 1) ICMP validator edge cases
//    - Valid
//    - Missing required
//    - Out of range
//    - Empty/undefined/null meta should not throw and should surface errors
export function __test_validateIcmpMetadata() {
  const ok = validateIcmpMetadata({ type: "8", code: "0", checksum: "ff02" });
  console.assert(Object.keys(ok).length === 0, "Expected no errors for valid meta");

  const missing = validateIcmpMetadata({ type: "", code: "", checksum: "" });
  console.assert(!!missing.type && !!missing.code && !!missing.checksum, "Expected required errors");

  const out = validateIcmpMetadata({ type: "300", code: "-1", checksum: "xyz" });
  console.assert(out.type && out.code && out.checksum, "Expected range/format errors");

  // Robustness against undefined/partial inputs
  const fromUndefined = validateIcmpMetadata(undefined);
  console.assert(fromUndefined.type && fromUndefined.code && fromUndefined.checksum, "Undefined meta should produce required errors");

  const fromNull = validateIcmpMetadata(null);
  console.assert(fromNull.type && fromNull.code && fromNull.checksum, "Null meta should produce required errors");

  const fromEmptyObject = validateIcmpMetadata({});
  console.assert(fromEmptyObject.type && fromEmptyObject.code && fromEmptyObject.checksum, "Empty meta should produce required errors");

  const numbersCoerced = validateIcmpMetadata({ type: 8 as any, code: 0 as any, checksum: 255 as any });
  console.assert(Object.keys(numbersCoerced).length === 0, "Numeric inputs should be coerced to strings and validate");

  const withWhitespace = validateIcmpMetadata({ type: " ", code: " \t ", checksum: "   " });
  console.assert(withWhitespace.type && withWhitespace.code && withWhitespace.checksum, "Whitespace should be treated as empty");

  const nonInteger = validateIcmpMetadata({ type: "12.3", code: "abc", checksum: "10" });
  console.assert(nonInteger.type && nonInteger.code && !nonInteger.checksum, "Non-integer type/code invalid; decimal checksum OK");

  return true;
}
