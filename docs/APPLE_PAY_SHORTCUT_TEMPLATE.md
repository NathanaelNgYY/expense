# Apple Pay Shortcut template

The PWA can generate each signed-in user's private ingest credential, but Apple requires the
Wallet **Transaction** personal automation to be created on the user's iPhone. This template keeps
that unavoidable Apple step small: users install one ready-made Shortcut, then make an automation
whose only action is **Run Shortcut**.

## Publish the template from an iPhone

1. Create a normal Shortcut named **Budget Tracker Capture**.
2. Make it accept the Wallet Transaction passed as **Shortcut Input**.
3. Add **Get Contents of URL**:
   - URL: the production `https://<project>.supabase.co/functions/v1/ingest` endpoint.
   - Method: `POST`.
   - Header: `Authorization`, with a temporary placeholder value.
   - JSON body:
     - `sourceKind`: `apple_pay`
     - `amount`: Amount from Shortcut Input
     - `merchant`: Merchant from Shortcut Input
     - `currency`: `SGD`
4. Add an import question to the Authorization header value:
   **Paste the setup value copied from Budget Tracker.**
5. Test on a physical iPhone that **Run Shortcut** receives Amount and Merchant from a Wallet
   Transaction automation. Do not publish until this passes.
6. Share the normal Shortcut through **Copy iCloud Link**.
7. Set `VITE_APPLE_PAY_SHORTCUT_URL` to that `https://www.icloud.com/shortcuts/<id>` link in
   Vercel Preview and Production, then redeploy the PWA.

The public template must contain only the placeholder. Never publish a real user's setup value,
raw ingest token, Supabase service-role key, or authenticated URL.

## User-visible flow

1. In Budget Tracker, open **Settings → Automatic Tracking → Set up Apple Pay**.
2. Confirm generation of the private setup value.
3. Tap **Copy & add Shortcut**.
4. In Apple's installer, paste the copied value when asked and add the Shortcut.
5. Create **Automation → Transaction → When I Tap**, select cards, choose
   **Run Immediately**, then add **Run Shortcut → Budget Tracker Capture** and pass the
   Transaction input.
6. After the first real purchase, return to Automatic Tracking and tap **Refresh status**.

## Why the setup value includes `Bearer`

The app copies the complete Authorization header value (`Bearer <token>`), not the raw token.
This avoids the most common setup error: missing the case-sensitive `Bearer ` prefix or its space.
The private value is held only in component state, shown once, and never appended to the public
iCloud installer URL.
