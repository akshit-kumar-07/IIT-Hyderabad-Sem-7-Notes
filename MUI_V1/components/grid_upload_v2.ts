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
 * Reusable ProcessUploadPanel component
 *
 * Features:
 *  - Upload button opens right drawer showing drag-and-drop / file chooser.
 *  - After uploading, generates hash for each file name.
 *  - Expands to show metadata grid based on selected process configuration.
 *  - Rows = files, Columns = metadata fields of selected process.
 *  - Each cell internally identified as fieldName_hash.
 *  - Supports horizontal scrolling for >10 columns.
 */

export type ProcessConfig = {
  id: string;
  label: string;
  columns: { field: string; headerName: string }[];
};

const DEFAULT_PROCESS_CONFIGS: ProcessConfig[] = [
  {
    id: "CONSUMER_LENDING",
    label: "Consumer Lending",
    columns: Array.from({ length: 20 }, (_, i) => ({
      field: `meta${i + 1}`,
      headerName: `Metadata ${i + 1}`,
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
  {
    id: "BLAST",
    label: "BLAST",
    columns: Array.from({ length: 12 }, (_, i) => ({
      field: `meta${i + 1}`,
      headerName: `Metadata ${i + 1}`,
    })),
  },
];

function hashFromName(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = (h * 33) ^ name.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export default function ProcessUploadPanel({
  processConfigs = DEFAULT_PROCESS_CONFIGS,
}: {
  processConfigs?: ProcessConfig[];
}) {
  const [open, setOpen] = React.useState(false);
  const [selectedProcess, setSelectedProcess] = React.useState(processConfigs[0].id);
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setDragging] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (input: FileList | File[]) => {
    const arr = Array.from(input);
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !existingNames.has(f.name))];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const currentProcess = processConfigs.find((p) => p.id === selectedProcess)!;

  const rows = files.map((f) => ({
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

  return (
    <Box>
      <Stack direction="row" spacing={2}>
        <ToggleButtonGroup
          value={selectedProcess}
          exclusive
          onChange={(_, val) => val && setSelectedProcess(val)}
        >
          {processConfigs.map((p) => (
            <ToggleButton key={p.id} value={p.id}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button
          startIcon={<CloudUploadIcon />}
          variant="contained"
          onClick={() => setOpen(true)}
        >
          Upload
        </Button>
      </Stack>

      <input
        type="file"
        multiple
        hidden
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: files.length > 0 ? 1024 : 420 } }}
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

        {/* Upload zone */}
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

        {files.length > 0 && (
          <>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ px: 2 }}>
              {files.map((f) => (
                <Chip
                  key={f.name}
                  label={f.name}
                  title={`Hash: ${hashFromName(f.name)}`}
                  onDelete={() => setFiles(files.filter((x) => x.name !== f.name))}
                  deleteIcon={<DeleteOutlineIcon />}
                />
              ))}
            </Stack>

            <Box sx={{ flex: 1, p: 2, overflowX: "auto" }}>
              <Box sx={{ width: Math.max(180 * 10, columns.length * 180) }}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  disableColumnMenu
                  rowSelection={false}
                  editMode="row"
                  processRowUpdate={(r) => r}
                />
              </Box>
            </Box>
          </>
        )}
      </Drawer>
    </Box>
  );
}
