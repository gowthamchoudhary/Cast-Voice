# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is **CastVoice** — a cinematic story-to-audio-drama platform.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Auth**: Replit Auth (OIDC)
- **AI/Voice**: ElevenLabs TTS, voice cloning, voice design

## Artifacts

- `artifacts/api-server` — Express 5 backend, port from `PORT` env var
- `artifacts/castvoice` — React/Vite frontend, cinematic dark theme

## Libraries

- `lib/api-spec` — OpenAPI YAML spec + Zod schemas (codegen via Orval)
- `lib/api-client-react` — React Query hooks generated from spec
- `lib/db` — Drizzle ORM schema and DB client
  - `lib/db/src/schema/castvoice.ts` — userProfiles, stories, projects, inviteLinks, voiceLibrary
  - `lib/db/src/schema/auth.ts` — sessions, users (from Replit Auth template)
- `lib/replit-auth-web` — `useAuth()` hook for frontend auth state

## Key Commands

```bash
pnpm install            # install all workspace deps
pnpm --filter @workspace/api-server run dev    # start API server
pnpm --filter @workspace/castvoice run dev     # start frontend
pnpm --filter @workspace/db run push           # push DB schema
pnpm --filter @workspace/api-spec run codegen  # regenerate API types
```

## CastVoice Features

1. **Landing page** (`/`) — hero + feature cards, Replit Auth sign-in
2. **Dashboard** (`/dashboard`) — user's projects list, status badges
3. **Stories** (`/stories`) — browse 5 seeded stories + import custom
4. **Cast** (`/cast/:id`) — assign AI/clone/invite/library voices to each character
5. **Generate** (`/generate/:id`) — polling progress page, auto-redirects
6. **Play** (`/play/:id`) — audio player + script display + scene imagery
7. **Settings** (`/settings`) — profile + voice clone + My Voice Library (browse, preview, delete)
8. **Join** (`/join/:uuid`) — invite page: auth gate, record/upload, tagged submission → owner's Voice Library

## Important Details

- Auth uses `req.user.id` (Replit user ID / OIDC `sub`)
- Stories seeded on first API server start (idempotent)
- `useToast` is at `@/hooks/use-toast` (NOT `@/components/ui/use-toast`)
- Voice design API falls back to default ElevenLabs voices if design API is unavailable
- Generation pipeline: voice design → TTS per line → SFX → scene images → audio concat
- ElevenLabs API key stored as `ELEVENLABS_API_KEY` secret
