import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  throw new Error("SUPABASE_DATABASE_URL is not set. Set it before running push:prod");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
