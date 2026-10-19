# Expo HAS CHANGED

This project uses Expo SDK 58. Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Project conventions

- Read `docs/briefing-produto.md` (product spec), `docs/roteiro-fases.md` (phase order) and `docs/decisoes.md` (decision log) first. `docs/ARQUITETURA.md` is the earlier architecture history.
- `src/domain/` is pure TypeScript: no React, Expo or SQLite imports. Business rules live here, with tests.
- Screens never touch SQL: they go through the repositories in `src/data/repositories/` (via `useQuery` / `useRepositories`).
- Every repository write goes through `ctx.write(...)` and emits the changed tables on the bus.
- Money is integer cents; dates are `YYYY-MM-DD` strings; all rows have UUID ids, timestamps and soft deletes. "Today" is `todayKey()` (America/Sao_Paulo), never `toDateKey(new Date())`.
- What counts as income, spending or neither is decided only in `src/domain/ledger.ts` (by `nature`, not `type`). Never sum `amount` by `type` elsewhere.
- Lists show transactions through `src/domain/transactionDisplay.ts` (one row per transfer, day groups, badges) and `presentTransaction`; user actions that change data end with a toast offering "Desfazer" when it is safe.
- Transfers, refunds and installments are created with `createTransfer` / `createRefund` / `createInstallments`; writes accept a client-generated `id` and are idempotent.
- Never log or show raw errors: use `logError` / `userFacingError` from `src/platform/errors.ts` (no financial data in logs).
- New data columns that need values for existing rows get a step in `src/data/dataMigrations.ts`.
- Schema changes: edit `src/data/schema.ts`, then `npm run db:generate`; never edit generated migrations.
- While the app is tested in Expo Go, only use libraries bundled in Expo Go (see `node_modules/expo/bundledNativeModules.json`).
- AI goes through the `AIProvider` interface in `src/ai/types.ts`; features never import a provider SDK directly. Provider adapters use the official SDKs (`@anthropic-ai/sdk`, `openai`), resolved as CommonJS by `metro.config.js`.
- UI uses the Maré Clara design system: colors, type, spacing, radii and motion only from `useTheme()` / `src/ui/tokens.ts` (no literal colors in screens), icons only via `Icon` (`src/ui/icons.tsx`, Lucide), money via `FinancialAmount` / `MoneyInput`. New color pairs go into `src/ui/__tests__/contrast.test.ts`. Review components in `/catalogo`.
- The app is developed PC-first (web) but must keep working on phones: use `useIsWide()` / `CONTENT_MAX_WIDTH` for layout, `src/platform/dialogs.ts` instead of `Alert` (a no-op on web), and `src/platform/secrets` for keys.
- UI text is Brazilian Portuguese; code and comments are English.
- Before pushing: `npm test`, `npm run typecheck`, `npm run lint`.
