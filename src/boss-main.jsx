import React from "react";
import ReactDOM from "react-dom/client";
import { BossPage } from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BossPage />
  </React.StrictMode>
);

// Same cleanup as the main entry point — removes any old service worker
// that might still be lingering on this device.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}
