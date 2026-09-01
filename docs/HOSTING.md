# Hosting and Browser Data Flow

This project is a static, multi-page browser application. Vercel provides the application files, but it does not parse, receive, or store a selected ChatGPT export.

## Deployment Layout

The repository contains two different layers:

- `src/` contains the TypeScript source.
- `app/` contains the HTML, CSS, generated JavaScript, and parser worker that a browser actually loads.

`vercel.json` keeps the Vercel project root at the repository root so the build can access `src/`, `scripts/`, and the vendored TypeScript compiler. Vercel runs `bash scripts/build.sh`, which performs these steps:

1. Resolve the Node.js executable already provided by the build environment.
2. Compile `src/**/*.ts` into `.tsbuild/` with the vendored TypeScript compiler.
3. Copy the generated JavaScript into `app/`.
4. Publish only the contents of `app/` because `outputDirectory` is set to `app`.

An output directory is mounted at the deployment URL root. That means these repository files become these public routes:

| Repository file | Hosted route |
| --- | --- |
| `app/index.html` | `/` and `/index.html` |
| `app/conversation.html` | `/conversation.html` |
| `app/styles.css` | `/styles.css` |
| `app/app.js` | `/app.js` |
| `app/conversation-parser-worker.js` | `/conversation-parser-worker.js` |

The HTML and JavaScript use relative URLs. From `/`, `./styles.css` resolves to `/styles.css`. From `/conversation.html`, `./conversation-parser-worker.js` also resolves to `/conversation-parser-worker.js`. No single-page-application rewrite or server function is required.

Temporary redirects map old `/app/...` deployment URLs to the new root-level paths. They are deliberately temporary during rollout so a bad mapping is not permanently cached by browsers. They can be made permanent after the production deployment and query-string navigation are verified.

## What Happens When an Archive Is Selected

The file or folder picker returns browser `File` objects directly to the page's JavaScript. The application then performs all archive work inside the browser:

1. The selected `conversations.json` or `chat.html` is read with the browser File API.
2. Conversation parsing runs in a Web Worker so large archives do not freeze the visible page.
3. The generated conversation index is kept in memory and persisted in IndexedDB for later restoration.
4. A smaller single-file fallback cache may also be written to localStorage.
5. Imported images receive temporary `blob:` URLs created by the browser. Those URLs point to local browser-managed bytes, not Vercel-hosted files.

The current application has no `fetch`, `XMLHttpRequest`, WebSocket, analytics, API client, or form submission path. Selecting an archive does not upload it. Network requests are limited to downloading the static application files themselves.

## Browser Storage Boundary

IndexedDB, localStorage, and sessionStorage are scoped to a web origin: scheme, hostname, and port.

These are therefore separate storage environments:

- `http://localhost:4173`
- `https://chatgpt-backup-browser.vercel.app`
- A future custom domain

Changing only the path on the same origin does not create a new storage environment. Moving the hosted application from `/app/index.html` to `/` keeps the existing Vercel-origin cache available. Moving from localhost to Vercel, changing domains, changing browser profiles, or changing devices requires importing the archive again.

Chrome and Edge can serialize a directory handle into IndexedDB. The handle may still require a user permission click when restored. Browsers without the File System Access API fall back to the folder input and require the original folder to be selected again when live files are needed.

## Hosted Security Headers

The Vercel configuration applies a restrictive Content Security Policy and related browser headers:

- Scripts and styles may load only from the same deployment origin.
- Images may additionally use `blob:` and `data:` because previews are created from local files.
- Workers may additionally use `blob:` for the local-file fallback parser path.
- Outbound connection APIs are blocked by `connect-src 'none'`.
- The app cannot be framed by another site.
- Camera, microphone, and geolocation access are disabled.
- Search engines are instructed not to index or archive the hosted utility.

The HTML does not use inline event handlers, so the policy does not need `unsafe-inline` for scripts.

## Production Verification

After deployment, verify all of the following:

1. `/` and `/conversation.html` return `200`.
2. `/styles.css`, `/app.js`, and `/conversation-parser-worker.js` return `200` with the expected content types.
3. `/src/app.ts`, `/docs/HOSTING.md`, and `/tools/typescript/package/package.json` return `404`.
4. The browser page shows the current application version and has no application console errors.
5. A small `conversations.json` import renders and opens its conversation reader.
6. A whole-folder import restores image previews and can reconnect after refresh in Chrome or Edge.
7. Conversation URLs retain their `session` and `conversation` query parameters when navigating through a compatibility redirect.

