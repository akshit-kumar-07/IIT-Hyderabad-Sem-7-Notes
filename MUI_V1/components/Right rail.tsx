import * as React from "react"; import { Box, Stack, Paper, Tooltip, IconButton, Divider, Typography, CssBaseline, AppBar, Toolbar, } from "@mui/material"; import { DataGrid, GridColDef, GridRowSelectionModel } from "@mui/x-data-grid";

// Icons import UploadFileIcon from "@mui/icons-material/UploadFile"; import EditOutlinedIcon from "@mui/icons-material/EditOutlined"; import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"; import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined"; // resendToOCR import PersonSearchOutlinedIcon from "@mui/icons-material/PersonSearchOutlined"; // Select User import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined"; // Assign User import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined"; // Remove User

/**

Reusable sticky action rail that appears on the RIGHT and is

CLIPPED under the AppBar (like the left drawer behavior).

Hidden unless visible is true (e.g., when any grid row is selected)


When visible, occupies fixed width and pushes page content (no overlay)


Clipped below header: full-height = viewport minus AppBar height */ function ActionIconRail({ visible, width = 72, appBarOffsetXs = 56, // typical dense height on xs appBarOffsetSm = 64, // typical height on sm+ onUpload, onEdit, onDelete, onResendToOCR, onSelectUser, onAssignUser, onRemoveUser, }: { visible: boolean; width?: number; appBarOffsetXs?: number; appBarOffsetSm?: number; onUpload?: () => void; onEdit?: () => void; onDelete?: () => void; onResendToOCR?: () => void; onSelectUser?: () => void; onAssignUser?: () => void; onRemoveUser?: () => void; }) { if (!visible) return null; return ( <Paper elevation={1} sx={{ width, borderLeft: 1, borderColor: "divider", position: "sticky", top: { xs: appBarOffsetXs, sm: appBarOffsetSm }, height: { xs: calc(100vh - ${appBarOffsetXs}px), sm: calc(100vh - ${appBarOffsetSm}px) }, display: "flex", flexDirection: "column", py: 1, }}


> 

<Stack spacing={0.5} alignItems="center" sx={{ pt: 1 }}> <Tooltip title="Upload" placement="left"> <IconButton size="large" onClick={onUpload} aria-label="Upload"> <UploadFileIcon /> </IconButton> </Tooltip> <Tooltip title="Edit" placement="left"> <IconButton size="large" onClick={onEdit} aria-label="Edit"> <EditOutlinedIcon /> </IconButton> </Tooltip> <Tooltip title="Delete" placement="left"> <IconButton size="large" onClick={onDelete} aria-label="Delete"> <DeleteOutlineIcon /> </IconButton> </Tooltip> <Divider flexItem sx={{ my: 1 }} /> <Tooltip title="Resend to OCR" placement="left"> <IconButton size="large" onClick={onResendToOCR} aria-label="Resend to OCR"> <AutorenewOutlinedIcon /> </IconButton> </Tooltip> <Divider flexItem sx={{ my: 1 }} /> <Tooltip title="Select User" placement="left"> <IconButton size="large" onClick={onSelectUser} aria-label="Select User"> <PersonSearchOutlinedIcon /> </IconButton> </Tooltip> <Tooltip title="Assign User" placement="left"> <IconButton size="large" onClick={onAssignUser} aria-label="Assign User"> <PersonAddAlt1OutlinedIcon /> </IconButton> </Tooltip> <Tooltip title="Remove User" placement="left"> <IconButton size="large" onClick={onRemoveUser} aria-label="Remove User"> <PersonRemoveOutlinedIcon /> </IconButton> </Tooltip> </Stack> </Paper> ); }


/**

Demo page: AppBar (fixed), DataGrid, and the right clipped action rail.

The rail appears when at least one row is selected and pushes the grid aside. */ export default function Preview() { const railWidth = 72; const appBarOffsetXs = 56; const appBarOffsetSm = 64;


const columns: GridColDef[] = [ { field: "id", headerName: "ID", width: 90 }, { field: "doc", headerName: "Document", flex: 1, minWidth: 180 }, { field: "owner", headerName: "Owner", width: 140 }, { field: "status", headerName: "Status", width: 140 }, ];

const rows = React.useMemo( () => Array.from({ length: 30 }).map((_, i) => ({ id: i + 1, doc: File_${i + 1}.pdf, owner: i % 2 ? "You" : "Teammate", status: i % 3 ? "Processed" : "In Progress", })), [] );

const [selection, setSelection] = React.useState<GridRowSelectionModel>([]); const railVisible = selection.length > 0;

// Handlers (replace with real behavior) const api = { onUpload: () => console.log("Upload clicked for", selection), onEdit: () => console.log("Edit clicked for", selection), onDelete: () => console.log("Delete clicked for", selection), onResendToOCR: () => console.log("ResendToOCR clicked for", selection), onSelectUser: () => console.log("Select User clicked for", selection), onAssignUser: () => console.log("Assign User clicked for", selection), onRemoveUser: () => console.log("Remove User clicked for", selection), };

return ( <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}> <CssBaseline /> {/* Fixed header like your app */} <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}> <Toolbar> <Typography variant="h6" noWrap>Documents</Typography> </Toolbar> </AppBar>

{/* Main content area */}
  <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
    {/* Spacer so content starts below the AppBar, like clipped drawer */}
    <Toolbar sx={{ minHeight: { xs: appBarOffsetXs, sm: appBarOffsetSm } }} />

    {/* Layout: grid (flex:1) + optional right rail spacer */}
    <Box sx={{ display: "flex", alignItems: "stretch", flex: 1, px: 2, pb: 2 }}>
      <Box sx={{ flex: 1 }}>
        <Paper variant="outlined" sx={{ height: `calc(100vh - ${appBarOffsetSm}px - 32px)` /* header + padding approx */ }}>
          <DataGrid
            rows={rows}
            columns={columns}
            checkboxSelection
            disableRowSelectionOnClick
            rowSelectionModel={selection}
            onRowSelectionModelChange={setSelection}
            pageSizeOptions={[5, 10]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            density="compact"
          />
        </Paper>
      </Box>

      {/* Spacer rail that pushes content; the sticky rail is clipped under AppBar */}
      {railVisible && (
        <Box sx={{ width: railWidth, ml: 1 }}>
          <ActionIconRail
            visible={railVisible}
            width={railWidth}
            appBarOffsetXs={appBarOffsetXs}
            appBarOffsetSm={appBarOffsetSm}
            onUpload={api.onUpload}
            onEdit={api.onEdit}
            onDelete={api.onDelete}
            onResendToOCR={api.onResendToOCR}
            onSelectUser={api.onSelectUser}
            onAssignUser={api.onAssignUser}
            onRemoveUser={api.onRemoveUser}
          />
        </Box>
      )}
    </Box>
  </Box>
</Box>

); }

  
