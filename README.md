# Cold AI

Cold AI is a Minecraft-focused and general software engineering assistant.

## Stack
- React + TypeScript + Vite
- Cloudflare Worker API
- Cloudflare Workers AI
- Cloudflare D1
- Private GitHub Actions Java/Maven build runner for generated plugin JARs

## Local development
```bash
npm install
npm run dev
```

The Vite dev server only serves the frontend. For Worker API testing, build the frontend and run Wrangler:
```bash
npm run build
npx wrangler dev
```

## Deploy
Cloudflare Workers Git integration:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

The Worker uses the Workers AI binding `AI`, static assets from `dist`, and the D1 database binding `DB`.

## Automatic Minecraft JAR builder

The builder uses the private repository `AlishaYT/ColdAI-Builder` and a standard GitHub-hosted Ubuntu runner. Generated Maven project files are pushed to a temporary private branch, compiled with Java 21 and Maven, and uploaded as a short-lived workflow artifact. The Worker downloads the artifact and serves the compiled `.jar` to the chat UI.

### Required Worker secret

Create a fine-grained GitHub personal access token restricted to the single private repository `ColdAI-Builder`, with:
- Contents: Read and write
- Actions: Read and write
- Metadata: Read-only (GitHub's required repository permission)

Add the token in Cloudflare under the `cold-ai` Worker → Settings → Variables and Secrets as a **Secret** named:
`GITHUB_BUILD_TOKEN`

Never put this token in frontend source code, GitHub commits, or chat messages. The token is only used server-side by the Cloudflare Worker to create private build branches, dispatch builds, inspect workflow artifacts, and remove temporary branches after a JAR is downloaded.

The public chat currently rate-limits plugin build starts to two per source IP per hour. GitHub-hosted Actions usage and artifact storage are subject to the account's plan limits.

## Current implementation status
- Responsive chat UI, theme toggle, sidebar and browser-local chat history: implemented.
- File picker, text/code/config attachments, image previews, paste-image and drag-and-drop: implemented in the frontend.
- Worker chat endpoint with Workers AI: implemented.
- Automatic Maven plugin project generation, private GitHub Actions dispatch, build status polling and JAR download: implemented in code; requires the `GITHUB_BUILD_TOKEN` Worker secret before the chat build button can be used.
- Cloud-synced chat history, OAuth login, R2 file storage, live web research, full PDF parsing and long-term account management: later stages.

## Database
The repository contains D1 schema migrations. Review destructive reset migration `0002_full_reset.sql` before applying it to an existing database.
