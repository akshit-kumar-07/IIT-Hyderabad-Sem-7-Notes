import * as React from "react";
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Typography,
  Stack,
  Tooltip,
  Divider,
  CssBaseline,
  Paper,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

/**
 * Tab model
 * - Two top-level groups: "My Documents" and "Document Reports"
 * - Each group can expand to reveal 4 inner tabs
 * - In expanded mode, the parent group tab remains visible for the OTHER group
 * - The last inner tab has a collapse control to return to parent group tabs
 * - On initial load, "My Documents" group is EXPANDED
 */

type Group = "my" | "reports";

type MyDocTab = "in-progress" | "processed" | "trash" | "unprocessed";

type ReportsTab = "A" | "B" | "C" | "Summary"; // "Summary" acts as the collapse tab for reports

// Basic mock rows per sub-tab (replace with real queries/filters)
const baseRows = Array.from({ length: 12 }).map((_, i) => ({ id: i + 1, title: `Row ${i + 1}`, owner: i % 2 ? "You" : "Teammate", status: i % 3 ? "ok" : "needs review" }));

const columns: GridColDef[] = [
  { field: "id", headerName: "ID", width: 90 },
  { field: "title", headerName: "Title", flex: 1, minWidth: 180 },
  { field: "owner", headerName: "Owner", width: 140 },
  { field: "status", headerName: "Status", width: 160 },
];

function useFilteredRows(group: Group | null, sub: MyDocTab | ReportsTab | null) {
  return React.useMemo(() => {
    if (!group || !sub) return baseRows;
    // fake filtering by group & subtab for demo
    const mod = group === "my" ? 2 : 3;
    const pick = (key: number) => baseRows.filter((r) => (r.id + key) % mod === 0);

    switch (sub) {
      case "in-progress":
        return pick(1);
      case "processed":
        return pick(2);
      case "trash":
        return pick(3);
      case "unprocessed":
        return pick(4);
      case "A":
        return pick(1);
      case "B":
        return pick(2);
      case "C":
        return pick(3);
      case "Summary":
        return pick(4);
      default:
        return baseRows;
    }
  }, [group, sub]);
}

export default function TabbedExpandableGrid() {
  // EXPANDED GROUP STATE: null => both parent tabs visible; "my" or "reports" => show sub-tabs of that group
  const [expanded, setExpanded] = React.useState<Group | null>("my"); // default: My Documents expanded

  // ACTIVE SUBTAB for each group
  const [mySub, setMySub] = React.useState<MyDocTab>("in-progress");
  const [reportSub, setReportSub] = React.useState<ReportsTab>("A");

  const activeRows = useFilteredRows(expanded, expanded === "my" ? mySub : expanded === "reports" ? reportSub : null);

  const handleExpand = (group: Group) => {
    // Mutually exclusive: expanding one collapses the other
    setExpanded(group);
    // Reset to first child tab on expansion
    if (group === "my") setMySub("in-progress");
    else setReportSub("A");
  };
  const handleCollapse = () => {
    // No dual-parent view allowed. Collapse current -> expand the other group, defaulting to its first child.
    if (expanded === "my") {
      setExpanded("reports");
      setReportSub("A");
    } else {
      setExpanded("my");
      setMySub("in-progress");
    }
  };

  // Renderers for parent and child tab rows
    const SingleParentTab = (group: Group) => (
    <Tabs value={0} TabIndicatorProps={{ style: { display: "none" } }}>
      <Tab
        label={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography>{group === "my" ? "My Documents" : "Document Reports"}</Typography>
            <Tooltip title="Expand">
              <IconButton size="small" onClick={() => handleExpand(group)} aria-label={`Expand ${group === "my" ? "My Documents" : "Document Reports"}`}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        }
        disableRipple
        sx={{ textTransform: "none" }}
      />
    </Tabs>
  );

  const MyDocsTabs = (
    <Tabs
      value={["in-progress", "processed", "trash", "unprocessed"].indexOf(mySub)}
      onChange={(_, idx) => setMySub(["in-progress", "processed", "trash", "unprocessed"][idx] as MyDocTab)}
      variant="scrollable"
      aria-label="My documents tabs"
    >
      <Tab label="In Progress" sx={{ textTransform: "none" }} />
      <Tab label="Processed" sx={{ textTransform: "none" }} />
      <Tab label="Trash" sx={{ textTransform: "none" }} />
      <Tab
        label={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography>Unprocessed</Typography>
            <Tooltip title="Collapse to My Documents">
              <IconButton size="small" onClick={handleCollapse} aria-label="Collapse to My Documents">
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        }
        sx={{ textTransform: "none" }}
      />
    </Tabs>
  );

  const ReportsTabs = (
    <Tabs
      value={["A", "B", "C", "Summary"].indexOf(reportSub)}
      onChange={(_, idx) => setReportSub(["A", "B", "C", "Summary"][idx] as ReportsTab)}
      variant="scrollable"
      aria-label="Document reports tabs"
    >
      <Tab label="A" sx={{ textTransform: "none" }} />
      <Tab label="B" sx={{ textTransform: "none" }} />
      <Tab label="C" sx={{ textTransform: "none" }} />
      <Tab
        label={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography>Summary</Typography>
            <Tooltip title="Collapse to Document Reports">
              <IconButton size="small" onClick={handleCollapse} aria-label="Collapse to Document Reports">
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        }
        sx={{ textTransform: "none" }}
      />
    </Tabs>
  );

  return (
    <Box sx={{ p: 2 }}>
      <CssBaseline />
      <Paper variant="outlined" sx={{ mb: 2, p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">View</Typography>
          <Divider flexItem orientation="vertical" sx={{ mx: 1 }} />
          {/* Tabs Row */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {expanded === "my" && (
              <Stack direction="row" alignItems="center" spacing={1}>
                {MyDocsTabs}
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                {SingleParentTab("reports")}
              </Stack>
            )}
            {expanded === "reports" && (
              <Stack direction="row" alignItems="center" spacing={1}>
                {SingleParentTab("my")}
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                {ReportsTabs}
              </Stack>
            )}
          </Box>{/* <-- FIX: close the Box that wraps the tab rows */}
        </Stack>
      </Paper>

      <Box sx={{ height: 480 }}>
        <DataGrid
          rows={activeRows}
          columns={columns}
          pageSizeOptions={[5, 10]}
          initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
          density="compact"
          disableRowSelectionOnClick
        />
      </Box>
    </Box>
  );
}
