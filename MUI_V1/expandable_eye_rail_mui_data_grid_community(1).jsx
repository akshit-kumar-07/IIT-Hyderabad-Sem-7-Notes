import * as React from "react";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridPaginationModel,
  GridRowHeightParams,
} from "@mui/x-data-grid";
import {
  alpha,
  Box,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import { AnimatePresence, motion } from "framer-motion";

/**
 * MUI X DataGrid Community-friendly "row expansion" pattern (TypeScript).
 *
 * Requirements covered:
 * - 5 columns
 * - last 3 columns have a centered eye icon
 * - clicking an eye expands a vertical rail of 4 buttons inside the cell
 * - each eye column behaves independently per row
 * - row height expands gracefully when any eye cell in the row is open
 * - supports pagination
 * - autoHeight enabled
 * - premium-ish UI: pill headers, hover affordances, per-rail labels
 */

// ------------------------------
// Types
// ------------------------------

type ActionField = "viewA" | "viewB" | "viewC";

type Row = {
  id: number;
  name: string;
  role: string;
  viewA: string;
  viewB: string;
  viewC: string;
};

// ------------------------------
// Layout constants
// ------------------------------

const BASE_ROW_HEIGHT = 52;

// Each rail item is an IconButton + label row.
const RAIL_ITEM_HEIGHT = 34; // px
const RAIL_GAP = 6; // px
const RAIL_ITEM_COUNT = 4;
const RAIL_INNER_PADDING_Y = 8; // px

const RAIL_STACK_HEIGHT =
  RAIL_ITEM_COUNT * RAIL_ITEM_HEIGHT +
  (RAIL_ITEM_COUNT - 1) * RAIL_GAP +
  RAIL_INNER_PADDING_Y * 2;

const ROW_EXPANDED_HEIGHT = BASE_ROW_HEIGHT + RAIL_STACK_HEIGHT + 12;

const ACTION_FIELDS: ActionField[] = ["viewA", "viewB", "viewC"];
const ACTION_LABELS: Record<ActionField, string> = {
  viewA: "View A",
  viewB: "View B",
  viewC: "View C",
};

const makeKey = (id: Row["id"], field: ActionField) => `${String(id)}__${field}`;

// ------------------------------
// Cell component
// ------------------------------

interface EyeRailCellProps {
  params: GridRenderCellParams<Row, string>;
  expanded: boolean;
  onToggle: (id: Row["id"], field: ActionField) => void;
  label: string;
}

function EyeRailCell({ params, expanded, onToggle, label }: EyeRailCellProps) {
  const theme = useTheme();

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(params.id as number, params.field as ActionField);
  };

  const railActions = React.useMemo(
    () => [
      {
        key: "info",
        title: "Info",
        icon: <InfoOutlinedIcon fontSize="small" />,
        onClick: () => console.log("Info", params.id, params.field),
      },
      {
        key: "edit",
        title: "Edit",
        icon: <EditOutlinedIcon fontSize="small" />,
        onClick: () => console.log("Edit", params.id, params.field),
      },
      {
        key: "share",
        title: "Share",
        icon: <ShareOutlinedIcon fontSize="small" />,
        onClick: () => console.log("Share", params.id, params.field),
      },
      {
        key: "more",
        title: "More",
        icon: <MoreHorizOutlinedIcon fontSize="small" />,
        onClick: () => console.log("More", params.id, params.field),
      },
    ],
    [params.id, params.field]
  );

  const railBg =
    theme.palette.mode === "dark"
      ? alpha(theme.palette.common.white, 0.06)
      : alpha(theme.palette.common.black, 0.035);

  const railBorder =
    theme.palette.mode === "dark"
      ? alpha(theme.palette.common.white, 0.09)
      : alpha(theme.palette.common.black, 0.07);

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: expanded ? "flex-start" : "center",
        pt: expanded ? 0.5 : 0,
        transition: "padding 160ms ease",
      }}
    >
      <Tooltip title={expanded ? `Hide ${label} actions` : `Show ${label} actions`}>
        <IconButton
          size="small"
          onClick={handleToggle}
          aria-label={`toggle ${label} actions`}
          sx={{
            opacity: expanded ? 1 : 0.75,
            transition: "all 160ms ease",
            borderRadius: 2,
            "&:hover": {
              opacity: 1,
              transform: "translateY(-1px)",
              backgroundColor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.08)
                  : alpha(theme.palette.common.black, 0.06),
            },
          }}
        >
          <VisibilityOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="rail"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: RAIL_STACK_HEIGHT, marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            style={{
              overflow: "hidden",
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Box
              sx={{
                width: "fit-content",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: `${RAIL_GAP}px`,
                py: `${RAIL_INNER_PADDING_Y}px`,
                px: 1,
                borderRadius: 2.5,
                backgroundColor: railBg,
                border: `1px solid ${railBorder}`,
                boxShadow:
                  theme.palette.mode === "dark"
                    ? "0 6px 18px rgba(0,0,0,0.35)"
                    : "0 6px 16px rgba(0,0,0,0.08)",
                backdropFilter: "blur(6px)",
              }}
            >
              {railActions.map((a, index) => (
                <motion.div
                  key={a.key}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14, delay: index * 0.03 }}
                >
                  <Tooltip title={a.title} placement="left">
                    <Box
                      sx={{
                        height: `${RAIL_ITEM_HEIGHT}px`,
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 0.5,
                        borderRadius: 1.5,
                        transition: "background 140ms ease",
                        "&:hover": {
                          backgroundColor:
                            theme.palette.mode === "dark"
                              ? alpha(theme.palette.common.white, 0.07)
                              : alpha(theme.palette.common.black, 0.05),
                        },
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          a.onClick();
                        }}
                        aria-label={a.title}
                        sx={{
                          borderRadius: 1.5,
                          "&:hover": {
                            backgroundColor:
                              theme.palette.mode === "dark"
                                ? alpha(theme.palette.common.white, 0.1)
                                : alpha(theme.palette.common.black, 0.08),
                          },
                        }}
                      >
                        {a.icon}
                      </IconButton>
                      <Typography
                        variant="caption"
                        sx={{
                          whiteSpace: "nowrap",
                          fontWeight: 500,
                          letterSpacing: "0.01em",
                          color:
                            theme.palette.mode === "dark"
                              ? alpha(theme.palette.common.white, 0.82)
                              : alpha(theme.palette.common.black, 0.72),
                        }}
                      >
                        {a.title}
                      </Typography>
                    </Box>
                  </Tooltip>
                </motion.div>
              ))}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

// ------------------------------
// Grid component
// ------------------------------

export default function ExpandableEyeRailGridTS() {
  const theme = useTheme();

  const [expandedCells, setExpandedCells] = React.useState<Record<string, boolean>>({});

  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({
    page: 0,
    pageSize: 5,
  });

  const toggleCell = React.useCallback((id: Row["id"], field: ActionField) => {
    setExpandedCells((prev) => {
      const key = makeKey(id, field);
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  // Which rows are expanded (if any of the three eye cells per row are open)
  const expandedRows = React.useMemo(() => {
    const set = new Set<string>();
    for (const [key, open] of Object.entries(expandedCells)) {
      if (!open) continue;
      const [rowId] = key.split("__");
      if (rowId) set.add(rowId);
    }
    return set;
  }, [expandedCells]);

  const getRowHeight = React.useCallback(
    (params: GridRowHeightParams) =>
      expandedRows.has(String(params.id)) ? ROW_EXPANDED_HEIGHT : BASE_ROW_HEIGHT,
    [expandedRows]
  );

  const columns = React.useMemo<GridColDef<Row>[]>(() => {
    const actionColumns: GridColDef<Row>[] = ACTION_FIELDS.map((field) => ({
      field,
      headerName: ACTION_LABELS[field],
      width: 160,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      headerAlign: "center",
      renderHeader: () => (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            px: 1.25,
            py: 0.35,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            border: `1px solid ${
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.12)
                : alpha(theme.palette.common.black, 0.08)
            }`,
            backgroundColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.06)
                : alpha(theme.palette.common.black, 0.035),
          }}
        >
          {ACTION_LABELS[field]}
        </Box>
      ),
      renderCell: (params) => {
        const key = makeKey(params.id as number, field);
        const expanded = Boolean(expandedCells[key]);
        return (
          <EyeRailCell
            params={params}
            expanded={expanded}
            onToggle={toggleCell}
            label={ACTION_LABELS[field]}
          />
        );
      },
    }));

    return [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 200,
        renderHeader: () => (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 1.25,
              py: 0.35,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.02em",
              border: `1px solid ${
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.12)
                  : alpha(theme.palette.common.black, 0.08)
              }`,
              backgroundColor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.06)
                  : alpha(theme.palette.common.black, 0.035),
            }}
          >
            Name
          </Box>
        ),
      },
      {
        field: "role",
        headerName: "Role",
        flex: 1,
        minWidth: 180,
        renderHeader: () => (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              px: 1.25,
              py: 0.35,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.02em",
              border: `1px solid ${
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.12)
                  : alpha(theme.palette.common.black, 0.08)
              }`,
              backgroundColor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.06)
                  : alpha(theme.palette.common.black, 0.035),
            }}
          >
            Role
          </Box>
        ),
      },
      ...actionColumns,
    ];
  }, [expandedCells, toggleCell, theme.palette.mode]);

  const rows = React.useMemo<Row[]>(
    () => [
      { id: 1, name: "Ada Lovelace", role: "Analyst", viewA: "", viewB: "", viewC: "" },
      { id: 2, name: "Grace Hopper", role: "Engineer", viewA: "", viewB: "", viewC: "" },
      { id: 3, name: "Alan Turing", role: "Researcher", viewA: "", viewB: "", viewC: "" },
      { id: 4, name: "Katherine Johnson", role: "Scientist", viewA: "", viewB: "", viewC: "" },
      { id: 5, name: "Linus Torvalds", role: "Architect", viewA: "", viewB: "", viewC: "" },
      { id: 6, name: "Margaret Hamilton", role: "Lead", viewA: "", viewB: "", viewC: "" },
      { id: 7, name: "Donald Knuth", role: "Author", viewA: "", viewB: "", viewC: "" },
      { id: 8, name: "Tim Berners-Lee", role: "Inventor", viewA: "", viewB: "", viewC: "" },
      { id: 9, name: "Radia Perlman", role: "Networker", viewA: "", viewB: "", viewC: "" },
      { id: 10, name: "Barbara Liskov", role: "Professor", viewA: "", viewB: "", viewC: "" },
      { id: 11, name: "John McCarthy", role: "Pioneer", viewA: "", viewB: "", viewC: "" },
      { id: 12, name: "Leslie Lamport", role: "Researcher", viewA: "", viewB: "", viewC: "" },
    ],
    []
  );

  const gridHeaderBg =
    theme.palette.mode === "dark"
      ? alpha(theme.palette.common.white, 0.04)
      : alpha(theme.palette.common.black, 0.02);

  const rowHoverBg =
    theme.palette.mode === "dark"
      ? alpha(theme.palette.common.white, 0.035)
      : alpha(theme.palette.common.black, 0.03);

  return (
    <Box sx={{ width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={columns}
        autoHeight
        pagination
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[5, 10, 25]}
        rowHeight={BASE_ROW_HEIGHT}
        getRowHeight={getRowHeight}
        disableRowSelectionOnClick
        hideFooterSelectedRowCount
        sx={{
          borderRadius: 2.5,
          borderColor:
            theme.palette.mode === "dark"
              ? alpha(theme.palette.common.white, 0.08)
              : alpha(theme.palette.common.black, 0.08),
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: gridHeaderBg,
            borderBottomColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.08)
                : alpha(theme.palette.common.black, 0.08),
          },
          "& .MuiDataGrid-columnHeaderTitleContainer": {
            justifyContent: "center",
          },
          "& .MuiDataGrid-row": {
            transition: "height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: rowHoverBg,
          },
          "& .MuiDataGrid-cell": {
            alignItems: "stretch",
            py: 0,
            borderBottomColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.06)
                : alpha(theme.palette.common.black, 0.06),
          },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-footerContainer": {
            borderTopColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.08)
                : alpha(theme.palette.common.black, 0.08),
          },
        }}
      />
    </Box>
  );
}
