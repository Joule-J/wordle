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

## Current MVP behavior

- 2-player room-based play
- 5-letter guesses
- Wordle-style feedback colors
- Room-only chat
- New round button after a round ends
