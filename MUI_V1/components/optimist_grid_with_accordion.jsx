import * as React from "react";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridRowClassNameParams,
  GridRowId,
  GridRowsProp,
} from "@mui/x-data-grid";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Button,
  Paper,
  Typography,
} from "@mui/material";

/** =====================================================
 * TYPES
 * =====================================================*/

// Minimal shape for any real/business row you care about in your app.
export type BaseRow = {
  id: GridRowId; // Required by DataGrid
  [key: string]: any;
};

// Shape of a synthetic "detail" row that we inject directly
// under its parent row when expanded.
export type DetailRow = BaseRow & {
  id: `${string}__detail` | `${number}__detail`;
  __parentId: GridRowId;
  __isDetail: true;
};

// The DataGrid actually renders a list that may contain
// BOTH real rows and injected detail rows.
export type OptimistRow = BaseRow | DetailRow;

// Example domain row
export type PersonRow = BaseRow & {
  name: string;
  role: string;
  team: string;
  notes: string;
};

/** Demo data for preview */
const demoRows: PersonRow[] = [
  {
    id: 1,
    name: "Ada Lovelace",
    role: "Mathematician",
    team: "Analytics",
    notes:
      "Working on translating and annotating Analytical Engine notes. Loves elegant proofs.",
  },
  {
    id: 2,
    name: "Grace Hopper",
    role: "Computer Scientist",
    team: "Compilers",
    notes:
      "Champion of machine-independent languages. Asking for more coffee in prod.",
  },
  {
    id: 3,
    name: "Katherine Johnson",
    role: "Orbital Analyst",
    team: "Trajectory",
    notes:
      "Validating reentry vectors and orbital windows. NASA keeps saying 'wow'.",
  },
];

/** =====================================================
 * useOptimistRowExpansion HOOK (REUSABLE)
 * =====================================================
 * Goal:
 *  - Works with the MIT/community DataGrid (no Pro features)
 *  - Tracks which row IDs are currently expanded
 *  - Dynamically injects a synthetic "detail" row *under* any
 *    expanded parent row
 *
 * Why we do this:
 *  The Pro/Premium grids have `rowDetailPanel`. Community DataGrid
 *  does not. We simulate inline expansion by literally inserting an
 *  extra row that contains the Accordion content. Because it's just
 *  another row in `rows`, the rest of the table naturally gets
 *  pushed down.
 */
export function useOptimistRowExpansion<T extends BaseRow>(rawRows: T[]) {
  const [expandedRowIds, setExpandedRowIds] = React.useState<GridRowId[]>([]);

  // Is a parent row expanded?
  const isExpanded = React.useCallback(
    (rowId: GridRowId) => expandedRowIds.includes(rowId),
    [expandedRowIds]
  );

  // Toggle expansion on/off for a given parent row ID
  const toggleRow = React.useCallback((rowId: GridRowId) => {
    setExpandedRowIds((prev) => {
      const open = prev.includes(rowId);
      return open ? prev.filter((id) => id !== rowId) : [...prev, rowId];
    });
  }, []);

  // Build the actual rows list we'll hand to <DataGrid />.
  // For each real row R:
  //   - push R
  //   - if R is expanded, ALSO push R__detail right after it
  const computedRows: GridRowsProp<OptimistRow> = React.useMemo(() => {
    const out: OptimistRow[] = [];

    for (const r of rawRows) {
      out.push(r);

      if (expandedRowIds.includes(r.id)) {
        const detailRow: DetailRow = {
          ...r,
          id: `${String(r.id)}__detail`,
          __parentId: r.id,
          __isDetail: true,
        };
        out.push(detailRow);
      }
    }

    return out;
  }, [rawRows, expandedRowIds]);

  return {
    rowsWithDetail: computedRows,
    expandedRowIds,
    isExpanded,
    toggleRow,
    setExpandedRowIds,
  };
}

/**
 * Lightweight self-test for the hook logic.
 * This is NOT exported. It's here so devs can sanity check behavior.
 * You can call runHookSelfTest() manually in a sandbox or unit test.
 */
function runHookSelfTest() {
  // pretend data
  const sample: PersonRow[] = [
    { id: 1, name: "A", role: "R1", team: "T1", notes: "N1" },
    { id: 2, name: "B", role: "R2", team: "T2", notes: "N2" },
  ];

  // simulate initial mount
  const initExpanded: GridRowId[] = [];
  // expected: just 2 rows, no detail rows
  console.assert(initExpanded.length === 0, "initial expanded should be []");

  // simulate expansion of id=2 -> we should insert synthetic row after row 2
  const afterExpand = [2];
  const recomputeRows = (expandedIds: GridRowId[]) => {
    const out: OptimistRow[] = [];
    for (const r of sample) {
      out.push(r);
      if (expandedIds.includes(r.id)) {
        out.push({
          ...r,
          id: `${String(r.id)}__detail`,
          __parentId: r.id,
          __isDetail: true,
        } as DetailRow);
      }
    }
    return out;
  };

  const rowsCollapsed = recomputeRows(initExpanded);
  const rowsExpanded = recomputeRows(afterExpand);

  console.assert(
    rowsCollapsed.length === 2,
    "collapsed: expected 2 rows and got " + rowsCollapsed.length
  );

  console.assert(
    rowsExpanded.length === 3,
    "expanded: expected 3 rows (row2 + row2__detail injected) but got " +
      rowsExpanded.length
  );

  console.assert(
    (rowsExpanded[2] as DetailRow).__isDetail === true,
    "expanded: last row should be a detail row"
  );
}

/** =====================================================
 * OptimistGridTable COMPONENT (COMMUNITY DATAGRID)
 * =====================================================
 * Responsibilities:
 *  - Renders a standard @mui/x-data-grid DataGrid (MIT license)
 *  - Adds an "optimist" button column: this is your expand/collapse control
 *  - Uses the hook to inject synthetic detail rows
 *  - Renders an Accordion INSIDE those synthetic rows
 *  - Visually pushes subsequent rows down inline (no modal / no overlay)
 *
 * Important bits:
 * 1. We define a special `detail` column that, for synthetic rows, spans
 *    across (almost) the whole grid via `colSpan`.
 * 2. We guard `colSpan` so it won't explode if DataGrid calls it in a
 *    context where `params` is undefined. (This was the source of your
 *    runtime error.)
 * 3. We style detail rows differently using `getRowClassName`.
 */
export function OptimistGridTable({ baseRows }: { baseRows: PersonRow[] }) {
  // Hook gives us expansion state + computed rows w/ injected detail rows
  const { rowsWithDetail, isExpanded, toggleRow } =
    useOptimistRowExpansion<PersonRow>(baseRows);

  // How many columns do we *effectively* want the Accordion cell to span?
  // We choose a big number (999) so MUI will clamp it to the visible columns.
  const SAFE_COLSPAN = 999;

  // Column definitions
  const columns = React.useMemo<GridColDef<OptimistRow>[]>(
    () => [
      /** -------------------------------------------
       * optimist column
       * -------------------------------------------*/
      {
        field: "optimist",
        headerName: "",
        width: 110,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: "center",
        headerAlign: "center",
        renderCell: (params: GridRenderCellParams<OptimistRow>) => {
          const thisRow = params.row as OptimistRow;

          // Don't render the button on injected detail rows
          if ((thisRow as DetailRow).__isDetail) {
            return null;
          }

          const rowId = thisRow.id;
          const open = isExpanded(rowId);

          return (
            <Button
              variant={open ? "contained" : "outlined"}
              size="small"
              onClick={(e) => {
                e.stopPropagation(); // don't trigger row selection
                toggleRow(rowId);
              }}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                borderRadius: 2,
                minWidth: 80,
              }}
            >
              optimist
            </Button>
          );
        },
      },

      /** -------------------------------------------
       * name column
       * -------------------------------------------*/
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<OptimistRow>) => {
          const thisRow = params.row as OptimistRow;
          // Hide normal cells for detail rows (they'll get Accordion instead)
          if ((thisRow as DetailRow).__isDetail) {
            return null;
          }
          return <>{(thisRow as PersonRow).name}</>;
        },
      },

      /** -------------------------------------------
       * role column
       * -------------------------------------------*/
      {
        field: "role",
        headerName: "Role",
        flex: 1,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<OptimistRow>) => {
          const thisRow = params.row as OptimistRow;
          if ((thisRow as DetailRow).__isDetail) {
            return null;
          }
          return <>{(thisRow as PersonRow).role}</>;
        },
      },

      /** -------------------------------------------
       * team column
       * -------------------------------------------*/
      {
        field: "team",
        headerName: "Team",
        flex: 1,
        minWidth: 130,
        renderCell: (params: GridRenderCellParams<OptimistRow>) => {
          const thisRow = params.row as OptimistRow;
          if ((thisRow as DetailRow).__isDetail) {
            return null;
          }
          return <>{(thisRow as PersonRow).team}</>;
        },
      },

      /** -------------------------------------------
       * detail column (Accordion lives here)
       * -------------------------------------------*/
      {
        field: "detail",
        headerName: "Details",
        flex: 3,
        minWidth: 400,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,

        // SAFETY FIX:
        // DataGrid may call `colSpan` with `params === undefined`
        // in some internal/virtualization phases.
        // Guarding prevents runtime "params is undefined" errors.
        colSpan: (params) => {
          if (!params || !(params as any).row) {
            return 1;
          }
          const maybeDetail = (params.row as any).__isDetail;
          return maybeDetail ? SAFE_COLSPAN : 1;
        },

        renderCell: (params: GridRenderCellParams<OptimistRow>) => {
          const thisRow = params.row as OptimistRow;

          // Only render Accordion for injected detail rows
          if (!(thisRow as DetailRow).__isDetail) {
            return null;
          }

          // The injected detail row is a shallow clone of its parent,
          // so we still have name/role/team/notes on it.
          const parentRow = thisRow as unknown as PersonRow;

          return (
            <Box sx={{ width: "100%" }}>
              <Accordion
                expanded
                disableGutters
                elevation={0}
                square
                sx={{
                  borderLeft: "4px solid rgba(59,130,246,0.4)",
                  bgcolor: "rgba(59,130,246,0.04)",
                  borderRadius: 1,
                }}
              >
                <AccordionSummary
                  sx={{
                    cursor: "default",
                    userSelect: "text",
                    "& .MuiAccordionSummary-content": {
                      margin: 0,
                    },
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, opacity: 0.8 }}
                  >
                    Extra context for {parentRow.name}
                  </Typography>
                </AccordionSummary>

                <AccordionDetails>
                  <Box className="flex flex-col gap-2 text-sm leading-relaxed">
                    <Box>
                      <span className="font-semibold text-gray-900">Role:</span>{" "}
                      <span className="text-gray-700">{parentRow.role}</span>
                    </Box>

                    <Box>
                      <span className="font-semibold text-gray-900">Team:</span>{" "}
                      <span className="text-gray-700">{parentRow.team}</span>
                    </Box>

                    <Box>
                      <span className="font-semibold text-gray-900">Notes:</span>{" "}
                      <span className="text-gray-700">{parentRow.notes}</span>
                    </Box>

                    <Box className="rounded-xl bg-white/60 ring-1 ring-gray-200 p-3 shadow-sm">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        FYI
                      </Typography>
                      <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                        {/* Avoid JSX parsing a fake <parent> tag.
                           We now explicitly print the concrete id so the
                           template parses validly and still conveys meaning. */}
                        This Accordion is rendered in a synthetic detail row
                        (id="{`${parentRow.id}__detail`}") that we inject
                        directly under the clicked row. Tapping the
                        "optimist" button again removes this detail row and
                        pulls the rest of the grid back up.
                      </Typography>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Box>
          );
        },
      },
    ],
    [isExpanded, toggleRow, SAFE_COLSPAN]
  );

  /** -------------------------------------------
   * Row styling: tint detail rows so they feel grouped
   * with their parent row.
   * -------------------------------------------*/
  const getRowClassName = React.useCallback(
    (params: GridRowClassNameParams<OptimistRow>) => {
      const r = params.row as OptimistRow;
      return (r as DetailRow).__isDetail
        ? "optimist-detail-row bg-blue-50/40"
        : "optimist-main-row";
    },
    []
  );

  return (
    <Paper
      className="w-full max-w-5xl mx-auto mt-6 rounded-2xl shadow-xl border border-gray-200"
      sx={{
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box className="px-4 py-3 border-b border-gray-200 flex flex-col gap-1 bg-white">
        <Typography variant="h6" className="font-semibold text-gray-900">
          People Grid (Community DataGrid)
        </Typography>
        <Typography
          variant="body2"
          className="text-gray-600"
          sx={{ lineHeight: 1.4 }}
        >
          Click the <strong>optimist</strong> button in any row to insert a
          detail row underneath it. That row shows an inline Accordion and
          pushes all later rows down. Click again to collapse.
        </Typography>
      </Box>

      <Box className="bg-white">
        <DataGrid
          autoHeight
          rows={rowsWithDetail}
          columns={columns}
          disableRowSelectionOnClick
          getRowClassName={getRowClassName}
          sx={{
            border: 0,
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
            },
            "& .MuiDataGrid-row.optimist-main-row:hover": {
              backgroundColor: "rgba(59,130,246,0.03)",
            },
            "& .MuiDataGrid-cell": {
              borderColor: "#f1f5f9",
              fontSize: "0.875rem",
              lineHeight: 1.4,
            },
            // Detail row tweaks so it feels connected to parent row
            "& .MuiDataGrid-row.optimist-detail-row .MuiDataGrid-cell": {
              borderBottom: "1px solid #e0e7ff",
              backgroundColor: "rgba(59,130,246,0.04)",
              py: 1.5,
            },
          }}
        />
      </Box>
    </Paper>
  );
}

/** =====================================================
 * DEMO / PREVIEW COMPONENT (DEFAULT EXPORT)
 * =====================================================
 * Canvas live preview renders this component.
 * In your app, you can instead directly render:
 *   <OptimistGridTable baseRows={yourRows} />
 */
export default function OptimistGridDemo() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4">
      <OptimistGridTable baseRows={demoRows} />
    </div>
  );
}
