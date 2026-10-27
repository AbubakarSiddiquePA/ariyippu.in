# Ariyippu live deployment - 23 October 2026

Website: https://ariyippu.in/
Admin: https://ariyippu.in/admin
Published migrated article: https://ariyippu.in/read/modi-article

Worker: crimson-salad-f0e5
Production version: bfd0f425-f4b6-412e-99c7-c7c684f8dd5b
Previous static version / rollback reference: 6a1143a9-7469-4d90-bcf9-8a3080fc9487
Account: 1720e1ff6abed661b435411942124b68
D1: ariyippu-articles / 71d334b3-b820-4c59-82f9-3e29fd8bbb3f
Photos: ImageKit endpoint https://ik.imagekit.io/ariyippu
R2: not enabled, no R2 binding in production

## Login

Email: abubakarsiddiqueworkdev@gmail.com
Use the password in the private .local-admin-login.txt file. Do not upload or commit credential files. ADMIN_PASSWORD_HASH and IMAGEKIT_PRIVATE_KEY are stored as Cloudflare Worker secrets. Production uses its own D1 sessions and HTTPS Secure/HttpOnly cookies. Local development and live data are separate.

## Migrated content

One saved published article (modi-article) and its photo were migrated to live D1/ImageKit. The disposable editor test draft was not migrated. The older static article and business pages remain available. New local edits do not automatically go live; use the LIVE admin to manage live articles.

## Verification completed on the real domain

- Homepage, businesses, both business pages, pricing, articles and the migrated public article: HTTP 200.
- Anonymous admin API: HTTP 401; /admin presents the login form.
- Actual owner password login succeeded. Session cookie verified Secure and HttpOnly.
- Migrated article photo delivered successfully from ImageKit via the Worker.
- New disposable private photo uploaded; private draft saved; anonymous draft and image access returned 404.
- Disposable draft and its photo permanently deleted; no test article was published.
- Logout invalidated the session; replaying the old cookie returned HTTP 401.
- No browser JavaScript errors in the verification run.
- 44 automated tests passed before final deployment.

A Cloudflare runtime incompatibility with redirect:error was corrected to redirect:manual with status checking before this final verification. See LIVE-VERIFICATION.json for the test result summary.

## Storage and maintenance

The ImageKit free plan limits still apply. Images are compressed before upload and duplicate files are reused. Shared-photo protection and deletion retries are retained. No paid ImageKit upgrade or R2 subscription was activated by this deployment. Review ImageKit usage in its dashboard as the site grows.

Back up the source project outside Windows Temp. Keep private credentials outside public/ and out of Git. The project and current deployment include only public/ website assets plus the Worker backend, not credential files.

Local preview remains on the local-only R2 emulator so deleting local test photos cannot delete live ImageKit photos. This does not activate Cloudflare R2. Production photo uploads use ImageKit.

Publication date update (23 October 2026): live version a8380883-018c-4a95-af11-d71abb93017a. Articles show weekday, day, month, year and time below the cover (or below the text introduction), in English/Malayalam and Asia/Kolkata (IST). New first-publication timestamps are set by the server and retained through edits and republishing. Existing published records use their saved timestamp, labelled Date because the exact original publication time was not separately recorded. Migration 0006 freezes that estimate without changing article content. 47 automated tests passed; live English/Malayalam mobile date display was verified.
