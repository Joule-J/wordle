# Online Wordle Chat

MVP for a 2-player online Wordle game with room chat.

## Local run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the backend:
   ```bash
   npm run dev
   ```
3. In a second terminal start the frontend:
   ```bash
   npm run dev -w client
   ```
4. Open the client at `http://localhost:5173`.

## Deploy

- Backend: Render, run `npm start` in `server/`
- Frontend: Vercel, build from `client/`

Set `VITE_API_BASE` on the frontend to the Render backend URL.

## Supabase setup

1. Create a Postgres database in Supabase.
2. Put these values into `server/.env.local` and the Render environment variables:
   - `DATABASE_URL`
   - `DIRECT_URL`
3. Run the backend once so Prisma can create the `UsedWord` table:
   ```bash
   npm run prisma:sync -w server
   ```
4. The word pool is stored in Supabase and the same target word will not be picked again until the pool resets.

## Current MVP behavior

- 2-player room-based play
- Create room or join by room code
- 5-letter guesses
- Wordle-style feedback colors
- Room-only chat
- 5-round match flow with Play Again to start a new match
