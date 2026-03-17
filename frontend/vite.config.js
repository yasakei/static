import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import wails from "@wailsio/runtime/plugins/vite";

export default defineConfig({
  plugins: [react(), wails("./bindings")],
})