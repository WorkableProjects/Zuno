import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/motion.css";
import "./styles/polish.css";
import { App } from "./app/App";
import { applyMotion, loadMotion } from "./app/storage";

applyMotion(loadMotion());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
