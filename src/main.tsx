import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Blueprint CSS for Polotno editor (loaded globally to avoid re-imports)
import "@blueprintjs/core/lib/css/blueprint.css";

createRoot(document.getElementById("root")!).render(<App />);
