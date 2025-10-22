import * as React from "react";
import {
  Box,
  CssBaseline,
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer as MuiDrawer,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import HomeIcon from "@mui/icons-material/Home";
import InboxIcon from "@mui/icons-material/Inbox";
import StarIcon from "@mui/icons-material/Star";

/**
 * Three states:
 *  - "closed": drawer hidden entirely (initial)
 *  - "open": full-width persistent drawer that pushes page content right
 *  - "collapsed": mini (icon-only) rail that still pushes the content a smaller amount
 *
 * Behavior required:
 *  - Header menu button opens it from closed -> open.
 *  - Collapse button at the end toggles open <-> collapsed.
 *  - Pressing the header menu button while collapsed hides it completely (collapsed -> closed).
 *  - Pressing the header menu button while open hides it completely (open -> closed).
 *  - Rest of the page stays responsive.
 */

const drawerWidthOpen = 240;
const drawerWidthCollapsed = 72; // typical icon rail width

type DrawerState = "closed" | "open" | "collapsed";

const openedMixin = (theme: any) => ({
  width: drawerWidthOpen,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
});

const collapsedMixin = (theme: any) => ({
  width: drawerWidthCollapsed,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
});

const closedMixin = (theme: any) => ({
  width: 0,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: "hidden",
  border: 0,
});

const paperClipped = (theme: any) => ({
  position: "fixed",
  // Clip the drawer under the fixed AppBar
  top: 64,
  height: "calc(100vh - 64px)",
  [theme.breakpoints.down("sm")]: {
    top: 56,
    height: "calc(100vh - 56px)",
  },
});

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== "drawerstate" as any })<{
  drawerstate: DrawerState;
}>(({ theme, drawerstate }) => ({
  width:
    drawerstate === "open"
      ? drawerWidthOpen
      : drawerstate === "collapsed"
      ? drawerWidthCollapsed
      : 0,
  flexShrink: 0,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  ...(drawerstate === "open" && ({
    ...openedMixin(theme),
    "& .MuiDrawer-paper": { ...openedMixin(theme), boxSizing: "border-box" },
  })),
  ...(drawerstate === "collapsed" && ({
    ...collapsedMixin(theme),
    "& .MuiDrawer-paper": { ...collapsedMixin(theme), boxSizing: "border-box" },
  })),
  ...(drawerstate === "closed" && ({
    ...closedMixin(theme),
    "& .MuiDrawer-paper": { ...closedMixin(theme), boxSizing: "border-box" },
  })),
}));

const AppBar = styled(MuiAppBar)(({ theme }) => ({
  zIndex: theme.zIndex.drawer + 1,
}));

const Main = styled("main", {
  shouldForwardProp: (prop) => prop !== "drawerstate" as any,
})<{
  drawerstate: DrawerState;
}>(({ theme, drawerstate }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  transition: theme.transitions.create("margin", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: 0,
  ...(drawerstate === "open" && {
    marginLeft: drawerWidthOpen,
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
  ...(drawerstate === "collapsed" && {
    marginLeft: drawerWidthCollapsed,
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

export default function LeftPanelLayout() {
  const theme = useTheme();
  const [drawerState, setDrawerState] = React.useState<DrawerState>("closed");

  const handleMenuClick = () => {
    setDrawerState((prev) => {
      if (prev === "closed") return "open";
      // From either open or collapsed, the menu button hides it fully.
      return "closed";
    });
  };

  const handleCollapseToggle = () => {
    setDrawerState((prev) => (prev === "open" ? "collapsed" : "open"));
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <CssBaseline />

      <AppBar position="fixed">
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label={drawerState === "closed" ? "open navigation" : "hide navigation"}
            edge="start"
            onClick={handleMenuClick}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Your App
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Left rail / drawer */}
      <Drawer variant="permanent" anchor="left" drawerstate={drawerState}>
        {/* Clipped below the AppBar: use a Toolbar spacer at the top like the MUI example */}
        <Toolbar />
        <Box sx={{ display: "flex", flexDirection: "column", height: 1 }}>
          <Box sx={{ flex: 1, overflow: "auto", pt: 1 }}>
            <List>
              {["Home", "Inbox", "Starred"].map((text, index) => (
                <ListItemButton key={text} sx={{ px: 1.5 }}>
                  <ListItemIcon sx={{ minWidth: 0, mr: drawerState === "open" ? 2 : "auto", justifyContent: "center" }}>
                    {index === 0 ? <HomeIcon /> : index === 1 ? <InboxIcon /> : <StarIcon />}
                  </ListItemIcon>
                  {drawerState === "open" && <ListItemText primary={text} />}
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Divider />

          {/* Collapse/Expand control pinned to bottom */}
          <Box sx={{ p: 1, display: "flex", justifyContent: drawerState === "open" ? "space-between" : "center", alignItems: "center" }}>
            {drawerState === "open" && (
              <Typography variant="body2" color="text.secondary">
                Collapse to rail
              </Typography>
            )}
            <Tooltip title={drawerState === "open" ? "Collapse" : "Expand"} placement="top">
              <IconButton onClick={handleCollapseToggle} size="small">
                {theme.direction === "rtl" ? (
                  drawerState === "open" ? <ChevronRightIcon /> : <ChevronLeftIcon />
                ) : drawerState === "open" ? (
                  <ChevronLeftIcon />
                ) : (
                  <ChevronRightIcon />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Drawer>

      {/* Main content */}
      <Main drawerstate={drawerState}>
        <Toolbar />
        <Typography paragraph>
          Resize the window — the layout stays responsive. Use the menu button in the header to
          open/hide the left panel. Use the bottom chevron inside the panel to collapse to an icon rail
          or expand back to full width.
        </Typography>
        <Typography paragraph>
          This is placeholder content. Replace it with your actual page.
        </Typography>
      </Main>
    </Box>
  );
}
