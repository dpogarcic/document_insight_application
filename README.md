# Document Insight Application

Next.js frontend for the [Document Insight Platform](https://github.com/dpogarcic/document_insight)
API. It provides the authenticated UI for browsing the document library, uploading and
activating document versions, and asking questions over authorized evidence.

## Features

- Login against the platform API and role-aware UI (`tenant_admin`, `editor`, `viewer`)
  decoded from the issued bearer token.
- Document library view: filter by department, upload new documents or new versions,
  and (as a tenant admin) activate a ready version as the document's current searchable
  version.
- Chat/query view: ask a question with an optional entity/department filter and a
  configurable number of evidence passages, and see the grounded answer, evidence
  confidence score, guiding entities, and cited source passages.

## Local setup

Requires the [Document Insight Platform](https://github.com/dpogarcic/document_insight)
API running locally (defaults to `http://127.0.0.1:8000`).

```bash
pnpm install
pnpm dev
```

The app starts on [http://localhost:3000](http://localhost:3000).

## Configuration

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | client | `http://127.0.0.1:8000` | Base URL the browser uses for `/documents`, upload, and activation calls. |
| `DOCUMENT_INSIGHT_API_URL` | `app/api/query` route | falls back to `NEXT_PUBLIC_API_URL` | Base URL the server-side query route proxies `/query` requests to. |

## Project structure

- [`app/page.tsx`](app/page.tsx) - document library, upload, and version-activation UI.
- [`app/components/Chat.tsx`](app/components/Chat.tsx) - query/chat UI against `/query`.
- [`app/api/query/route.ts`](app/api/query/route.ts) - server-side proxy that forwards
  authenticated query requests to the platform API.

## Scripts

- `pnpm dev` - start the development server.
- `pnpm build` - production build.
- `pnpm start` - serve a production build.
- `pnpm lint` - run ESLint.
