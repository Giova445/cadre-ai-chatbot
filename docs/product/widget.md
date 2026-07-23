# Widget

An embeddable version of the Cadre AI support chatbot: a one-line `<script>` snippet a
client pastes into their marketing site or app, which renders a floating launcher bubble
and a chat panel that talks to **our** existing `/api/chat` endpoint. No Cadre code, no API
keys, and no RAG data ever ship to the client's page beyond a tiny UI bundle — the model,
the embeddings, and the guardrails all stay server-side on our Vercel deployment.

> Design ethos (inherited from [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and
> [`plan.md`](../../plan.md)): **right-sized, not over-engineered.** The widget is a thin
> DOM client over the wire protocol we already ship. It adds one real capability to the
> backend — cross-origin access control — and otherwise reuses the streaming chat pipeline
> unchanged. We do **not** add a build service, a widget CDN account, an iframe messaging
> SDK, or a per-client database to ship this.

This document is both the **architecture of record** and the **implementation plan** for the
widget. Where it and `plan.md` disagree, `plan.md` wins.

---

## Architecture

### 1. Goal and constraints

| Constraint | Consequence for the design |
|---|---|
| **No secret in the browser.** The OpenAI/OpenRouter key lives only in server env (`lib/config.ts` reads `process.env.*`). | The widget calls **our** `/api/chat`, never the LLM. Same rule as the hosted app. |
| **Runs on a third-party origin** (`acme.com`), talking to `chat.gocadre.ai`. | Every chat request is **cross-origin** → CORS is now a first-class backend concern. |
| **Must not fight the host page's CSS.** | Style isolation is mandatory → **Shadow DOM** (default) or **iframe** (strict fallback). |
| **Must not bloat the host page.** | Vanilla-DOM bundle, no React/framework, async-loaded, target < 20 KB gzipped. |
| **The wire protocol already exists** (plain-text stream + `x-cadre-*` headers). | The widget is a second client over the *same* contract as `app/page.tsx`; no protocol change. |
| **Multiple clients, cheaply.** | A tenant `client` id + a per-client **origin allowlist**. No per-client build, no DB required for Tier 0. |

### 2. Components

```
widget/                         # NEW — widget source (plain TS, esbuild → IIFE)
  src/
    index.ts                    # entry: reads data-* / window.CadreChat, boots the widget
    config.ts                   # WidgetConfig type + attribute/object parsing + defaults
    host.ts                     # creates host <div>, attachShadow, adopts stylesheet
    launcher.ts                 # bubble button + unread badge + open/close state
    panel.ts                    # chat panel: transcript, composer, chips, escalation CTA
    transport.ts                # fetch → /api/chat, read stream + x-cadre-* headers
    session.ts                  # localStorage conversationId + history (per host origin)
    styles.ts                   # scoped CSS string (system font stack, theme vars)
  README.md

public/
  widget.js                     # NEW — built bundle (stable URL clients paste)
  widget-demo.html              # NEW — local cross-origin test harness

app/
  api/chat/route.ts             # CHANGED — CORS (OPTIONS + per-origin ACAO + Expose-Headers),
                                #           optional `client` in body, origin allowlist + rate-limit hook
  embed/page.tsx                # NEW (Phase 3) — chromeless chat route for the iframe fallback

lib/
  cors.ts                       # NEW — origin allowlist resolver + client registry
  ratelimit.ts                  # NEW — rate-limit seam (no-op Tier 0, Upstash Tier 1)

components/
  Chat.tsx                      # NEW (Phase 3, optional) — chat UI extracted from app/page.tsx,
                                #   reused by the hosted page AND the /embed iframe route
```

The **hosted app** (`app/page.tsx`, React) and the **widget** (`widget/`, vanilla) are two
thin clients over one wire contract. The small duplication is deliberate: React is the right
tool for our own first-party page, and a zero-dependency vanilla bundle is the right tool for
code that runs on someone else's page. The shared, frozen thing is the **protocol**, not the
component.

### 3. Delivery: `<script>` loader (recommended) vs `<iframe>`

We **recommend the script-tag loader with Shadow DOM** as the default and ship the **iframe**
as a strict-isolation fallback.

**The one-line snippet a client pastes** (before `</body>`):

```html
<script src="https://chat.gocadre.ai/widget.js" data-client="acme" async></script>
```

That is the entire integration. The script:

1. Finds its own tag via `document.currentScript` and reads its `data-*` attributes.
2. Appends a single host `<div>` to `document.body` and calls `attachShadow({ mode: "open" })`.
3. Adopts a constructable stylesheet + renders the launcher bubble into the shadow root.
4. On **first open**, mounts the panel and (optionally) lazy-fetches the heavier panel code.
5. Wires the composer to `fetch("https://chat.gocadre.ai/api/chat")`, streaming the reply.

Loading a cross-origin `<script>` needs **no CORS** — scripts are allowed cross-origin by
default. Only the later `fetch` to `/api/chat` is a CORS-governed request.

**Why the loader over the iframe (default choice):**

| Dimension | Script + Shadow DOM (recommended) | `<iframe>` |
|---|---|---|
| **Launcher sizing** | We fully control a floating bubble; it can be small when closed, large when open, and animate. | An iframe can't auto-size to its content; the host must reserve a fixed box, or we need a postMessage resize protocol. |
| **Integration effort for client** | One `<script>` line. | An `<iframe>` element + CSS to position/size it, or a script that injects the iframe anyway. |
| **Style isolation** | Strong (Shadow DOM: host CSS can't bleed in, our CSS can't leak out). | Strongest (separate document). |
| **JS/global isolation** | Partial — shares the host's JS realm and globals. | Full — separate realm, separate CSP. |
| **Parent ↔ widget comms** | Direct DOM/function calls; trivial. | Requires a `postMessage` bridge (open/close, unread, resize) — effectively a mini SDK. |
| **Performance** | Runs in the host document, one bundle, no nested navigation. | Extra document load + navigation. |
| **Host CSP friction** | Needs `script-src`/`connect-src` for our origin. | Needs `frame-src`/`child-src` for our origin. |

Shadow DOM gives us "isolated enough" styling with full programmatic control and a bubble we
can size and animate — which is exactly the interaction model users expect from a support
launcher. Style isolation via Shadow DOM is the well-established modern approach for
third-party embeds ([Courier](https://www.courier.com/blog/how-to-use-the-shadow-dom-to-isolate-styles-on-a-dom-that-isnt-yours),
[dev.to](https://dev.to/smy/shadow-dom-the-ultimate-solution-for-embedding-third-party-html-without-css-conflicts-1g2g)).

**When to reach for the iframe fallback instead:**

- The client's CSP is hostile to injected styles/scripts and they'd rather allow a `frame-src`.
- The client demands hard sandboxing (no shared JS realm, no chance our code touches theirs).
- A page with pathological global CSS (e.g. `* { all: revert }` shenanigans) or aggressive
  z-index/stacking that even Shadow DOM positioning can't win.

In the fallback, the launcher bubble is still a tiny script-injected element, but clicking it
reveals an `<iframe src="https://chat.gocadre.ai/embed?client=acme">` (route `app/embed`,
below), and a minimal `postMessage` bridge carries `open`/`close`/`unread`/`resize`. Same wire
protocol, same backend.

### 4. Isolation: Shadow DOM details and tradeoffs

- **Open shadow root.** `mode: "open"` keeps DevTools and our own debugging working. `"closed"`
  buys almost nothing against a hostile *host* (the host can monkeypatch `attachShadow` before
  we run) and costs us debuggability — so we use `open`. Nothing sensitive lives in the DOM; the
  secret is server-side, so host reach-in is not a confidentiality risk.
- **Styles via adopted stylesheet, not inline `<style>`.** We build a `CSSStyleSheet`, call
  `sheet.replaceSync(css)`, and assign `shadowRoot.adoptedStyleSheets = [sheet]`. This is
  **CSP-friendly**: it is not a `<style>` element or a `style=""` attribute, so it does not
  require the host to allow `style-src 'unsafe-inline'`. We fall back to injecting a `<style>`
  node only if `adoptedStyleSheets` is unavailable (very old browsers).
- **`:host` for the container**, all internal selectors scoped inside the shadow root. Reset
  inherited properties at the boundary (`:host { all: initial }` then re-declare) so the host's
  cascade can't leak `font`, `line-height`, `color`, `box-sizing`, etc.
- **Fonts:** system font stack (`-apple-system, Segoe UI, Roboto, …`). We do **not** load a
  web font — that would be an external request the host CSP might block, and a data-URI font
  would bloat the bundle. Right-sized.
- **What Shadow DOM does NOT do:** it does not sandbox JavaScript, does not isolate globals,
  and does not stop a determined host page from reading our open shadow root. Accepted — see
  above. It also does not by itself guarantee we sit above the host UI; we set the host `<div>`
  to `position: fixed; z-index: 2147483000` and a fixed corner offset.

### 5. Config and theming

Two ways to configure, both optional except `client`:

**(a) `data-*` attributes** (declarative, the common case):

```html
<script
  src="https://chat.gocadre.ai/widget.js"
  data-client="acme"
  data-color="#0B5FFF"
  data-position="bottom-right"
  data-greeting="Hi! Ask me anything about Cadre AI."
  data-launcher-label="Chat with us"
  async
></script>
```

**(b) `window.CadreChat` config object** (for values computed at runtime, e.g. a logged-in
user's locale). Set it **before** the loader tag; the loader merges it over the data-attrs:

```html
<script>window.CadreChat = { client: "acme", color: "#0B5FFF", position: "bottom-left" };</script>
<script src="https://chat.gocadre.ai/widget.js" async></script>
```

Frozen config interface:

```ts
// widget/src/config.ts
export type WidgetConfig = {
  client: string;                         // REQUIRED — tenant id (logging + origin allowlist)
  apiBase: string;                        // default: the origin widget.js was served from
  color: string;                          // brand accent; default Cadre blue
  position: "bottom-right" | "bottom-left";
  greeting: string;
  launcherLabel: string;
  theme: "auto" | "light" | "dark";       // default "auto" → prefers-color-scheme
};
```

Precedence: `window.CadreChat` › `data-*` › built-in defaults. `apiBase` defaults to the
origin the script was loaded from (derived from `document.currentScript.src`), so clients never
have to configure a URL, and staging vs prod "just works".

**How the client id reaches the API.** The widget sends it **in the request body**, not as a
header — the body is already JSON (so a preflight already happens regardless), and putting it
in the body means it is validated by the same Zod schema and requires no `Allow-Headers`
change. The `client` id is used for **logging and tenant routing** (Tier 1 admin), *not* for
security. Security is enforced on the **`Origin`** header, which the browser sets and page JS
cannot forge — see §7.

### 6. Transport and data flow

The widget reuses the **exact** consumption logic already proven in `app/page.tsx`: POST
`{ messages, client }`, read the streamed `text/plain` body with a `ReadableStream` reader +
`TextDecoder`, and read the `x-cadre-*` metadata headers to drive the escalation UI.

```mermaid
sequenceDiagram
    participant U as User on acme.com
    participant W as widget.js (Shadow DOM)
    participant E as Vercel Edge / CDN
    participant R as /api/chat (nodejs)
    participant K as RAG pipeline (retrieve → guardrail → streamText)

    Note over W: <script data-client="acme"> loads (no CORS on script)
    U->>W: click bubble, type question
    W->>R: OPTIONS /api/chat (preflight: JSON body)
    R-->>W: 204 + Allow-Origin: acme.com, Allow-Methods, Allow-Headers, Max-Age
    W->>R: POST {messages, client:"acme"}  (Origin: https://acme.com)
    R->>R: CORS: Origin in allowlist? → reflect ACAO + Vary:Origin
    R->>R: rate-limit(client, ip)  [Tier 1: Upstash]
    R->>K: retrieveText → decide → (answer? streamText : deterministic text)
    K-->>R: text stream + {mode, reason, sources, topScore}
    R-->>W: 200 stream + x-cadre-* headers + Access-Control-Expose-Headers
    W->>U: render streamed answer; if mode∈{refuse,escalate} show CTA
    W->>W: persist conversation to localStorage (per acme.com origin)
```

ASCII view of the same flow:

```
 acme.com page                         chat.gocadre.ai (Vercel)
 ┌────────────────────┐   fetch(POST)  ┌──────────────────────────────┐
 │ Shadow DOM widget  │ ─────────────► │ /api/chat                    │
 │  • launcher bubble │  Origin hdr    │  1. CORS gate (allowlist)    │
 │  • panel + stream  │ ◄───────────── │  2. rate-limit hook          │
 │  • localStorage    │  text/plain    │  3. retrieveText (cosine)    │
 │    session/convId  │  + x-cadre-*   │  4. guardrail decide()       │
 └────────────────────┘  (Expose-Hdrs) │  5. streamText | stub | CTA  │
        no key ever                    │     key stays server-side    │
                                       └──────────────────────────────┘
```

The metadata contract is unchanged from the hosted app:

| Header | Meaning | Widget use |
|---|---|---|
| `x-cadre-mode` | `answer` \| `refuse` \| `escalate` | escalation styling + CTA |
| `x-cadre-reason` | e.g. `weak_retrieval`, `grounded_offline` | debug / Tier 1 trace |
| `x-cadre-sources` | JSON array of KB filenames | "Sources:" pills |
| `x-cadre-topscore` | top cosine score | Tier 1 trace |

**Critical backend change:** cross-origin JS can only read these headers if the response
carries `Access-Control-Expose-Headers` listing them. Same-origin (`app/page.tsx`) works today
without it; the widget will silently see `null` for every `x-cadre-*` header until we add it.
This is the single most important, easily-missed correctness fix (see §9 and Phase 0).

### 7. Security

1. **No secret exposure.** Keys are server-only env (`lib/config.ts`). The widget bundle
   contains only the public API URL and the client id. The LLM is never called from the browser.
   Verified against current code: `getChatModel()` / `realEmbeddingProvider()` read
   `process.env.*` inside route handlers only.

2. **Origin allowlist — the real access control.** CORS is **browser-enforced**: it stops
   other sites' JavaScript from *reading* our response, but it does **not** stop a server-side
   or `curl` caller from *executing* the request (and burning LLM budget). Therefore the route
   does two things:
   - **CORS**: reflect the request `Origin` in `Access-Control-Allow-Origin` **only** if it is
     in the allowlist, and set `Vary: Origin`. `ACAO` cannot be a list, so we echo the single
     matched origin. Never `*` (a wildcard lets any site embed us — the explicit anti-pattern
     called out for CORS on sensitive APIs;
     [LogRocket](https://blog.logrocket.com/using-cors-next-js-handle-cross-origin-requests/)).
   - **Hard short-circuit**: if `Origin` is present and **not** allowed, return `403` *before*
     retrieval or the model runs, so a disallowed browser embed costs us nothing. Requests with
     no `Origin` (same-origin app, server-to-server, curl) skip CORS but are still subject to
     rate limiting. Note the `Origin` header is trustworthy from *browsers* but forgeable by
     non-browser clients — so origin allowlisting is paired with rate limiting, and a signed
     per-client token is documented as future hardening (§10, out of scope for Tier 0/1).

3. **Rate-limiting hook.** A seam (`lib/ratelimit.ts`) called per `(client, ip)` at the top of
   the route. On serverless, an in-memory limiter is per-instance and effectively useless, so
   Tier 0 ships a **no-op** with the seam in place, and Tier 1 backs it with the **Upstash
   Redis** sliding-window limiter already justified in `plan.md` (the one sanctioned external
   service). This keeps a runaway or abusive embed from draining spend.

4. **CSP on the host site.** Document for clients:
   - Shadow-DOM widget: allow `script-src https://chat.gocadre.ai` and
     `connect-src https://chat.gocadre.ai`. Because we use **adopted stylesheets** (not inline
     `<style>`), the widget does **not** require `style-src 'unsafe-inline'`.
   - iframe fallback: allow `frame-src https://chat.gocadre.ai` (or `child-src`) instead of
     `script-src`; styles live in our document so host `style-src` is irrelevant.
   - We do not load web fonts or remote images (SVG is inlined), so no `font-src`/`img-src`
     additions are needed.

5. **Input bounds already enforced.** The Zod schema (`messages` ≤ 40, each `content` ≤ 4000
   chars) is untouched; we add only an optional `client: z.string().max(64)`.

6. **No SRI on the loader URL.** Subresource Integrity would pin a hash, but the loader URL is
   intentionally mutable so we can ship fixes without clients editing their snippet. We instead
   offer optionally **version-pinned** immutable bundles (`widget.v1.js`) for clients who want
   SRI. (§8.)

### 8. Build and hosting

- **Bundle:** the widget is plain TypeScript compiled by **esbuild** to a single minified IIFE.
  No React (saves ~40 KB), no runtime deps. `crypto.randomUUID()` gives us conversation ids
  with zero dependencies.

  ```bash
  esbuild widget/src/index.ts --bundle --minify --format=iife \
    --target=es2020 --outfile=public/widget.js
  ```

  Target < 20 KB gzipped. If it grows, split a tiny loader (`widget.js`) from a lazy panel
  chunk fetched on first open — but at this UI's size a single async bundle is simpler and
  preferred (right-sized).

- **Hosting:** serve straight from `public/` on the **same Vercel deployment** as the app, so
  the widget's origin equals the API origin and `apiBase` auto-derives. No separate CDN account,
  no build service. Vercel's Edge Network caches static assets globally after first request
  ([Vercel caching](https://vercel.com/docs/edge-network/caching)).

- **Cache + versioning:** clients paste a **stable** URL (`/widget.js`) once, so the entry must
  stay reasonably fresh to let us push fixes. Set a short-ish edge cache with revalidation via
  `next.config.mjs` `headers()`:

  ```js
  // next.config.mjs — add to nextConfig
  async headers() {
    return [{
      source: "/widget.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
        { key: "Content-Type", value: "text/javascript; charset=utf-8" },
      ],
    }, {
      source: "/widget.:ver(v[0-9]+).js",           // immutable, version-pinned builds
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  }
  ```

  For **breaking** changes we publish a new pinned file (`widget.v2.js`) and migrate clients;
  `widget.js` always points at the current stable major. Content-hashed/immutable assets are the
  standard year-long-cache pattern on Vercel; the stable loader deliberately opts for a short TTL
  instead ([Vercel](https://vercel.com/docs/edge-network/caching)).

### 9. How this changes the current app

Minimal and surgical. The streaming protocol, RAG pipeline, prompt, guardrails, and hosted UI
are **unchanged**.

1. **`app/api/chat/route.ts`** (the one meaningful change):
   - Export an `OPTIONS` handler for the preflight (JSON `Content-Type` always triggers one;
     [Wisp](https://www.wisp.blog/blog/handling-common-cors-errors-in-nextjs-15)).
   - Compute CORS headers from `lib/cors.ts` and attach them to **every** response, including
     the 400/403 and the stub/escalation paths.
   - Add **`Access-Control-Expose-Headers: x-cadre-mode, x-cadre-reason, x-cadre-sources,
     x-cadre-topscore`** and `Vary: Origin` — without Expose-Headers the widget can't read the
     metadata cross-origin.
   - 403 short-circuit when `Origin` is present and disallowed (before retrieval/model).
   - Call the rate-limit hook.
   - Extend `BodySchema` with `client: z.string().min(1).max(64).optional()`.

   Sketch (only the added seams shown):

   ```ts
   import { corsHeaders, isOriginAllowed } from "@/lib/cors";
   import { checkRateLimit } from "@/lib/ratelimit";

   export async function OPTIONS(req: Request) {
     return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
   }

   export async function POST(req: Request) {
     const origin = req.headers.get("origin");
     if (origin && !isOriginAllowed(origin)) {
       return new Response("Origin not allowed.", { status: 403, headers: corsHeaders(origin) });
     }
     // ... rate-limit hook, then existing logic; merge corsHeaders(origin) into metaHeaders()
   }
   ```

   `metaHeaders()` merges `...corsHeaders(origin)` and adds `Access-Control-Expose-Headers`.

2. **`lib/cors.ts`** (NEW): the allowlist + resolver. Right-sized and env-driven so adding a
   client is a config change, not a deploy of code:

   ```ts
   // Union allowlist from env; optional per-client map for Tier 1 tenant routing.
   const ALLOWED = (process.env.WIDGET_ALLOWED_ORIGINS ?? "")
     .split(",").map((s) => s.trim()).filter(Boolean);

   export function isOriginAllowed(origin: string): boolean {
     return ALLOWED.includes(origin);           // exact-match; wildcard subdomains optional later
   }
   export function corsHeaders(origin: string | null): Record<string, string> {
     const h: Record<string, string> = { Vary: "Origin" };
     if (origin && isOriginAllowed(origin)) {
       h["Access-Control-Allow-Origin"] = origin;            // echo single matched origin, never *
       h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
       h["Access-Control-Allow-Headers"] = "Content-Type";
       h["Access-Control-Max-Age"] = "86400";
       h["Access-Control-Expose-Headers"] =
         "x-cadre-mode, x-cadre-reason, x-cadre-sources, x-cadre-topscore";
     }
     return h;
   }
   ```

3. **`lib/ratelimit.ts`** (NEW): `checkRateLimit(client, ip)` → no-op in Tier 0, Upstash in
   Tier 1. Keeps the route's shape stable across tiers.

4. **`widget/` + `public/widget.js` + `public/widget-demo.html`** (NEW): the widget itself.

5. **`next.config.mjs`**: add the `headers()` block from §8.

6. **`package.json`**: `"build:widget": "esbuild …"`, add `esbuild` dev dep, and chain it into
   `prebuild` (which already runs `scripts/embed.ts`) so `pnpm build` emits both the RAG artifact
   and `public/widget.js`.

7. **(Phase 3, optional) `app/embed/page.tsx` + `components/Chat.tsx`**: extract the chat UI
   from `app/page.tsx` into a shared component; `app/page.tsx` renders it with full chrome, the
   `/embed` route renders it chromeless for the iframe fallback. Skip if the Shadow-DOM widget
   covers all pilots.

### 10. Rejected alternatives and tradeoffs

| Option | Verdict | Why |
|---|---|---|
| **iframe as the default** | Rejected (kept as fallback) | Can't auto-size the launcher; forces a postMessage SDK; heavier. Shadow DOM gives the launcher UX we want with strong-enough style isolation. |
| **Bundle React into the widget** | Rejected | ~40 KB+ for a page we don't own. Vanilla DOM keeps it < 20 KB. React is retained only for our own `/embed` route (Phase 3), where it's already loaded. |
| **Call the LLM from the browser** | Rejected (hard rule) | Would expose the key. All model calls stay behind `/api/chat`. |
| **`Access-Control-Allow-Origin: *`** | Rejected | Lets any site embed and drain LLM spend; standard CORS anti-pattern for sensitive endpoints. Per-origin echo + allowlist instead. |
| **Per-client build / per-client subdomain** | Rejected | Over-engineered at this scale. One bundle + a `client` param + an env allowlist covers many tenants. |
| **Signed per-client token (JWT/HMAC) now** | Deferred | Origin allowlist + rate limit is right-sized for Tier 0/1. Tokens are the documented next hardening step if abuse appears. |
| **Vector DB / new infra for the widget** | Rejected | The widget changes the *transport surface*, not retrieval. RAG stays in-memory cosine over the bundled artifact. |
| **Closed shadow root** | Rejected | No real security gain against a hostile host; costs debuggability. Open root. |
| **Inline `<style>` in the shadow root** | Rejected | Would push CSP burden (`style-src 'unsafe-inline'`) onto clients. Adopted stylesheets avoid it. |
| **SRI on the loader URL** | Rejected for the stable URL | Breaks silent updates. Offered on version-pinned immutable bundles instead. |

---

## Implementation Plan

Phased so **Phase 0 alone unblocks any cross-origin client** (even a hand-written fetch), and
each later phase ships an independently demoable slice. Effort is rough solo-dev calendar time.

### Phase 0 — Backend cross-origin support (½ day) — *do first, ship first*

The only backend work; everything else is client-side.

- [ ] `lib/cors.ts`: allowlist resolver (`isOriginAllowed`, `corsHeaders`).
- [ ] `lib/ratelimit.ts`: `checkRateLimit()` no-op seam.
- [ ] `app/api/chat/route.ts`: `OPTIONS` handler; merge `corsHeaders(origin)` into every
      response; add `Access-Control-Expose-Headers` + `Vary: Origin`; 403 short-circuit for
      disallowed origins; call rate-limit hook; add optional `client` to `BodySchema`.
- [ ] `.env.example`: document `WIDGET_ALLOWED_ORIGINS` (comma-separated).
- **Tests (Vitest, extends `tests/`):** `OPTIONS` returns 204 with ACAO for an allowed origin
  and no ACAO for a disallowed one; `POST` from a disallowed origin → 403 before model; allowed
  origin response carries Expose-Headers; body with/without `client` both parse.
- **Exit:** `curl -H "Origin: https://allowed.example" …` shows correct headers; a disallowed
  origin gets 403. The hosted app is unaffected (no `Origin` on same-origin requests).

### Phase 1 — Vanilla widget MVP (1.5–2 days)

- [ ] `widget/src/`: `config.ts` (parse `data-*` + `window.CadreChat` + defaults),
      `host.ts` (host div + open shadow root + adopted stylesheet), `styles.ts` (scoped CSS,
      system fonts, theme vars), `launcher.ts` (bubble + open/close), `panel.ts` (transcript +
      composer + scenario chips + escalation CTA, mirroring `app/page.tsx`), `transport.ts`
      (POST + stream reader + `x-cadre-*` parsing), `session.ts` (localStorage convId + history),
      `index.ts` (boot).
- [ ] `package.json`: `esbuild` dev dep + `build:widget` script; chain into `prebuild`.
- [ ] `public/widget-demo.html`: a fake "host page" served on a **different** port/origin to
      exercise real cross-origin + CORS locally.
- **Deps:** `esbuild` (dev) only. No runtime deps.
- **Exit:** paste the snippet into the demo page on another origin → bubble appears, panel opens,
  a question streams a grounded answer, sources pills render, escalation shows the CTA, refresh
  restores the conversation.

### Phase 2 — Theming, config, mobile, a11y, unread (1 day)

- [ ] Apply `color`/`position`/`greeting`/`launcherLabel`/`theme` from config to CSS vars.
- [ ] Mobile: full-screen panel under ~480px (`position: fixed; inset: 0`), safe-area insets,
      lock host body scroll while open, larger tap targets.
- [ ] a11y: focus trap in the open panel, `Esc` to close, `aria-live="polite"` transcript,
      `prefers-reduced-motion`, `prefers-color-scheme` when `theme:"auto"`.
- [ ] Unread badge: increment when a proactive greeting / completed answer lands while closed.
- **Exit:** widget looks correct on light/dark host pages, is keyboard-usable, and is usable on
  a phone viewport.

### Phase 3 — iframe fallback (0.5–1 day, optional)

- [ ] Extract `components/Chat.tsx` from `app/page.tsx`; render it in both `app/page.tsx` and a
      new chromeless `app/embed/page.tsx` (reads `?client=`).
- [ ] Add a `data-mode="iframe"` branch to the loader: inject the bubble + an `<iframe>` to
      `/embed`, with a minimal `postMessage` bridge (`open`/`close`/`unread`/`resize`).
- [ ] Document the CSP delta (`frame-src` instead of `script-src`).
- **Exit:** a client that blocks injected scripts can embed via the iframe path with the same UX.

### Phase 4 — Security hardening + rollout (0.5 day, ties to Tier 1)

- [ ] Back `checkRateLimit()` with the Upstash sliding window (same instance Tier 1 uses for
      logs), keyed on `(client, ip)`.
- [ ] Tier 1 admin: tag logged conversations with `client` + `origin` so embeds are auditable
      alongside the existing retrieval trace.
- [ ] Publish version-pinned `widget.v1.js` (immutable cache) for SRI-conscious clients.
- [ ] Client-facing snippet + CSP docs (this file's §5/§7 distilled into a short integration page).
- **Rollout:** internal `widget-demo.html` → add one pilot client's origin to
  `WIDGET_ALLOWED_ORIGINS` → verify in Tier 1 admin → GA. Roll back by removing the origin from
  the allowlist (instant, no redeploy of the widget) or reverting `widget.js`.

### Testing summary

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | config precedence/parsing; `isOriginAllowed`/`corsHeaders`; session (de)serialize; stream+header parsing. |
| Integration | Vitest | `/api/chat` OPTIONS preflight; per-origin ACAO; Expose-Headers present; 403 for disallowed origin; `client` field. |
| E2E | Playwright | load `widget.js` on a **different-origin** host page, open, send, stream, sources, escalation CTA, localStorage persistence across reload, mobile viewport, Esc/focus-trap. |
| Manual | — | Shadow-DOM style isolation against a hostile-CSS host page; light/dark; iframe fallback. |

Meets the project's ≥80% coverage bar via Phase 0/1 unit + integration; Playwright covers the
critical cross-origin user flow.

### Sequencing and effort

```
Phase 0 (backend CORS)  ─┐  ½d   ← ship first; unblocks everything
Phase 1 (widget MVP)     ┘  2d
Phase 2 (theme/mobile/a11y) 1d
Phase 3 (iframe fallback)   1d   (optional / on-demand)
Phase 4 (hardening+rollout) ½d   (couples to Tier 1 Upstash)
                        ────────
                        ~4–5 days total; Tier-0-useful after Phase 1.
```

---

### Sources

- Shadow DOM for third-party embeds / style isolation:
  [Courier](https://www.courier.com/blog/how-to-use-the-shadow-dom-to-isolate-styles-on-a-dom-that-isnt-yours),
  [dev.to (Shadow DOM for embedding without CSS conflicts)](https://dev.to/smy/shadow-dom-the-ultimate-solution-for-embedding-third-party-html-without-css-conflicts-1g2g).
- CORS in Next.js (per-origin allowlist, avoid `*`, preflight):
  [LogRocket](https://blog.logrocket.com/using-cors-next-js-handle-cross-origin-requests/),
  [Wisp — Next.js 15 CORS](https://www.wisp.blog/blog/handling-common-cors-errors-in-nextjs-15).
- Vercel static-asset caching / immutable + versioned filenames:
  [Vercel Edge Network caching](https://vercel.com/docs/edge-network/caching),
  [Vercel CDN cache](https://vercel.com/docs/caching/cdn-cache).
