import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import CustomerDisplay from "./CustomerDisplay";
import ErrorBoundary from "./components/ErrorBoundary";

function Root() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    // Detectamos la etiqueta de la ventana actual
    const win = getCurrentWindow();
    setWindowLabel(win.label);
  }, []);

  if (windowLabel === null) {
    return <div style={{ background: 'var(--bg-primary)', height: '100vh', width: '100vw' }} />;
  }

  return (
    <React.StrictMode>
      <ErrorBoundary>
        {windowLabel === "customer-display" ? <CustomerDisplay /> : <App />}
      </ErrorBoundary>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Root />,
);
