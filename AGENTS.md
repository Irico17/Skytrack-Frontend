# AGENTS.md

## Project
SKYTRACK (static React SPA). No tests, lint, or CI configured.

## Commands
```
npm i          # install (no lockfile committed)
npm run dev    # start Vite dev server
npm run build  # production build
```

## Architecture
- **Entry:** `src/main.tsx` → `src/app/App.tsx`
- **State:** `src/app/hooks/useSimulation.ts` — all simulation state + mock data
- **Data:** `src/app/data/mockData.ts` — airports, flights, shipments, events
- **Components:** `src/app/components/` — top-level panels + `ui/` (shadcn-style) + `figma/`
- **Styles:** `src/styles/index.css` imports `fonts.css`, `tailwind.css`, `theme.css`

## Toolchain quirks
- **Tailwind v4** via `@tailwindcss/vite` plugin — uses `@source` directive in `tailwind.css`, NOT `content` config. Do not add a `content` array.
- **`@` alias** → `./src` (configured in `vite.config.ts`)
- **`figma:asset/`** imports resolve to `src/assets/` — custom Vite plugin, do not remove.
- **React/react-dom** are optional peer deps (declared optional in `package.json`).
- **pnpm override** pins `vite@6.3.5` — keep if switching package managers.
