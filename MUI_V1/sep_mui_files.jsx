// =============================
// FILE: src/components/LeftDrawer.tsx
// =============================
import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import HomeIcon from "@mui/icons-material/Home";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import SavingsIcon from "@mui/icons-material/Savings";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import SettingsIcon from "@mui/icons-material/Settings";
import Typography from "@mui/material/Typography";

export function LeftDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box role="presentation" sx={{ width: 280 }} onClick={onClose} onKeyDown={onClose}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
            Navigation
          </Typography>
        </Box>
        <Divider />
        <List>
          <ListItemButton>
            <ListItemIcon>
              <HomeIcon />
            </ListItemIcon>
            <ListItemText primary="Home" />
          </ListItemButton>
          <ListItemButton>
            <ListItemIcon>
              <AccountBalanceIcon />
            </ListItemIcon>
            <ListItemText primary="Accounts" />
          </ListItemButton>
          <ListItemButton>
            <ListItemIcon>
              <CreditCardIcon />
            </ListItemIcon>
            <ListItemText primary="Cards" />
          </ListItemButton>
          <ListItemButton>
            <ListItemIcon>
              <SwapHorizIcon />
            </ListItemIcon>
            <ListItemText primary="Transfers" />
          </ListItemButton>
          <ListItemButton>
            <ListItemIcon>
              <SavingsIcon />
            </ListItemIcon>
            <ListItemText primary="Investments" />
          </ListItemButton>
        </List>
        <Divider />
        <List>
          <ListItemButton>
            <ListItemIcon>
              <SupportAgentIcon />
            </ListItemIcon>
            <ListItemText primary="Support" />
          </ListItemButton>
          <ListItemButton>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>
        </List>
      </Box>
    </Drawer>
  );
}

// =============================
// FILE: src/components/RightDrawer.tsx
// =============================
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";

export function RightDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <div role="presentation" style={{ width: 300 }} onClick={onClose} onKeyDown={onClose}>
        <div style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>Quick Access</div>
        <Divider />
        <List>
          <ListItemButton>
            <ListItemText primary="My Documents" />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary="My Reports" />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary="Trashed Documents" />
          </ListItemButton>
        </List>
      </div>
    </Drawer>
  );
}

// =============================
// FILE: src/components/header/ProcessSearch.tsx
// =============================
import * as React from "react";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { alpha } from "@mui/material/styles";

export function ProcessSearch({ onSelect }: { onSelect?: (value: string) => void }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const menuPaperRef = React.useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = React.useRef<number | null>(null);

  const processes = React.useMemo(
    () => Array.from({ length: 26 }, (_, i) => `Process ${String.fromCharCode(65 + i)}`),
    []
  );

  React.useEffect(() => () => { if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current); }, []);

  React.useEffect(() => {
    if (!anchorEl) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current && inputRef.current.contains(t)) return;
      if (menuPaperRef.current && menuPaperRef.current.contains(t)) return;
      setAnchorEl(null);
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnchorEl(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [anchorEl]);

  const openMenu = (el: HTMLElement) => setAnchorEl(el);
  const closeMenu = () => setAnchorEl(null);

  return (
    <>
      <TextField
        fullWidth
        size="small"
        placeholder="Search Process"
        inputRef={inputRef}
        onFocus={(e) => openMenu(e.currentTarget)}
        onClick={(e) => openMenu(e.currentTarget)}
        onKeyDown={(e) => e.key === "Escape" && closeMenu()}
        onBlur={() => {
          if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = window.setTimeout(closeMenu, 150);
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <KeyboardArrowDownIcon sx={{ pointerEvents: "none" }} />
            </InputAdornment>
          ),
        }}
        sx={{
          width: { xs: 180, sm: 260, md: 340 },
          "& .MuiOutlinedInput-root": {
            bgcolor: alpha("#fff", 0.15),
            color: "inherit",
            "& fieldset": { borderColor: alpha("#fff", 0.5) },
            "&:hover fieldset": { borderColor: "#fff" },
          },
        }}
      />

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{ ref: menuPaperRef }}
      >
        {processes.map((p) => (
          <MenuItem key={p} onClick={() => { closeMenu(); onSelect?.(p); }}>{p}</MenuItem>
        ))}
      </Menu>
    </>
  );
}

// =============================
// FILE: src/components/header/UserMenu.tsx
// =============================
import * as React from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

export function UserMenu() {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const onClose = () => setAnchorEl(null);
  return (
    <>
      <Tooltip title="Account">
        <IconButton
          aria-label="user menu"
          aria-controls={anchorEl ? "user-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ color: "inherit" }}
        >
          <Avatar sx={{ bgcolor: "transparent", color: "inherit" }}>
            <AccountCircleIcon />
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        id="user-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={onClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem onClick={onClose}>Profile</MenuItem>
        <MenuItem onClick={onClose}>Security & Settings</MenuItem>
        <MenuItem onClick={onClose}>Statements</MenuItem>
        <MenuItem onClick={onClose}>Notifications</MenuItem>
        <Divider />
        <MenuItem onClick={onClose}>Sign out</MenuItem>
      </Menu>
    </>
  );
}

// =============================
// FILE: src/components/header/WellsFargoHeader.tsx
// =============================
import * as React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { ProcessSearch } from "./ProcessSearch";
import { UserMenu } from "./UserMenu";

export default function WellsFargoHeader({
  firstName = "John",
  onOpenLeft,
  onOpenRight,
}: {
  firstName?: string;
  onOpenLeft: () => void;
  onOpenRight: () => void;
}) {
  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: "#d42127", color: "#ffffff" }}>
      <Toolbar disableGutters sx={{ minHeight: 64, px: { xs: 2, sm: 3, md: 6 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
          {/* Left cluster: menu + logo + search */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton edge="start" onClick={onOpenLeft} sx={{ color: "inherit", mr: 0.5, "&:hover": { backgroundColor: alpha("#000", 0.08) } }}>
              <MenuIcon />
            </IconButton>
            <Typography component="div" sx={{ fontWeight: 800, letterSpacing: 2, fontSize: { xs: 18, sm: 20, md: 22 }, lineHeight: 1 }}>
              WELLS FARGO
            </Typography>
            <Box sx={{ ml: { xs: 1, sm: 2 } }}>
              <ProcessSearch />
            </Box>
          </Stack>

          {/* Right cluster: welcome + user + down arrow */}
          <Stack direction="row" alignItems="center" spacing={{ xs: 1, sm: 2, md: 3 }}>
            <Typography variant="body2" sx={{ opacity: 0.95, display: { xs: "none", sm: "block" } }}>
              {`hello ${firstName}`}
            </Typography>
            <UserMenu />
            <IconButton aria-label="open right menu" onClick={onOpenRight} sx={{ color: "inherit" }}>
              <KeyboardArrowDownIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Toolbar>
      <Box sx={{ height: 3, bgcolor: "#f6c21f" }} />
    </AppBar>
  );
}

// =============================
// FILE: src/App.tsx
// =============================
import * as React from "react";
import WellsFargoHeader from "./components/header/WellsFargoHeader";
import { LeftDrawer } from "./components/LeftDrawer";
import { RightDrawer } from "./components/RightDrawer";

export default function App() {
  const [leftOpen, setLeftOpen] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);

  return (
    <>
      <WellsFargoHeader
        firstName="John"
        onOpenLeft={() => setLeftOpen(true)}
        onOpenRight={() => setRightOpen(true)}
      />
      <LeftDrawer open={leftOpen} onClose={() => setLeftOpen(false)} />
      <RightDrawer open={rightOpen} onClose={() => setRightOpen(false)} />
      {/* page content placeholder */}
      <div style={{ height: 800, background: "#111" }} />
    </>
  );
}

// =============================
// FILE: src/main.tsx (for Vite)
// =============================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
