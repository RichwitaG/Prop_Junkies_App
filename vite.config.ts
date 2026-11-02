import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works at https://<user>.github.io/Prop_Junkies_App/
  // as well as at a domain root or when opened locally.
  base: "./",
});
