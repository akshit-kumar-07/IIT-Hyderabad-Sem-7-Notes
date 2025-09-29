import * as React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import HomeIcon from "@mui/icons-material/Home";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import SavingsIcon from "@mui/icons-material/Savings";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

/**
 * WellsFargoHeader
 * - MUI-only (no external components)
 * - Left Drawer with dummy items
 * - User avatar + welcome message + menu
 * - Right Drawer triggered by small down arrow
 * - Search bar next to logo; focusing/clicking it opens Process A..Z menu
 * - Dropdown closes on outside click, Escape, and blur (with small delay)
 */
export default function WellsFargoHeader({ firstName = "John" }: { firstName?: string }) {
  // Drawers & menus
  const [leftOpen, setLeftOpen] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [processAnchor, setProcessAnchor] = React.useState<HTMLElement | null>(null);

  // Refs for robust click-away handling of the process menu
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const processMenuPaperRef = React.useRef<HTMLDivElement | null>(null);

  // Single blur timeout ref (avoid duplicate declarations)
  const blurTimeoutRef = React.useRef<number | null>(null);

  // Cleanup any pending blur timeout on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  // Global listeners to close process menu on outside click or Escape
  React.useEffect(() => {
    if (!processAnchor) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchInputRef.current && searchInputRef.current.contains(t)) return;
      if (processMenuPaperRef.current && processMenuPaperRef.current.contains(t)) return;
      setProcessAnchor(null);
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProcessAnchor(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [processAnchor]);

  // Build Process A..Z options
  const processes = React.useMemo(
    () => Array.from({ length: 26 }, (_, i) => `Process ${String.fromCharCode(65 + i)}`),
    []
  );

  // Handlers: left/right drawers
  const toggleLeft = (val: boolean) => () => setLeftOpen(val);
  const toggleRight = (val: boolean) => () => setRightOpen(val);

  // Handlers: user menu
  const handleUserClick = (e: React.MouseEvent<HTMLElement>) => setUserMenuAnchor(e.currentTarget);
  const handleUserClose = () => setUserMenuAnchor(null);

  // Handlers: search/process menu
  const handleSearchFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProcessAnchor(e.currentTarget as unknown as HTMLElement);
  };
  const handleSearchClick = (e: React.MouseEvent<HTMLInputElement>) => {
    setProcessAnchor(e.currentTarget as unknown as HTMLElement);
  };
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setProcessAnchor(null);
  };
  const handleSearchBlur = () => {
    // Delay to allow menu item clicks to register
    if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = window.setTimeout(() => setProcessAnchor(null), 150);
  };

  return (
    <>
      <AppBar position="static" elevation={0} sx={{ bgcolor: "#d42127", color: "#ffffff" }}>
        <Toolbar disableGutters sx={{ minHeight: 64 }}>
          <Container maxWidth={false} sx={{ px: { xs: 2, sm: 3, md: 6 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              {/* Left cluster: menu + logo + search bar */}
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <IconButton
                  edge="start"
                  aria-label="open navigation menu"
                  onClick={toggleLeft(true)}
                  sx={{ color: "inherit", mr: 0.5, "&:hover": { backgroundColor: alpha("#000", 0.08) } }}
                >
                  <MenuIcon />
                </IconButton>

                <Typography component="div" sx={{ fontWeight: 800, letterSpacing: 2, fontSize: { xs: 18, sm: 20, md: 22 }, lineHeight: 1, userSelect: "none" }}>
                  WELLS FARGO
                </Typography>

                {/* Search bar next to logo */}
                <Box sx={{ ml: { xs: 1, sm: 2 }, width: { xs: 180, sm: 260, md: 340 } }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search Process"
                    inputRef={searchInputRef}
                    onFocus={handleSearchFocus}
                    onClick={handleSearchClick}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={handleSearchBlur}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <KeyboardArrowDownIcon sx={{ pointerEvents: "none" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        bgcolor: alpha("#fff", 0.15),
                        color: "inherit",
                        "& fieldset": { borderColor: alpha("#fff", 0.5) },
                        "&:hover fieldset": { borderColor: "#fff" },
                      },
                    }}
                  />

                  {/* Processes dropdown anchored to the search field */}
                  <Menu
                    id="process-menu"
                    anchorEl={processAnchor}
                    open={Boolean(processAnchor)}
                    onClose={() => setProcessAnchor(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    transformOrigin={{ vertical: "top", horizontal: "left" }}
                    PaperProps={{ ref: processMenuPaperRef }}
                  >
                    {processes.map((p) => (
                      <MenuItem key={p} onClick={() => setProcessAnchor(null)}>
                        {p}
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              </Stack>

              {/* Right cluster: welcome + user avatar + arrow to open right drawer */}
              <Stack direction="row" alignItems="center" spacing={{ xs: 1, sm: 2, md: 3 }}>
                <Typography variant="body2" sx={{ opacity: 0.95, display: { xs: "none", sm: "block" } }}>
                  {`hello ${firstName}`}
                </Typography>

                <Tooltip title="Account">
                  <IconButton
                    aria-label="user menu"
                    aria-controls={userMenuAnchor ? "user-menu" : undefined}
                    aria-haspopup="true"
                    aria-expanded={userMenuAnchor ? "true" : undefined}
                    onClick={handleUserClick}
                    sx={{ color: "inherit" }}
                  >
                    <Avatar sx={{ bgcolor: "transparent", color: "inherit" }}>
                      <AccountCircleIcon />
                    </Avatar>
                  </IconButton>
                </Tooltip>

                {/* Small down arrow to open right-side navigation */}
                <Tooltip title="Open quick menu">
                  <IconButton aria-label="open right menu" onClick={toggleRight(true)} sx={{ color: "inherit" }}>
                    <KeyboardArrowDownIcon />
                  </IconButton>
                </Tooltip>

                <Menu
                  id="user-menu"
                  anchorEl={userMenuAnchor}
                  open={Boolean(userMenuAnchor)}
                  onClose={handleUserClose}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem onClick={handleUserClose}>Profile</MenuItem>
                  <MenuItem onClick={handleUserClose}>Security & Settings</MenuItem>
                  <MenuItem onClick={handleUserClose}>Statements</MenuItem>
                  <MenuItem onClick={handleUserClose}>Notifications</MenuItem>
                  <Divider />
                  <MenuItem onClick={handleUserClose}>Sign out</MenuItem>
                </Menu>
              </Stack>
            </Stack>
          </Container>
        </Toolbar>

        {/* Thin yellow divider along the bottom edge */}
        <Box sx={{ height: 3, bgcolor: "#f6c21f" }} />
      </AppBar>

      {/* Left navigation drawer with dummy items */}
      <Drawer anchor="left" open={leftOpen} onClose={toggleLeft(false)}>
        <Box role="presentation" sx={{ width: 280 }} onClick={toggleLeft(false)} onKeyDown={toggleLeft(false)}>
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

      {/* Right navigation drawer triggered by down arrow */}
      <Drawer anchor="right" open={rightOpen} onClose={toggleRight(false)}>
        <Box role="presentation" sx={{ width: 300 }} onClick={toggleRight(false)} onKeyDown={toggleRight(false)}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
              Quick Access
            </Typography>
          </Box>
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
        </Box>
      </Drawer>
    </>
  );
}
