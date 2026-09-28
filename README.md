<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9d0c17fe-c7f5-4200-b60a-11d8f078a252

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Sharing a ledger with a farm partner

The ledger lives in one Google Sheet. To bring a partner in:

1. In Google Sheets, share the sheet with their Google account as **Editor**.
   Viewer access is enough to load the ledger but every save will fail to
   sync, so it has to be Editor.
2. They sign in to the app with that same account and are asked how to set
   up: **Browse my Google Drive**, paste the link, or start a fresh ledger.

### Why they have to choose at all

The app holds the `drive.file` OAuth scope, which shows it only the files it
created itself. A sheet created by *someone else* is readable and writable by
id — that part uses the broader `spreadsheets` scope — but it can never be
found by searching Drive. So a partner's ledger is reachable, just not
discoverable.

Picking the sheet through **Browse my Google Drive** fixes that permanently:
Google records a per-file grant for this app against that user, so from then
on the ordinary Drive search finds it, on that device and every later one.
Pasting the link works too but grants nothing, so a second device asks again.

### Enabling the Drive file chooser

The chooser reads its two settings from `firebase-applet-config.json` —
`apiKey`, and `messagingSenderId`, which is the Cloud project number Picker
needs as its app id. No extra configuration, but the project must allow it:

1. In the Google Cloud console for this project, enable the **Google Picker
   API**.
2. If the API key has API restrictions, add the Google Picker API to its
   allowed list.

If either is missing the button is hidden (or reports the failure) and
pasting a link keeps working — the chooser is an enhancement, never a
requirement.
