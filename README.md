# Cold AI

Cold AI is a Minecraft-focused and general software engineering assistant.

## Stack
- React + TypeScript + Vite
- Cloudflare Worker API
- Cloudflare Workers AI
- Cloudflare D1 (schema scaffolded; persistence API is a later stage)

## Local development
```bash
npm install
npm run dev
```

The Vite dev server only serves the frontend. For AI API testing, run the Worker locally with Wrangler after building the frontend:
```bash
npm run build
npx wrangler dev
```

## Deploy
Cloudflare Workers Git integration should use:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

The Worker uses the Workers AI binding `AI`, static assets from `dist`, and the existing D1 database binding `DB`.

Apply the database migration once:
```bash
npx wrangler d1 migrations apply cold-ai-db --remote
```

## Current implementation status
- Chat-style responsive UI, theme toggle, sidebar and local chat history: implemented.
- Text attachment reading and image preview: initial client-side support.
- Workers AI request endpoint: implemented; requires a successful Cloudflare deployment and enabled Workers AI binding.
- Cloud-synced chat history, OAuth, R2 uploads, web research, document/image understanding, isolated Minecraft builds and JAR artifacts: not implemented yet.

Do not configure secrets in frontend source. OAuth and external search credentials will be added as server-side Worker secrets in later stages.
