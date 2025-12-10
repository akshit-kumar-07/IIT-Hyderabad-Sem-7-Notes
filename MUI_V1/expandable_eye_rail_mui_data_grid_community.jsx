import * as React from "react";
import { DataGrid } from "@mui/x-data-grid";
import {
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
 * A community-edition friendly pattern for "row expansion".
 * - 5 columns total
 * - last 3 columns are independent "eye" cells
 * - clicking an eye expands a vertical rail of 4 icon buttons
 * - row height grows when ANY eye in that row is expanded
 */

const BASE_ROW_HEIGHT = 52;
const RAIL_BUTTON_SIZE = 32; // px (approx visual size of IconButton)
const RAIL_GAP = 6; // px
const RAIL_BUTTON_COUNT = 4;
const RAIL_INNER_PADDING_Y = 6; // px top + bottom inside rail container

const RAIL_STACK_HEIGHT =
  RAIL_BUTTON_COUNT * RAIL_BUTTON_SIZE +
  (RAIL_BUTTON_COUNT - 1) * RAIL_GAP +
  RAIL_INNER_PADDING_Y * 2;

// Extra breathing room so the rail doesn't feel cramped under the eye button
const ROW_EXPANDED_HEIGHT = BASE_ROW_HEIGHT + RAIL_STACK_HEIGHT + 12;

const ACTION_FIELDS = ["viewA", "viewB", "viewC"];
const ACTION_LABELS = ["View A", "View B", "View C"];

const makeKey = (id, field) => `${String(id)}__${field}`;

function EyeRailCell({ params, expanded, onToggle, label }) {
  const theme = useTheme();

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggle(params.id, params.field);
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
        // keep the eye visually centered when collapsed
        transition: "padding 160ms ease",
      }}
    >
      <Tooltip title={expanded ? `Hide ${label} actions` : `Show ${label} actions`}>
        <IconButton
          size="small"
          onClick={handleToggle}
          aria-label={`toggle ${label} actions`}
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: `${RAIL_GAP}px`,
                py: `${RAIL_INNER_PADDING_Y}px`,
                px: 0.5,
                borderRadius: 2,
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                border: `1px solid ${
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)"
                }`,
              }}
            >
              {railActions.map((a) => (
                <Tooltip key={a.key} title={a.title} placement="left">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      a.onClick();
                    }}
                    aria-label={a.title}
                  >
                    {a.icon}
                  </IconButton>
                </Tooltip>
              ))}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

export default function ExpandableEyeRailGrid() {
  const [expandedCells, setExpandedCells] = React.useState({});

  const toggleCell = React.useCallback((id, field) => {
    setExpandedCells((prev) => {
      const key = makeKey(id, field);
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  // Track if ANY eye cell is open for a given row so we can enlarge that row.
  const expandedRows = React.useMemo(() => {
    const map = new Map();
    for (const [key, open] of Object.entries(expandedCells)) {
      if (!open) continue;
      const [rowId] = key.split("__");
      map.set(rowId, true);
    }
    return map;
  }, [expandedCells]);

  const getRowHeight = React.useCallback(
    (params) =>
      expandedRows.get(String(params.id))
        ? ROW_EXPANDED_HEIGHT
        : BASE_ROW_HEIGHT,
    [expandedRows]
  );

  const columns = React.useMemo(() => {
    const actionColumns = ACTION_FIELDS.map((field, idx) => ({
      field,
      headerName: ACTION_LABELS[idx],
      width: 140,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      headerAlign: "center",
      renderHeader: () => (
        <Typography variant="body2" fontWeight={600}>
          {ACTION_LABELS[idx]}
        </Typography>
      ),
      renderCell: (params) => {
        const key = makeKey(params.id, field);
        const expanded = Boolean(expandedCells[key]);
        return (
          <EyeRailCell
            params={params}
            expanded={expanded}
            onToggle={toggleCell}
            label={ACTION_LABELS[idx]}
          />
        );
      },
    }));

    return [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 180,
      },
      {
        field: "role",
        headerName: "Role",
        flex: 1,
        minWidth: 160,
      },
      ...actionColumns,
    ];
  }, [expandedCells, toggleCell]);

  const rows = React.useMemo(
    () => [
      { id: 1, name: "Ada Lovelace", role: "Analyst", viewA: "", viewB: "", viewC: "" },
      { id: 2, name: "Grace Hopper", role: "Engineer", viewA: "", viewB: "", viewC: "" },
      { id: 3, name: "Alan Turing", role: "Researcher", viewA: "", viewB: "", viewC: "" },
      { id: 4, name: "Katherine Johnson", role: "Scientist", viewA: "", viewB: "", viewC: "" },
      { id: 5, name: "Linus Torvalds", role: "Architect", viewA: "", viewB: "", viewC: "" },
    ],
    []
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ height: 520, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          rowHeight={BASE_ROW_HEIGHT}
          getRowHeight={getRowHeight}
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
          sx={{
            borderRadius: 2,
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.02)",
            },
            // Try to animate row height changes.
            "& .MuiDataGrid-row": {
              transition: "height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            },
            // Make sure cells stretch to the full dynamic row height.
            "& .MuiDataGrid-cell": {
              alignItems: "stretch",
              py: 0,
            },
          }}
        />
      </Box>
    </Box>
  );
}
