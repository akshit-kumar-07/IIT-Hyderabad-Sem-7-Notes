import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  Paper,
  Backdrop,
  IconButton,
  Stack,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  Stepper,
  Step,
  StepLabel,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { AnimatePresence, motion } from "framer-motion";

// ---------------- GuidedTour component ----------------

function GuidedTour({ steps }) {
  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: "bottom" });
  const [highlightRect, setHighlightRect] = useState(null);

  const totalSteps = steps.length;

  // Scroll to & highlight the active element when the tour is open
  useEffect(() => {
    if (!open) return;

    const step = steps[activeStep];
    if (!step) return;

    const el = document.getElementById(step.id);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [open, activeStep, steps]);

  // Position overlay highlight + tooltip near the active element
  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const step = steps[activeStep];
      if (!step) return;
      const el = document.getElementById(step.id);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Highlight box roughly around the element
      setHighlightRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Tooltip positioning
      const estimatedHeight = 240;
      const cardWidth = 380;

      let top = rect.bottom + 16;
      let placement = "bottom";

      if (top + estimatedHeight > viewportHeight - 16) {
        top = rect.top - estimatedHeight - 16;
        placement = "top";
      }

      let left = rect.left;
      if (left + cardWidth > viewportWidth - 16) {
        left = viewportWidth - cardWidth - 16;
      }
      if (left < 16) left = 16;
      if (top < 16) top = 16;

      setTooltipPos({ top, left, placement });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, activeStep, steps]);

  // Keyboard shortcuts: → / ← to navigate, Esc to close
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveStep((prev) => (prev === totalSteps - 1 ? prev : prev + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveStep((prev) => (prev === 0 ? 0 : prev - 1));
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, totalSteps]);

  const handleStart = () => {
    setActiveStep(0);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleNext = () => {
    setActiveStep((prev) => (prev === totalSteps - 1 ? prev : prev + 1));
  };

  const handleBack = () => {
    setActiveStep((prev) => (prev === 0 ? 0 : prev - 1));
  };

  const currentStep = steps[activeStep];

  return (
    <>
      {/* Floating button to start the tour */}
      <Button
        variant="contained"
        sx={{
          position: "fixed",
          right: 24,
          bottom: 24,
          borderRadius: 999,
          px: 3,
          zIndex: (theme) => theme.zIndex.drawer + 2,
          boxShadow: 4,
        }}
        onClick={handleStart}
      >
        Take a quick tour
      </Button>

      {/* Dark overlay + spotlight + animated tooltip card */}
      <Backdrop
        open={open}
        sx={{
          color: "#fff",
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: "transparent",
        }}
      >
        <AnimatePresence>
          {open && highlightRect && (
            <motion.div
              key="highlight"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "fixed",
                top: highlightRect.top - 12,
                left: highlightRect.left - 12,
                width: highlightRect.width + 24,
                height: highlightRect.height + 24,
                pointerEvents: "none",
                borderRadius: 16,
                boxShadow:
                  "0 0 0 9999px rgba(0,0,0,0.65), 0 18px 45px rgba(0,0,0,0.6)",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  border: "2px solid rgba(144, 202, 249, 0.9)",
                  boxShadow: "0 0 18px rgba(144, 202, 249, 0.9)",
                  "@keyframes pulseRing": {
                    "0%": { boxShadow: "0 0 0 0 rgba(144, 202, 249, 0.7)" },
                    "70%": {
                      boxShadow: "0 0 0 12px rgba(144, 202, 249, 0)",
                    },
                    "100%": {
                      boxShadow: "0 0 0 0 rgba(144, 202, 249, 0)",
                    },
                  },
                  animation: "pulseRing 1.8s ease-out infinite",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {open && currentStep && (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0, y: tooltipPos.placement === "bottom" ? 16 : -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: tooltipPos.placement === "bottom" ? 16 : -16 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "fixed",
                top: tooltipPos.top,
                left: tooltipPos.left,
                maxWidth: 380,
                width: "100%",
              }}
            >
              <Paper
                elevation={6}
                sx={{
                  p: 2.5,
                  position: "relative",
                  borderRadius: 3,
                  backdropFilter: "blur(10px)",
                }}
              >
                {/* Arrow pointing to the component */}
                <Box
                  sx={{
                    position: "absolute",
                    ...(tooltipPos.placement === "bottom"
                      ? {
                          top: -8,
                          borderBottomColor: "background.paper",
                        }
                      : {
                          bottom: -8,
                          borderTopColor: "background.paper",
                        }),
                    left: 32,
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderBottom:
                      tooltipPos.placement === "bottom"
                        ? "8px solid"
                        : undefined,
                    borderTop:
                      tooltipPos.placement === "top" ? "8px solid" : undefined,
                  }}
                />

                <IconButton
                  size="small"
                  onClick={handleClose}
                  sx={{ position: "absolute", right: 6, top: 6 }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    label="Guided tour"
                    sx={{ fontSize: 11, height: 22, borderRadius: 999 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Step {activeStep + 1} of {totalSteps}
                  </Typography>
                </Stack>

                <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                  {currentStep.title}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {currentStep.description}
                </Typography>

                <Divider sx={{ mb: 1.5 }} />

                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                  Use ← / → keys to navigate, or Esc to close.
                </Typography>

                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Stepper
                    activeStep={activeStep}
                    alternativeLabel
                    sx={{ flexGrow: 1, "& .MuiStepLabel-label": { display: "none" } }}
                  >
                    {steps.map((step, index) => (
                      <Step key={step.id}>
                        <StepLabel
                          icon={
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                border: "1px solid",
                                borderColor:
                                  index <= activeStep
                                    ? "primary.main"
                                    : "divider",
                                backgroundColor:
                                  index === activeStep ? "primary.main" : "background.paper",
                              }}
                            />
                          }
                        />
                      </Step>
                    ))}
                  </Stepper>
                </Stack>

                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                  <Button
                    onClick={handleBack}
                    disabled={activeStep === 0}
                    size="small"
                    variant="text"
                  >
                    Back
                  </Button>
                  <Stack direction="row" spacing={1}>
                    <Button onClick={handleClose} size="small" variant="text">
                      Skip tour
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={activeStep === totalSteps - 1 ? handleClose : handleNext}
                    >
                      {activeStep === totalSteps - 1 ? "Finish" : "Next"}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </motion.div>
          )}
        </AnimatePresence>
      </Backdrop>
    </>
  );
}

// ---------------- Dummy page using GuidedTour ----------------

export default function App() {
  const sections = [
    {
      id: "top-nav",
      title: "Top navigation bar",
      description:
        "This AppBar contains the main navigation for the page. Users can jump to key sections like Hero, Features, Testimonials, and CTA.",
    },
    {
      id: "hero-card",
      title: "Hero section",
      description:
        "The hero card introduces the page with a bold heading, explanatory text, and a primary call-to-action button.",
    },
    {
      id: "feature-grid",
      title: "Feature grid",
      description:
        "This grid of cards highlights individual features. Each card is a separate component with its own title and description.",
    },
    {
      id: "testimonials",
      title: "Testimonials block",
      description:
        "A simple testimonial area that adds social proof. It uses Typography inside a Paper component.",
    },
    {
      id: "cta-section",
      title: "Call-to-action section",
      description:
        "The final call-to-action encourages the user to get started, using a clear button and a short persuasive line.",
    },
  ];

  return (
    <>
      {/* Top navigation bar */}
      <AppBar position="sticky" id="top-nav">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Guided Tour Demo
          </Typography>
          <Button color="inherit" href="#hero-card" sx={{ textTransform: "none" }}>
            Hero
          </Button>
          <Button
            color="inherit"
            href="#feature-grid"
            sx={{ textTransform: "none" }}
          >
            Features
          </Button>
          <Button
            color="inherit"
            href="#testimonials"
            sx={{ textTransform: "none" }}
          >
            Testimonials
          </Button>
          <Button
            color="inherit"
            href="#cta-section"
            sx={{ textTransform: "none" }}
          >
            Get started
          </Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 6 }}>
        {/* HERO CARD */}
        <Box id="hero-card" sx={{ mb: 6 }}>
          <Card sx={{ p: 2 }}>
            <CardContent>
              <Typography variant="h4" gutterBottom>
                Welcome to the Demo Page
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                This hero section introduces the product or website in a concise way.
                It typically includes a headline, a short explanation, and a primary
                call-to-action button.
              </Typography>
              <Button variant="contained">Primary action</Button>
            </CardContent>
          </Card>
        </Box>

        {/* FEATURE GRID */}
        <Box id="feature-grid" sx={{ mb: 6 }}>
          <Typography variant="h5" gutterBottom>
            Features
          </Typography>
          <Grid container spacing={2}>
            {["Fast setup", "Analytics", "Customization"].map((feature) => (
              <Grid item xs={12} md={4} key={feature}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {feature}
                    </Typography>
                    <Typography variant="body2">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc
                      viverra justo sit amet mi tempus.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* TESTIMONIALS */}
        <Box id="testimonials" sx={{ mb: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              What people say
            </Typography>
            <Typography variant="body1">
              "This product completely changed the way we work. The onboarding
              experience was smooth and the guided tour made it easy to
              understand the interface."
            </Typography>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              — Happy Customer
            </Typography>
          </Paper>
        </Box>

        {/* CTA SECTION */}
        <Box id="cta-section" sx={{ mb: 6, textAlign: "center" }}>
          <Typography variant="h5" gutterBottom>
            Ready to get started?
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Use a clear, focused call-to-action to move users to the next step.
          </Typography>
          <Button variant="contained" size="large">
            Get started
          </Button>
        </Box>
      </Container>

      {/* Our guided tour that points to concrete components */}
      <GuidedTour steps={sections} />
    </>
  );
}
