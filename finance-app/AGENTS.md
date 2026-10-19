# Expo HAS CHANGED

This project uses Expo SDK 58. Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Project conventions

- Read `docs/ARQUITETURA.md` first: it holds the architecture, the decisions already made with the user, and the staged plan.
- `src/domain/` is pure TypeScript: no React, Expo or SQLite imports. Business rules live here, with tests.
- Screens never touch SQL: they go through the repositories in `src/data/repositories/` (via `useQuery` / `useRepositories`).
- Every repository write goes through `ctx.write(...)` and emits the changed tables on the bus.
- Money is integer cents; dates are `YYYY-MM-DD` strings; all rows have UUID ids, timestamps and soft deletes.
- Schema changes: edit `src/data/schema.ts`, then `npm run db:generate`; never edit generated migrations.
- While the app is tested in Expo Go, only use libraries bundled in Expo Go (see `node_modules/expo/bundledNativeModules.json`).
- UI text is Brazilian Portuguese; code and comments are English.
- Before pushing: `npm test`, `npm run typecheck`, `npm run lint`.
