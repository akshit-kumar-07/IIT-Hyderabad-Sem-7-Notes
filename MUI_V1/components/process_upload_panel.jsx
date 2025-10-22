import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  Fade,
  IconButton,
  LinearProgress,
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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

export default function ProcessUploadPanel() {
  type ProcessConfig = {
    id: string;
    label: string;
    columns: {
      field: string;
      headerName: string;
      type?: "string" | "number" | "date";
      required?: boolean;
      min?: number;
      max?: number;
    }[];
  };

  const DEFAULT_PROCESS_CONFIGS: ProcessConfig[] = [
    {
      id: "CONSUMER_LENDING",
      label: "Consumer Lending",
      columns: Array.from({ length: 15 }, (_, i) => ({
        field: `meta${i + 1}`,
        headerName: `Metadata ${i + 1}`,
        required: i % 2 === 0,
      })),
    },
    {
      id: "CFS",
      label: "CFS",
      columns: Array.from({ length: 8 }, (_, i) => ({
        field: `meta${i + 1}`,
        headerName: `Metadata ${i + 1}`,
      })),
    },
  ];

  const [open, setOpen] = React.useState(false);
  const [processId, setProcessId] = React.useState("CONSUMER_LENDING");
  const [files, setFiles] = React.useState<File[]>([]);
  const [progressMap, setProgressMap] = React.useState<Record<string, number>>({});
  const [isDragging, setDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const currentProcess = DEFAULT_PROCESS_CONFIGS.find((p) => p.id === processId)!;

  const handleFiles = (input: FileList | File[]) => {
    const arr = Array.from(input);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const newFiles = arr.filter((f) => !existing.has(f.name));
      return [...prev, ...newFiles];
    });
    arr.forEach((file) => simulateUpload(file));
  };

  const simulateUpload = (file: File) => {
    const step = Math.random() * 10 + 5;
    const key = file.name;
    setProgressMap((prev) => ({ ...prev, [key]: 0 }));
    const interval = setInterval(() => {
      setProgressMap((prev) => {
        const val = (prev[key] ?? 0) + step;
        if (val >= 100) {
          clearInterval(interval);
          return { ...prev, [key]: 100 };
        }
        return { ...prev, [key]: val };
      });
    }, 200);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const hashFromName = (name: string) => {
    let h = 5381;
    for (let i = 0; i < name.length; i++) h = (h * 33) ^ name.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  const rows: GridRowModel[] = files.map((f) => ({
    id: f.name,
    hash: hashFromName(f.name),
    ...Object.fromEntries(currentProcess.columns.map((c) => [c.field, ""])),
  }));

  const columns: GridColDef[] = currentProcess.columns.map((c) => ({
    field: c.field,
    headerName: c.headerName,
    width: 180,
    editable: true,
    renderCell: (params) => {
      const row = params.row;
      const id = `${c.field}_${row.hash}`;
      return <span title={id}>{params.value}</span>;
    },
  }));

  const allUploadsComplete = Object.values(progressMap).every((v) => v === 100);

  const incompleteCount = rows.reduce((acc, row) => {
    const missing = currentProcess.columns.filter((col) => col.required && !row[col.field]);
    return acc + missing.length;
  }, 0);

  return (
    <Box>
      <Stack direction="row" spacing={2}>
        <ToggleButtonGroup
          value={processId}
          exclusive
          onChange={(_, val) => val && setProcessId(val)}
        >
          {DEFAULT_PROCESS_CONFIGS.map((p) => (
            <ToggleButton key={p.id} value={p.id}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => setOpen(true)}>
          Upload
        </Button>
      </Stack>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: files.length > 0 ? 1024 : 420, transition: "width 0.3s ease" } }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center" }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Upload to {currentProcess.label}
          </Typography>
          <Tooltip title="Close">
            <IconButton onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />

        {/* Upload Zone */}
        <Box
          sx={{
            m: 2,
            p: 4,
            border: "2px dashed",
            borderColor: isDragging ? "primary.main" : "divider",
            borderRadius: 2,
            textAlign: "center",
            cursor: "pointer",
            bgcolor: isDragging ? "action.hover" : "transparent",
            transition: "all 0.2s ease",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={handleDrop}
        >
          <CloudUploadIcon fontSize="large" />
          <Typography variant="subtitle1">Drag & Drop or Click to Upload</Typography>
        </Box>

        {/* File Chips + Progress */}
        <Fade in={files.length > 0}>
          <Stack spacing={1} sx={{ px: 2 }}>
            {files.map((f) => (
              <Box key={f.name} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip
                  label={f.name}
                  title={`Hash: ${hashFromName(f.name)}`}
                  onDelete={() => setFiles(files.filter((x) => x.name !== f.name))}
                  deleteIcon={<DeleteOutlineIcon />}
                />
                <Box sx={{ flex: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progressMap[f.name] ?? 0}
                    color={progressMap[f.name] === 100 ? "success" : "primary"}
                  />
                </Box>
                {progressMap[f.name] === 100 ? (
                  <CheckCircleIcon color="success" />
                ) : progressMap[f.name] > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {Math.floor(progressMap[f.name])}%
                  </Typography>
                ) : (
                  <ErrorIcon color="error" />
                )}
              </Box>
            ))}
          </Stack>
        </Fade>

        {/* Grid & Summary after Upload Complete */}
        <Collapse in={allUploadsComplete && files.length > 0}>
          <Box sx={{ flex: 1, p: 2, overflowX: "auto" }}>
            <Typography variant="subtitle1" gutterBottom>
              Metadata Grid
            </Typography>
            <Box sx={{ width: Math.max(180 * 10, columns.length * 180) }}>
              <DataGrid
                rows={rows}
                columns={columns}
                disableColumnMenu
                rowSelection={false}
                editMode="row"
                processRowUpdate={(r) => r}
                experimentalFeatures={{ newEditingApi: true }}
              />
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
              <Typography variant="body2">
                {files.length} files uploaded | {incompleteCount} incomplete fields
              </Typography>
              <Button variant="contained" color="primary" disabled={incompleteCount > 0}>
                Submit
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Drawer>
    </Box>
  );
}
