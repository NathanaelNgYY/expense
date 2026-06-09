# Budget Tracker

Personal iPhone-friendly budget tracker built as a React + Vite PWA. It stores data in `localStorage`, tracks a S$1,200 monthly budget, and supports a shortcut URL that opens straight to the add-entry screen.

## Running Locally

```bash
npm install
npm run dev
```

The dev server normally opens at `http://localhost:5173`.

## Running Tests

```bash
npm test
```

## Production Build

```bash
npm run build
npm run preview
```

The preview server normally opens at `http://localhost:4173`.

## Deploying

1. Run `npm run build`.
2. Drag the generated `dist/` folder into Netlify's deploy drop zone, or connect the repo to Netlify/GitHub Pages.
3. Use the deployed HTTPS URL as the app URL.

## iOS Install

1. Open the deployed app URL in Safari on iPhone.
2. Tap Share.
3. Tap Add to Home Screen.
4. Name it `Budget`.
5. Launch it from the home screen to use the standalone PWA.

## iOS Shortcut

1. Open the Shortcuts app.
2. Create a new shortcut with the Open URLs action.
3. Use your deployed URL with `?add=true`, for example:

```text
https://your-site.netlify.app?add=true
```

4. Rename the shortcut to `Log Expense`.
5. Add it to the home screen.

## Apple Pay Auto-Logging

iOS does not let this PWA read Apple Pay, Wallet, FairPrice, or other apps' notifications directly. Use a Shortcuts Wallet Transaction automation instead.

1. Open the Shortcuts app on iPhone.
2. Tap Automation, then tap +.
3. Choose Transaction.
4. Choose the Wallet card you use with Apple Pay.
5. Choose Run Immediately if iOS offers that option.
6. Add the Open URL action.
7. Use your deployed app URL with these query parameters:

```text
https://your-site.netlify.app/?auto=applepay&amount=<Shortcut Input: Amount>&merchant=<Shortcut Input: Merchant>&name=<Shortcut Input: Name>
```

When filling each field in Shortcuts, insert the Shortcut Input variable, tap it, then choose the matching transaction field such as Amount, Merchant, or Name.

When the automation runs, the app saves the expense immediately, guesses a category from the merchant, and shows the entry in History where it can be edited.

## Budget Defaults

| Bucket | Monthly |
| --- | ---: |
| Lunch | S$264 |
| Transport | S$50 |
| Savings | S$400 |
| Investments | S$250 |
| Buffer | S$236 |

## Data Notes

All entries and budget settings live in browser `localStorage`. The Settings screen can export entries as CSV and reset the current month's entries.
