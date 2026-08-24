# jaketennet.com

A Three.js site built with Vite.

The source also runs directly in the browser, preserving the repository's existing
root-based GitHub Pages deployment.

## Local development

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
```

The `CNAME` file connects GitHub Pages to `jaketennet.com` and must remain in the published root.

## Shared high scores

The game includes an optional global leaderboard. The finish screen shows the top
five times, while the header leaderboard shows the top ten. The portfolio remains a
static GitHub Pages site; scores are stored by the separate Cloudflare Worker in
`scoreboard-worker/` and its D1 database.

### One-time setup

1. Sign in to Cloudflare from the project root:

   ```sh
   npx wrangler login
   ```

2. Create the database near the site's audience:

   ```sh
   npx wrangler d1 create jt-scoreboard --location=weur
   ```

3. Copy the returned database ID over `REPLACE_WITH_YOUR_D1_DATABASE_ID` in
   `scoreboard-worker/wrangler.jsonc`.

4. Create the table and deploy the API:

   ```sh
   npx wrangler d1 migrations apply jt-scoreboard --remote --config scoreboard-worker/wrangler.jsonc
   npx wrangler deploy --config scoreboard-worker/wrangler.jsonc
   ```

5. Copy the deployed `workers.dev` URL into the `scoreboard-api-url` meta tag in
   `index.html`, without a trailing slash. Commit and push that final change so
   GitHub Pages can use the API.

Until the URL is configured, the game degrades gracefully: score controls are
disabled and the rest of the portfolio continues to work. The Worker accepts
only three-character names and plausible race times, keeps the fastest 500
submissions, and returns either the top five or top ten. As with any browser game, this is an
informal leaderboard rather than a cheat-proof competitive service.

Time-trial submissions use a one-use race session created at the starting signal.
The Worker records three ordered checkpoints and the finish with its own clock,
requires the submitted time to match that clock, rejects times below 25 seconds,
and rate-limits race and score writes per visitor. Guided runs with portfolio
pop-ups never receive a submission session.
