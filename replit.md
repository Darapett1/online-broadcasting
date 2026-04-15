# The Lightbearer

## Overview

A professional real-time audio broadcasting platform for gospel/worship ministries. Built like Mixlr with a Facebook-style broadcaster profile system.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/lightbearer) at previewPath "/"
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: bcryptjs + express-session + connect-pg-simple
- **Real-time audio**: WebSocket (ws package) relay server
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Broadcaster Accounts**: Full Facebook-style profiles — cover photo, avatar, name, @username, bio, phone, email/password login
- **Real-time Audio Broadcasting**: WebSocket-based audio relay (/ws/broadcast/:id → /ws/listen/:id)
- **AI Audio Processing**: Web Audio API chain — bass/mid/treble EQ filters + dynamics compressor
- **Broadcast Studio**: Form with title, description, thumbnail URL, venue, minister, 5-15 search tags, recording toggle
- **Live Waveform Visualizer**: AnalyserNode-powered real animated bars
- **Recording System**: Save to profile, save as draft, or discard on broadcast end
- **Listener View**: Rotating avatar animation, waveform, listener count, full broadcast details
- **Profile Pages**: Facebook-layout with cover/avatar, past recordings with download
- **Browse & Search**: All broadcasts searchable by tag or keyword

## WebSocket Paths

- `/ws/broadcast/:id` — Broadcaster sends audio chunks (Float32Array as ArrayBuffer)
- `/ws/listen/:id` — Listeners receive relayed audio chunks

Both paths are in artifact.toml paths array for proxy routing.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema

- `broadcasters` — broadcaster accounts
- `broadcasts` — live and past broadcasts
- `recordings` — saved recordings (public or draft)
- `session` — express-session store (auto-created)

## Test Accounts

All use password: `password123`
- grace@lightbearer.app (Pastor Emmanuel Grace)
- deborah@lightbearer.app (Minister Deborah Kings)
- daniel@lightbearer.app (Prophet Daniel Flames)
