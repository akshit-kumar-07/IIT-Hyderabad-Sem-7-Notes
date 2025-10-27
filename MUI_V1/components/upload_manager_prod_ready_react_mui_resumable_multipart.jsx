import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  IconButton,
  Button,
  Stack,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloseIcon from "@mui/icons-material/Close";
import { useDropzone } from "react-dropzone";
import axios, { AxiosError } from "axios";

// ====================================================================
// CONFIG / LIMITS / CONSTANTS
// ====================================================================

// Upload limits
const MAX_FILES = 100;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB fallback (server may override)
const MAX_PARALLEL_FILES = 3; // how many files can upload in parallel

// Reliability settings
const CHUNK_MAX_RETRIES = 4; // per-chunk retry attempts
const BACKOFF_BASE_MS = 800; // base ms for exponential backoff
const BACKOFF_JITTER_MS = 250; // added jitter to avoid thundering herd
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // 2 min hard timeout per chunk request
const STALL_TIMEOUT_MS = 30 * 1000; // 30s without progress => stall => retry

// Persistence
const PERSIST_KEY = "upload_manager_v1";

// ====================================================================
// TYPES
// ====================================================================

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "done"
  | "error"
  | "canceled"
  | "awaiting-file"; // persisted across reload, needs user to reselect file

export interface ChunkMeta {
  index: number; // 0-based index
  start: number; // byte start (inclusive)
  end: number; // byte end (exclusive)
  uploaded: boolean;
  etag?: string; // returned from storage after successful PUT
}

export interface UploadFileMeta {
  id: string; // local uuid
  file?: File; // can be undefined after reload until user reselects

  // Fingerprint for crash-resume matching:
  fileName: string;
  fileSize: number;
  fileLastModified?: number;

  status: UploadStatus;
  progress: number; // 0-100
  uploadedBytes: number; // how many bytes are confirmed uploaded
  uploadId?: string; // server-issued multipart session id
  chunkSize: number;
  chunks: ChunkMeta[];
  error?: string;
  controller?: AbortController | null;
  completing?: boolean; // true while calling /complete on server
  fileUrl?: string; // final CDN/location after complete
}

// Shape that we store in localStorage (cannot store File or AbortController)
interface PersistedUpload {
  id: string;
  fileName: string;
  fileSize: number;
  fileLastModified?: number;
  status: UploadStatus;
  progress: number;
  uploadedBytes: number;
  uploadId?: string;
  chunkSize: number;
  chunks: {
    index: number;
    start: number;
    end: number;
    uploaded: boolean;
    etag?: string;
  }[];
  completing?: boolean;
  fileUrl?: string;
}

// ====================================================================
// UTILS
// ====================================================================

// NOTE: These are exported because tests import them.
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(val >= 10 || i < 2 ? 0 : 1)} ${sizes[i]}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NOTE: Exported for tests.
export function buildChunks(
  size: number,
  chunkSize: number,
  alreadyUploadedParts: number[] = [],
  partsETags: Record<string, string> = {}
): ChunkMeta[] {
  const chunks: ChunkMeta[] = [];
  let index = 0;
  for (let start = 0; start < size; start += chunkSize) {
    const end = Math.min(start + chunkSize, size);
    const partNumber = index + 1;
    const uploadedAlready = alreadyUploadedParts.includes(partNumber);
    chunks.push({
      index,
      start,
      end,
      uploaded: uploadedAlready,
      etag: uploadedAlready ? partsETags[String(partNumber)] : undefined,
    });
    index++;
  }
  return chunks;
}

function createUUID() {
  // crypto.randomUUID is widely supported in modern browsers.
  // We wrap it so TypeScript won't complain in older lib.d.ts.
  return (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ====================================================================
// AUTH & API CLIENT (auth header + server validation/quota)
// ====================================================================

// Change this to however you store auth. For demo we read localStorage.
function getAuthToken(): string | null {
  return localStorage.getItem("authToken");
}

const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((cfg) => {
  const token = getAuthToken();
  if (token) {
    cfg.headers = {
      ...(cfg.headers || {}),
      Authorization: `Bearer ${token}`,
    } as any;
  }
  return cfg;
});

// --- API helpers ------------------------------------------------------
// NOTE: These assume an S3-multipart-like contract on the backend.
// You must implement these endpoints server-side.

/**
 * Ask backend to create/resume a multipart upload, validate quotas, etc.
 */
async function apiInitiateUpload(fileName: string, mimeType: string, size: number) {
  const res = await api.post("/uploads/initiate", {
    fileName,
    mimeType: mimeType || "application/octet-stream",
    size,
  });
  // Expected response:
  // {
  //   uploadId: string,
  //   chunkSize: number,
  //   alreadyUploadedParts: number[],
  //   partsETags: Record<string,string>,
  //   allowed: boolean,
  //   reason?: string,
  //   remainingBytes?: number
  // }
  return res.data as {
    uploadId: string;
    chunkSize?: number;
    alreadyUploadedParts?: number[];
    partsETags?: Record<string, string>;
    allowed?: boolean;
    reason?: string;
    remainingBytes?: number;
  };
}

/** Get a fresh presigned URL for a given part */
async function apiGetPartUrl(uploadId: string, partNumber: number) {
  const res = await api.get(`/uploads/${encodeURIComponent(uploadId)}/part-url`, {
    params: { partNumber },
  });
  return res.data as { url: string };
}

/** Tell backend that all parts are uploaded so it can finalize */
async function apiCompleteUpload(uploadId: string, chunks: ChunkMeta[]) {
  const parts = chunks
    .filter((c) => c.uploaded && c.etag)
    .map((c) => ({ partNumber: c.index + 1, etag: c.etag! }));
  const res = await api.post(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
    parts,
  });
  return res.data as { fileUrl: string };
}

/** Abort a multipart upload server-side (cleanup storage) */
async function apiAbortUpload(uploadId: string) {
  try {
    await api.delete(`/uploads/${encodeURIComponent(uploadId)}`);
  } catch {
    // ignore cleanup failures for now
  }
}

// ====================================================================
// SNACKBAR STATE HOOK (toast queue)
// ====================================================================

type Snack = {
  id: string;
  message: string;
  severity: "success" | "info" | "warning" | "error";
};

function useSnackQueue() {
  const [queue, setQueue] = useState<Snack[]>([]);
  const current = queue[0] || null;

  // push() can be called by anything (validation errors, success states, etc.)
  const push = useCallback((message: string, severity: Snack["severity"] = "info") => {
    setQueue((q) => [...q, { id: createUUID(), message, severity }]);
  }, []);

  // close() pops the front of the queue
  const close = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  // snackbarEl is an actual JSX element that UploadManager renders.
  // Keeping it here ensures UploadManager just drops {snackbarEl} in JSX.
  const snackbarEl = (
    <Snackbar
      key={current?.id}
      open={!!current}
      autoHideDuration={current?.severity === "error" ? 6000 : 3000}
      onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert
        elevation={6}
        variant="filled"
        onClose={close}
        severity={current?.severity || "info"}
      >
        {current?.message}
      </Alert>
    </Snackbar>
  );

  return { push, snackbarEl };
}

// ====================================================================
// PRESENTATION: PER-FILE ROW UI
// ====================================================================

interface UploadRowProps {
  meta: UploadFileMeta;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRecover: (id: string) => void; // prompt user to reselect file on crash-resume
}

const UploadRow: React.FC<UploadRowProps> = ({
  meta,
  onPause,
  onResume,
  onCancel,
  onRecover,
}) => {
  const {
    fileName,
    fileSize,
    status,
    progress,
    uploadedBytes,
    error,
    fileUrl,
    completing,
  } = meta;

  const canPause = status === "uploading" && !completing;
  const canResume =
    (status === "paused" || status === "error" || status === "queued") &&
    !completing;
  const canCancel =
    status !== "done" && status !== "canceled" && !completing;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderRadius: 2,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 500, wordBreak: "break-all" }}
          >
            {fileName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatBytes(fileSize)} · {statusLabel(status, completing)}
          </Typography>

          {fileUrl && (
            <Typography
              variant="body2"
              color="primary.main"
              sx={{ wordBreak: "break-all" }}
            >
              {fileUrl}
            </Typography>
          )}

          {status === "awaiting-file" && (
            <Stack direction="row" gap={1} mt={1} alignItems="center">
              <Chip size="small" color="warning" label="Needs file to resume" />
              <Button
                size="small"
                variant="outlined"
                onClick={() => onRecover(meta.id)}
              >
                Select file to resume
              </Button>
            </Stack>
          )}

          {error && (
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
          )}
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          {completing && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} thickness={5} />
              <Typography variant="caption" color="text.secondary">
                Finalizing…
              </Typography>
            </Stack>
          )}

          {canPause && (
            <IconButton
              size="small"
              onClick={() => onPause(meta.id)}
              aria-label="Pause upload"
            >
              <PauseIcon fontSize="small" />
            </IconButton>
          )}

          {canResume && !canPause && (
            <IconButton
              size="small"
              onClick={() => onResume(meta.id)}
              aria-label="Resume upload"
            >
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          )}

          {canCancel && (
            <IconButton
              size="small"
              onClick={() => onCancel(meta.id)}
              aria-label="Cancel upload"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ height: 8, borderRadius: 4 }}
      />

      <Box display="flex" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {progress.toFixed(1)}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatBytes(uploadedBytes)} / {formatBytes(fileSize)}
        </Typography>
      </Box>
    </Paper>
  );
};

// NOTE: Exported for tests.
export function statusLabel(status: UploadStatus, completing?: boolean) {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return completing ? "Finalizing…" : "Uploading…";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "canceled":
      return "Canceled";
    case "awaiting-file":
      return "Waiting for file…";
    default:
      return status;
  }
}

// ====================================================================
// DROPZONE UI (drag & drop + browse)
// ====================================================================

interface UploadDropzoneProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onReject: (fileName: string, reason: string) => void;
}

const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  disabled,
  onFiles,
  onReject,
}) => {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      if (disabled) return;

      // react-dropzone gives us rejected files + reasons
      fileRejections?.forEach((rej: any) => {
        const name = rej.file?.name || "(unknown file)";
        const code = rej.errors?.[0]?.code;
        const msg = code === "file-too-large" ? "exceeds 5GB limit" : "rejected";
        onReject(name, msg);
      });

      if (acceptedFiles.length > 0) {
        onFiles(acceptedFiles);
      }
    },
    [onFiles, disabled, onReject]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: MAX_FILE_SIZE_BYTES,
    disabled,
  });

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 4,
        textAlign: "center",
        borderStyle: "dashed",
        borderRadius: 3,
        borderColor: isDragActive ? "primary.main" : "divider",
        bgcolor: isDragActive ? "action.hover" : "background.paper",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease-in-out",
      }}
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      <Typography variant="h6" sx={{ fontWeight: 500 }}>
        {isDragActive
          ? "Drop to upload"
          : "Drag & drop up to 100 files (max 5GB each)"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        or click to browse
      </Typography>
    </Paper>
  );
};

// ====================================================================
// MAIN COMPONENT: UploadManager
// ====================================================================

export const UploadManager: React.FC = () => {
  // snackbarEl is mounted in JSX below. push() is used throughout to enqueue toasts.
  const { push, snackbarEl } = useSnackQueue();

  const [uploads, setUploads] = useState<UploadFileMeta[]>([]);

  // We keep a ref so async code always sees latest uploads[]
  const uploadsRef = useRef<UploadFileMeta[]>(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;

    // Persist lightweight snapshot to localStorage for crash-resume
    const toPersist: PersistedUpload[] = uploads
      .filter((u) => u.status !== "done" && u.status !== "canceled")
      .map((u) => ({
        id: u.id,
        fileName: u.fileName,
        fileSize: u.fileSize,
        fileLastModified: u.fileLastModified,
        // if we lost the File object (e.g. after page reload), keep status as awaiting-file
        status: u.file ? u.status : u.status === "done" ? "done" : "awaiting-file",
        progress: u.progress,
        uploadedBytes: u.uploadedBytes,
        uploadId: u.uploadId,
        chunkSize: u.chunkSize,
        chunks: u.chunks.map((c) => ({
          index: c.index,
          start: c.start,
          end: c.end,
          uploaded: c.uploaded,
          etag: c.etag,
        })),
        completing: u.completing,
        fileUrl: u.fileUrl,
      }));

    localStorage.setItem(PERSIST_KEY, JSON.stringify(toPersist));
  }, [uploads]);

  // Helper to merge restored uploads with any already in state
  const mergeRestored = useCallback(
    (prev: UploadFileMeta[], restored: UploadFileMeta[]) => {
      const existingIds = new Set(prev.map((u) => u.id));
      const merged = [...prev];
      restored.forEach((r) => {
        if (!existingIds.has(r.id)) merged.push(r);
      });
      return merged;
    },
    []
  );

  // On first mount, hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;

      const persisted: PersistedUpload[] = JSON.parse(raw || "[]");
      if (!Array.isArray(persisted)) return;

      const restored: UploadFileMeta[] = persisted.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        fileSize: p.fileSize,
        fileLastModified: p.fileLastModified,
        // We don't have the real File object after a reload, browser security.
        // User will need to reselect it to continue.
        file: undefined,
        status: "awaiting-file",
        progress: p.progress || 0,
        uploadedBytes: p.uploadedBytes || 0,
        uploadId: p.uploadId,
        chunkSize: p.chunkSize || DEFAULT_CHUNK_SIZE,
        chunks: p.chunks || [],
        error: undefined,
        controller: null,
        completing: !!p.completing,
        fileUrl: p.fileUrl,
      }));

      if (restored.length) {
        setUploads((prev) => mergeRestored(prev, restored));
      }
    } catch (e) {
      console.warn("Failed to restore uploads", e);
    }
  }, [mergeRestored]);

  // ----------------------------------------------------------------
  // User actions
  // ----------------------------------------------------------------

  // User drops/selects files
  const addFilesToQueue = (files: File[]) => {
    setUploads((prev) => {
      const next: UploadFileMeta[] = [...prev];

      for (const file of files) {
        if (next.length >= MAX_FILES) {
          push("Upload limit reached (100 files)", "warning");
          break;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          push(`\u26D4 ${file.name} exceeds 5GB limit`, "error");
          continue;
        }

        // Try to match an "awaiting-file" placeholder so we can resume
        const idx = next.findIndex(
          (u) =>
            u.status === "awaiting-file" &&
            u.fileName === file.name &&
            u.fileSize === file.size &&
            (u.fileLastModified
              ? u.fileLastModified === file.lastModified
              : true)
        );

        if (idx >= 0) {
          const existing = next[idx];
          next[idx] = {
            ...existing,
            file,
            status: "queued",
            error: undefined,
            fileLastModified: file.lastModified,
          };
          push(`Resuming ${file.name}…`, "info");
        } else {
          next.push({
            id: createUUID(),
            file,
            fileName: file.name,
            fileSize: file.size,
            fileLastModified: file.lastModified,
            status: "queued",
            progress: 0,
            uploadedBytes: 0,
            uploadId: undefined,
            chunkSize: DEFAULT_CHUNK_SIZE,
            chunks: [],
            error: undefined,
            controller: null,
            completing: false,
            fileUrl: undefined,
          });
        }
      }

      return next;
    });
  };

  const pauseUpload = (id: string) => {
    setUploads((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        if (u.controller) u.controller.abort();
        return {
          ...u,
          controller: null,
          status: u.status === "done" ? "done" : "paused",
        };
      })
    );
  };

  const resumeUpload = (id: string) => {
    setUploads((prev) =>
      prev.map((u) =>
        u.id === id && u.status !== "done"
          ? { ...u, status: "queued", error: undefined }
          : u
      )
    );
  };

  const cancelUpload = (id: string) => {
    setUploads((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        if (u.controller) u.controller.abort();
        if (u.uploadId) apiAbortUpload(u.uploadId).catch(() => {});
        return { ...u, status: "canceled", controller: null };
      })
    );
  };

  const recoverMissingFile = (id: string) => {
    // Ask user to reselect the exact same file so we can keep going.
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;

    input.onchange = () => {
      const f = (input.files && input.files[0]) || undefined;
      if (!f) return;

      setUploads((prev) =>
        prev.map((u) => {
          if (u.id !== id) return u;
          if (u.fileName !== f.name || u.fileSize !== f.size) {
            push("File doesn't match the original (name/size)", "error");
            return u;
          }
          return {
            ...u,
            file: f,
            fileLastModified: f.lastModified,
            status: "queued",
            error: undefined,
          };
        })
      );
    };

    input.click();
  };

  // ----------------------------------------------------------------
  // Upload pipeline
  // ----------------------------------------------------------------

  // Whenever we have capacity, promote queued -> uploading and start
  useEffect(() => {
    const current = uploadsRef.current;
    const uploadingCount = current.filter((u) => u.status === "uploading").length;
    const capacity = MAX_PARALLEL_FILES - uploadingCount;
    if (capacity <= 0) return;

    const nextToStart = current
      .filter((u) => u.status === "queued" && u.file)
      .slice(0, capacity);

    nextToStart.forEach((u) => startFileUpload(u.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads]);

  // Drives a single file from queued -> uploaded -> finalized
  const startFileUpload = async (id: string) => {
    setUploads((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: "uploading", error: undefined } : u
      )
    );

    try {
      await ensureUploadSession(id);
      await uploadChunksSequentiallyWithRetry(id);
      await finalizeUpload(id);

      setUploads((prev) =>
        prev.map((u) =>
          u.id === id && u.status !== "paused" && u.status !== "canceled"
            ? {
                ...u,
                status: "done",
                controller: null,
                completing: false,
                progress: 100,
              }
            : u
        )
      );

      const finishedName =
        uploadsRef.current.find((u) => u.id === id)?.fileName || "file";
      push(`\u2705 Uploaded ${finishedName}`, "success");
    } catch (err: any) {
      const wasPaused =
        uploadsRef.current.find((u) => u.id === id)?.status === "paused";
      const wasCanceled =
        uploadsRef.current.find((u) => u.id === id)?.status === "canceled";
      if (wasPaused || wasCanceled) return; // not an error, user action

      const msg =
        (err as AxiosError)?.message ||
        (err as Error)?.message ||
        "Upload failed";

      setUploads((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                status: "error",
                error: msg,
                controller: null,
                completing: false,
              }
            : u
        )
      );

      push(`\u26A0\uFE0F ${msg}`, "error");
    }
  };

  // Step 1: ensureUploadSession
  const ensureUploadSession = async (id: string) => {
    const meta = uploadsRef.current.find((u) => u.id === id);
    if (!meta) return;

    // If browser lost the File object, we can't upload until user reselects.
    if (!meta.file && meta.status !== "awaiting-file") {
      throw new Error("File not available (needs user to reselect)");
    }

    // If we already have uploadId + chunk map, don't re-init
    if (meta.uploadId && meta.chunks.length > 0) {
      return;
    }

    const file = meta.file!; // guaranteed in this branch

    const init = await apiInitiateUpload(
      meta.fileName || file.name,
      file.type || "application/octet-stream",
      file.size
    );

    // Enforce server-side validation & quota
    if (init.allowed === false) {
      const reason = init.reason || "Server rejected this file";
      throw new Error(reason);
    }
    if (
      typeof init.remainingBytes === "number" &&
      init.remainingBytes < file.size
    ) {
      throw new Error("Insufficient quota to upload this file");
    }

    const chunkSize = init.chunkSize || DEFAULT_CHUNK_SIZE;
    const chunks = buildChunks(
      file.size,
      chunkSize,
      init.alreadyUploadedParts || [],
      init.partsETags || {}
    );

    const resumedUploadedBytes = chunks
      .filter((c) => c.uploaded)
      .reduce((sum, c) => sum + (c.end - c.start), 0);
    const resumedProgress = (resumedUploadedBytes / file.size) * 100;

    setUploads((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              uploadId: init.uploadId,
              chunkSize,
              chunks,
              uploadedBytes: resumedUploadedBytes,
              progress: resumedProgress,
            }
          : u
      )
    );
  };

  // Step 2: uploadChunksSequentiallyWithRetry
  // - uploads each missing chunk in order
  // - retries with backoff
  // - detects stalls and hard timeouts
  const uploadChunksSequentiallyWithRetry = async (id: string) => {
    let meta = uploadsRef.current.find((u) => u.id === id)!;
    if (!meta) return;
    if (!meta.uploadId) throw new Error("Missing uploadId");
    if (!meta.file) throw new Error("Missing File; use 'Select file to resume'");

    // create AbortController for this file
    const controller = new AbortController();
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, controller } : u))
    );
    meta = uploadsRef.current.find((u) => u.id === id)!;

    for (let i = 0; i < meta.chunks.length; i++) {
      meta = uploadsRef.current.find((u) => u.id === id)!;

      if (meta.status === "paused" || meta.status === "canceled") {
        throw new Error("canceled");
      }

      const chunkMeta = meta.chunks[i];
      if (chunkMeta.uploaded) continue; // already done (resume case)

      const partNumber = chunkMeta.index + 1;

      let attempt = 0;
      let lastErr: any = null;

      while (attempt <= CHUNK_MAX_RETRIES) {
        let didStall = false;
        let didTimeout = false;

        try {
          // Each attempt refreshes a short-lived presigned URL
          const { url } = await apiGetPartUrl(meta.uploadId!, partNumber);
          const blob = meta.file!.slice(chunkMeta.start, chunkMeta.end);

          const thisAttemptController = new AbortController();

          // Stall + timeout watchdogs ---------------------------------
          let lastProgressAt = Date.now();

          const stallTimer = setInterval(() => {
            if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
              didStall = true;
              thisAttemptController.abort();
            }
          }, 1000);

          const hardTimeout = setTimeout(() => {
            didTimeout = true;
            thisAttemptController.abort();
          }, REQUEST_TIMEOUT_MS);

          // snapshot of bytes uploaded BEFORE this chunk
          const uploadedBytesBefore =
            uploadsRef.current.find((u) => u.id === id)!.uploadedBytes;

          const resp = await axios.put(url, blob, {
            headers: { "Content-Type": "application/octet-stream" },
            signal: thisAttemptController.signal,
            onUploadProgress: (evt) => {
              lastProgressAt = Date.now();
              if (!evt.total) return;

              const chunkUploadedBytes = evt.loaded;
              const newUploadedBytes =
                uploadedBytesBefore + chunkUploadedBytes;
              const newProgress =
                (newUploadedBytes / meta.file!.size) * 100;

              setUploads((prev) =>
                prev.map((u) =>
                  u.id === id
                    ? {
                        ...u,
                        uploadedBytes: newUploadedBytes,
                        progress: newProgress,
                      }
                    : u
                )
              );
            },
          });

          clearInterval(stallTimer);
          clearTimeout(hardTimeout);

          // Some backends (S3) return an ETag header for each part PUT.
          const etagHeader =
            (resp.headers as any)?.etag ||
            (resp.headers as any)?.ETag ||
            (resp.headers as any)?.["etag"] ||
            (resp.headers as any)?.["ETag"];
          const etagClean = Array.isArray(etagHeader)
            ? etagHeader[0]
            : etagHeader;

          if (!etagClean) {
            // We treat missing ETag as failure to avoid producing a corrupted final file.
            throw new Error("Missing ETag from storage response");
          }

          // Mark this chunk uploaded and update deterministic totals
          setUploads((prev) =>
            prev.map((u) => {
              if (u.id !== id) return u;

              const updatedChunks = u.chunks.map((c) =>
                c.index === chunkMeta.index
                  ? { ...c, uploaded: true, etag: etagClean }
                  : c
              );

              const finishedBytes = chunkMeta.end - chunkMeta.start;
              const newUploadedBytes = uploadedBytesBefore + finishedBytes;
              const newProgress =
                (newUploadedBytes / u.fileSize) * 100;

              return {
                ...u,
                chunks: updatedChunks,
                uploadedBytes: newUploadedBytes,
                progress: newProgress,
              };
            })
          );

          lastErr = null;
          break; // success → leave retry loop
        } catch (err: any) {
          lastErr = err;

          const isAxios = (err as AxiosError)?.isAxiosError;
          const status = (err as AxiosError)?.response?.status;

          const retriable =
            didStall ||
            didTimeout ||
            !isAxios ||
            !status ||
            status >= 500 ||
            status === 429 ||
            status === 408 ||
            status === 403; // presigned URL expired, etc.

          if (attempt >= CHUNK_MAX_RETRIES || !retriable) {
            throw err;
          }

          // exponential backoff + jitter before retrying this chunk
          const delay =
            BACKOFF_BASE_MS * Math.pow(2, attempt) +
            Math.floor(Math.random() * BACKOFF_JITTER_MS);
          await sleep(delay);
          attempt++;
          continue;
        }
      }

      if (lastErr) throw lastErr; // extra guard
    }
  };

  // Step 3: finalizeUpload
  const finalizeUpload = async (id: string) => {
    let meta = uploadsRef.current.find((u) => u.id === id);
    if (!meta) return;
    if (!meta.uploadId) throw new Error("Missing uploadId");

    // If we somehow got here without all chunks uploaded, skip finalize.
    if (meta.chunks.some((c) => !c.uploaded)) {
      return;
    }

    // Lock controls while we're telling backend to finalize
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, completing: true } : u))
    );

    const result = await apiCompleteUpload(meta.uploadId, meta.chunks);

    setUploads((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, fileUrl: result.fileUrl, completing: false }
          : u
      )
    );
  };

  // ----------------------------------------------------------------
  // Derived UI state
  // ----------------------------------------------------------------

  const totalActive = uploads.filter(
    (u) => u.status !== "canceled" && u.status !== "done"
  ).length;

  const awaitingCount = useMemo(
    () => uploads.filter((u) => u.status === "awaiting-file").length,
    [uploads]
  );

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <UploadDropzone
        disabled={uploads.length >= MAX_FILES}
        onFiles={addFilesToQueue}
        onReject={(name, reason) =>
          push(`\u26D4 ${name} ${reason}`, "error")
        }
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" color="text.secondary">
            {uploads.length}/{MAX_FILES} files in queue
          </Typography>
          {awaitingCount > 0 && (
            <Chip
              size="small"
              color="warning"
              label={`${awaitingCount} need file to resume`}
            />
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              uploadsRef.current.forEach((u) => {
                if (u.status === "uploading") pauseUpload(u.id);
              });
            }}
            disabled={totalActive === 0}
          >
            Pause all
          </Button>

          <Button
            size="small"
            variant="contained"
            onClick={() => {
              uploadsRef.current.forEach((u) => {
                if (
                  u.status === "paused" ||
                  u.status === "error" ||
                  u.status === "queued"
                ) {
                  resumeUpload(u.id);
                }
              });
            }}
          >
            Resume all
          </Button>

          {awaitingCount > 0 && (
            <Button
              size="small"
              variant="text"
              onClick={() => {
                // Fire the recover flow for each crashed upload
                uploadsRef.current.forEach((u) => {
                  if (u.status === "awaiting-file") recoverMissingFile(u.id);
                });
              }}
            >
              Select files to resume
            </Button>
          )}
        </Stack>
      </Stack>

      <Stack spacing={2}>
        {uploads.map((u) => (
          <UploadRow
            key={u.id}
            meta={u}
            onPause={pauseUpload}
            onResume={resumeUpload}
            onCancel={cancelUpload}
            onRecover={recoverMissingFile}
          />
        ))}
      </Stack>

      {/* Global snack/toast element */}
      {snackbarEl}
    </Box>
  );
};

// ====================================================================
// TESTS (Jest / React Testing Library examples)
// NOTE: These are here for reference. In a real repo, put them in
// separate *.test.ts(x) files. Keeping them in comments so they don't
// break your build.
// ====================================================================

/*
__tests__/utils.test.ts

import { describe, it, expect } from 'vitest';
import React from 'react';

// You would import from the module, e.g.:
// import { formatBytes, buildChunks, statusLabel } from '../UploadManager';

describe('formatBytes', () => {
  it('formats small numbers', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats MB/GB correctly', () => {
    // 1 MB = 1048576 bytes
    expect(formatBytes(1048576)).toBe('1 MB');
    // 1 GB = 1073741824 bytes
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

describe('buildChunks', () => {
  it('splits file size into equal-ish chunks', () => {
    const chunks = buildChunks(25, 10);
    // size=25, chunk=10 -> [0-10), [10-20), [20-25)
    expect(chunks).toHaveLength(3);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(10);
    expect(chunks[2].start).toBe(20);
    expect(chunks[2].end).toBe(25);
  });

  it('marks already-uploaded parts correctly', () => {
    const chunks = buildChunks(30, 10, [1, 3], { '1': 'etag1', '3': 'etag3' });
    expect(chunks[0].uploaded).toBe(true);
    expect(chunks[0].etag).toBe('etag1');
    expect(chunks[1].uploaded).toBe(false);
    expect(chunks[2].uploaded).toBe(true);
    expect(chunks[2].etag).toBe('etag3');
  });
});

describe('statusLabel', () => {
  it('returns correct human label', () => {
    expect(statusLabel('queued')).toBe('Queued');
    expect(statusLabel('uploading')).toBe('Uploading…');
    expect(statusLabel('uploading', true)).toBe('Finalizing…');
    expect(statusLabel('awaiting-file')).toBe('Waiting for file…');
  });

  it('echoes unknown states back', () => {
    // @ts-expect-error intentionally passing garbage state
    expect(statusLabel('weird-state')).toBe('weird-state');
  });
});
*/
