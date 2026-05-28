import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const PgSession = connectPgSimple(session);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// When the frontend is hosted on GitHub Pages (different domain than Cloud Run),
// FRONTEND_URL must be set to the exact GitHub Pages origin, e.g.:
//   https://yourusername.github.io
// Without it we fall back to same-origin permissive mode (Replit dev).
const frontendUrl = process.env["FRONTEND_URL"];
app.use(cors({
  origin: frontendUrl || true,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env["SESSION_SECRET"] ?? "lightbearer-secret-key-change-in-prod";
const isProd = process.env["NODE_ENV"] === "production";

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      // cross-origin (GitHub Pages ↔ Cloud Run) requires sameSite:none + secure:true
      secure: isProd,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProd ? "none" : "lax",
    },
  }),
);

app.use("/api", router);

export default app;
