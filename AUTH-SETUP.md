# Ariyippu admin: email and password login

CURRENT AUTHENTICATION (23 October 2026): the editor now uses its OWN email/password login and server-side sessions. Earlier Cloudflare Access / Zero Trust instructions are superseded. No login email code is required, and the local preview no longer uses a simulated identity.

## Try it locally

Login: http://127.0.0.1:8787/admin
Email: abubakarsiddiqueworkdev@gmail.com
Temporary local password: open .local-admin-login.txt in this project folder.

That file is private, ignored by Git, and outside public/. Do NOT upload or commit it. The actual password is not embedded in HTML/JavaScript or Wrangler configuration. Only a salted PBKDF2 hash is loaded into the local server from .dev.vars.

## Choose your own password

In a terminal opened in this project folder, run:

    node set-admin-password.mjs

Enter and confirm a numbers-only password of at least 6 digits. The input is masked. This updates .dev.vars and .admin-password-hash.txt. It replaces the local temporary password. Restart npm run dev if the new local value has not been picked up. Changing the production hash will invalidate existing production sessions.

There is no public password-reset/email flow. To recover access, run this command to create a new hash and replace the live ADMIN_PASSWORD_HASH secret through your Cloudflare account.

## What happens on the live website after deployment

1. /admin displays the login form when there is no valid session.
2. Only the configured email and matching password can sign in. There is no registration or second admin account.
3. A successful login creates an eight-hour server-side session in D1. The browser gets a Secure, HttpOnly, SameSite=Strict cookie over HTTPS. Only the random session token hash is stored in D1.
4. Expired sessions lock the editor. Sign in again in another tab and click Resume to keep unsaved work.
5. Sign out sends a POST to the backend, deletes the session from D1, clears the cookie and private browser backup, and locks other open admin tabs. An old cookie no longer works. A storage/network failure is reported instead of pretending logout succeeded.
6. Repeated incorrect login attempts are limited. Different email addresses are rejected. The password and raw session tokens never appear in frontend code or localStorage.

## Production setup

No Cloudflare Access application is needed for this mode. If one was created for /admin or /api/admin, remove its protection for these paths before relying on this login, otherwise it will remain an additional front door.

1. Create/connect the D1 database, then fill database_id in wrangler.jsonc.
2. Create/connect the private R2 bucket if using photos. Review current storage allowances/billing before enabling R2.
3. Choose your password using node set-admin-password.mjs. In Cloudflare Workers & Pages > crimson-salad-f0e5 > Settings > Variables and Secrets, add a Secret named ADMIN_PASSWORD_HASH. Its value must be the complete single line from .admin-password-hash.txt. This is the salted hash, not the plain password. Keep ADMIN_EMAIL set to abubakarsiddiqueworkdev@gmail.com and AUTH_MODE=password.
4. Apply all database migrations, including 0004_password_sessions.sql:

       npx wrangler d1 migrations apply ariyippu-articles --remote

5. Check and deploy the WHOLE backend project:

       npm run check
       npm run check:production
       npm run deploy

   Uploading only public/ through the static uploader cannot enable this backend. Wrangler declares ADMIN_PASSWORD_HASH as a required secret. Keep custom domain routes as currently configured; add www to routes only if you serve it too.
6. In a private browser on https://ariyippu.in/admin, test incorrect credentials, correct credentials, saving, sign-out, cookie/session rejection after sign-out, and normal public business pages.

These steps have NOT been performed on the live account. The current local database and password are separate from live data. Never commit or upload .dev.vars, .admin-password-hash.txt, .local-admin-login.txt, node_modules or .wrangler.

## Local restart

    npm install
    npx wrangler d1 migrations apply ariyippu-articles --local --config wrangler.local.jsonc
    npm run dev

Local data uses the D1/R2 simulations on this computer; authentication is real password verification and session storage. HTTP cookies are allowed only for localhost development. Production requires HTTPS.

Verification: 41 automated tests, plus Chrome testing of actual password login, rejection of incorrect passwords, HttpOnly session cookie, server logout with replay rejection, logout-error handling, cross-tab lock and mobile layout. No live authentication deployment has been made.
