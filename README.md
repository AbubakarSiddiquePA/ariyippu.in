> LIVE DEPLOYED: https://ariyippu.in/admin on 23 October 2026. Uses email/password login, D1 and ImageKit. R2 is not activated. See LIVE-DEPLOYMENT.md for verification and current deployment details. Earlier statements below saying not yet deployed are historical and superseded.

# Ariyippu website and article admin

Project folder: C:\Users\rahiman\AppData\Local\Temp\ariyippu-admin-project

The current project uses a simple EMAIL + PASSWORD admin login. No Cloudflare Zero Trust or email code is needed. See AUTH-SETUP.md for the current login, password setup and deployment instructions. This replaces the earlier Access/simulated-login setup.

## Local admin

http://127.0.0.1:8787/admin

Email: abubakarsiddiqueworkdev@gmail.com
Temporary local password: open .local-admin-login.txt (private; do not commit/upload).

Choose your own password from this folder:

    node set-admin-password.mjs

Only a salted password hash goes in the backend secret ADMIN_PASSWORD_HASH. Passwords are not placed in website code. Sign out removes the actual D1 session and cookie, clears the browser backup and locks other tabs. Sessions expire after eight hours. Repeated incorrect attempts are limited.

## Editor features

- Start in English OR Malayalam. Headings, subtitles, descriptions, captions and ordered paragraph/heading/table blocks.
- Instant desktop/mobile preview. On mobile use the fixed Edit / Preview switch, preserving text and scroll position.
- Automatic English/Malayalam translation when choosing the other preview language; editable output, undo, source-change detection and protection for manually edited wording. MyMemory is the default external provider and has a free daily quota. Requested text is sent to that service. Review translations before publishing.
- Browser recovery backup, article search, word count and reading time.
- Draft, publish, update, return to draft and permanent deletion of both language versions.
- Optional cover photo; intentional text-only layout if omitted. Browser resize to maximum 1600px, WebP compression aiming for 500 KB or less, and server-side duplicate detection.
- Remove from this article retains the file until saved; Delete photo from storage permanently detaches and removes the file if no other saved article uses it.
- Deleting an article removes its unused current cover. Shared images are protected. Storage failures are queued with a Retry cleanup control. No age-based automatic cleanup is enabled.
- Published database articles appear on /articles and /read/your-slug. Existing static pages, including the earlier manually written article, are retained and not automatically imported into the editor.

## Project layout

public/                 website files and editor assets
worker.mjs              authenticated API and public article routes
password-auth.mjs       password verification and server-side sessions
deletion.mjs             article/photo deletion helpers
translation.mjs         translation provider and caching
migrations/             D1 schema migrations, including password sessions
wrangler.jsonc          production configuration (D1 ID still needs replacing)
wrangler.local.jsonc    local resources; ignored by Git
AUTH-SETUP.md           CURRENT password-login deployment guide

## Restart locally

    npm install
    npx wrangler d1 migrations apply ariyippu-articles --local --config wrangler.local.jsonc
    npm run dev

Local backend binds to 127.0.0.1:8787. It uses a local D1 database and local R2 photo storage. Login now uses real password/session verification even in the local preview.

## Going live

Read AUTH-SETUP.md. Connect the live D1 database, private R2 bucket, and ADMIN_PASSWORD_HASH Cloudflare Secret; apply every migration; then deploy the backend plus public assets. Uploading HTML alone does not deploy an authenticated CMS. Nothing has been deployed live yet.

Never publish or commit .dev.vars, .local-admin-login.txt, .admin-password-hash.txt, node_modules, .wrangler or the local preview config. The credential files are ignored and live outside public/. Do not keep your only source copy under Temp; copy this project to a permanent folder when ready.

## Checks

    npm run check
    npm run check:production

41 automated tests passed, including real SQL deletion/session checks, wrong credentials, cookie attributes, session expiry, logout replay, password-change invalidation and login throttling. Chrome checks passed for actual password login/logout, cross-tab logout, mobile login layout, preview editing, translation, uploads and article deletion. Earlier browser test scripts written for simulated login need an authenticated session before running against the new password setup.

## Storage planning

Article text is in D1. Uploaded photos are in PRIVATE R2, separate from static website file counts. No cover means no photo storage. As checked 23 October 2026, R2 Standard includes 10 GB-month storage plus operation allowances; usage above free allowances can be charged. Monitor the actual account usage and review unreferenced uploads periodically. Automatic cleanup of unrelated old uploads is not enabled.

References:
https://developers.cloudflare.com/r2/pricing/
https://mymemory.translated.net/doc/usagelimits.php
https://developers.cloudflare.com/workers/configuration/secrets/

## Current photo provider: ImageKit (integration prepared, credentials pending)

Sign up at https://imagekit.io/registration/ and choose the Forever Free complete media processing plan. The production config now targets ImageKit rather than R2; R2 activation is not needed. The existing local R2 emulator is retained until ImageKit credentials are configured, so old local previews still work.

From this folder run:

    node setup-imagekit.mjs

Paste the URL endpoint and private key into that local terminal. The private key input is masked. It writes .dev.vars and .imagekit-private-key.txt (both private and ignored), updates the URL endpoint configuration, and never sends the secret to chat or frontend code. No public API key is needed because uploads are proxied through the authenticated backend.

Apply migration 0005_imagekit_assets.sql locally and remotely before switching the live backend. Store IMAGEKIT_PRIVATE_KEY as a Cloudflare Worker secret, just as ADMIN_PASSWORD_HASH was stored. Uploads remain private on ImageKit and are served through the existing /media/ route after the backend checks article visibility; draft previews remain authenticated. ImageKit private-delivery signatures are short-lived and generated on the backend. Stored ImageKit file IDs allow permanent deletion, with shared-photo protection and retries retained.

One existing published article and photo have already been prepared for migration: the article is in live D1; the photo still needs to be uploaded to ImageKit and its metadata copied to media_assets before live deployment. Do not deploy before this migration, or the cover will be missing. No ImageKit upload, real provider credential test, or CMS deployment has been performed yet. 44 automated tests passed, including mocked upload/delete and provider signature checks. Real ImageKit account verification remains pending.
