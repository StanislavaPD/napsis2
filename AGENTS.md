# Напояване ХТР Ямбол

React + Vite + Tailwind CSS app, packaged as an Electron desktop application backed by a local PostgreSQL database.

## Development Server

A Vite development server is **always running** on `$PORT` (default 8443). You don't need to start it manually.

- Hot reload: Changes to source files are reflected immediately
- `npm run electron` launches the desktop app against the built `dist/` files; `npm run app` rebuilds first
- `npm run dist` packages a Windows installer via electron-builder

## Key Files

- `src/App.tsx` - Main application component
- `src/main.tsx` - React entry point
- `src/index.css` - Global styles and Tailwind CSS import
- `package.json` - Dependencies and scripts
- `vite.config.ts` - Vite configuration
- `electron/main.cjs` - Electron main process (auth, PostgreSQL access, file saving)
- `electron/preload.cjs` - IPC bridge exposed to the renderer as `window.api`

## Styling

This project uses **Tailwind CSS v4** for styling. Use Tailwind utility classes directly in JSX. Tailwind is loaded via the Vite plugin — no PostCSS config needed.