import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/motion.css";
import { App } from "./app/App";

// The border beam animates a registered custom property. Where that is not
// supported, tiles fall back to a static high-contrast border.
if (typeof CSS === "undefined" || !("registerProperty" in CSS)) {
  document.documentElement.classList.add("no-beam");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
