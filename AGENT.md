# Agent Notes

## Project

pastebin is a local-only web app in `src/`.

It uses:

- HTML
- CSS
- Vanilla JavaScript ES modules
- IndexedDB
- Browser Clipboard APIs

No frameworks, build tools, backend, or external packages should be added.

## Run

```powershell
npm run dev
```

The app is served from `src/` at `http://127.0.0.1:4173/`.

## File Map

- `src/index.html`: app shell
- `src/styles.css`: all styles
- `src/app.js`: app state and orchestration
- `src/database.js`: IndexedDB helpers
- `src/paste.js`: paste, copy, and download helpers
- `src/storage.js`: formatting and storage summaries
- `src/ui.js`: rendering and UI events

## Guidelines

- Keep the app dependency-free.
- Keep data in IndexedDB, not localStorage.
- Use localStorage only for small preferences like theme.
- Prefer small, focused functions.
- Run `node --check src\app.js` and other changed JS files after edits.
- Test paste behavior carefully so each paste saves only once.
