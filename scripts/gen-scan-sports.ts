// Writes the sports/markets list the scan-slip server function uses.
// Run after changing src/domain/sports.ts:  npx vite-node scripts/gen-scan-sports.ts
import { writeFileSync } from "node:fs";
import { scanSportsData } from "../src/domain/sports";

writeFileSync("supabase/functions/scan-slip/sports.json", JSON.stringify(scanSportsData(), null, 2) + "\n");
console.log("wrote supabase/functions/scan-slip/sports.json");
