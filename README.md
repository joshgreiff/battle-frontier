# Battle Frontier

Battle Frontier is a web app for Pokemon TCG testing groups. It tracks matches by
format code (for example `SVI-ASC`), computes
group matchup spreads, and supports meta-share recommendation workflows.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + PostgreSQL
- Next API route handlers

## Setup

1. Install dependencies:
   - `npm install`
2. Create local env:
   - `cp .env.example .env`
   - Set `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`
3. Generate client and push schema:
   - `npm run db:generate`
   - `npm run db:push`
4. Run:
   - `npm run dev`

## Current API Scaffolds

- `GET /api/groups`
- `POST /api/groups`
- `POST /api/groups/join`
- `POST /api/auth/register`
- `GET /api/matches?groupId=...&formatCode=...`
- `POST /api/matches`
- `POST /api/import/tcglive`
- `POST /api/recommendations`
