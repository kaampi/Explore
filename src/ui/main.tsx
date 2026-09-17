import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { StudioErrorBoundary } from "./studio/StudioErrorBoundary";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <React.StrictMode>
    <StudioErrorBoundary fallbackTitle="The app hit an error. Try again, or tell Mats what you clicked.">
      <App />
    </StudioErrorBoundary>
  </React.StrictMode>
);
