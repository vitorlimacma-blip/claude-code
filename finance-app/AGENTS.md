# Expo HAS CHANGED

This project uses Expo SDK 57 (the version the App Store Expo Go supports). Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project conventions

- Read `docs/briefing-produto.md` (product spec), `docs/roteiro-fases.md` (phase order) and `docs/decisoes.md` (decision log) first. `docs/ARQUITETURA.md` is the earlier architecture history.
- `src/domain/` is pure TypeScript: no React, Expo or SQLite imports. Business rules live here, with tests.
- Screens never touch SQL: they go through the repositories in `src/data/repositories/` (via `useQuery` / `useRepositories`).
- Every repository write goes through `ctx.write(...)` and emits the changed tables on the bus.
- Money is integer cents; dates are `YYYY-MM-DD` strings; all rows have UUID ids, timestamps and soft deletes. "Today" is `todayKey()` (America/Sao_Paulo), never `toDateKey(new Date())`.
- What counts as income, spending or neither is decided only in `src/domain/ledger.ts` (by `nature`, not `type`). Never sum `amount` by `type` elsewhere.
- Lists show transactions through `src/domain/transactionDisplay.ts` (one row per transfer, day groups, badges) and `presentTransaction`; user actions that change data end with a toast offering "Desfazer" when it is safe.
- Projections, budgets and comparisons come from `src/domain/projection.ts`, `budgets.ts`, `spending.ts`, `recurrence.ts` and `insights.ts` (via `useFinancialPicture`); never project by stretching the month's daily pace, and state limitations instead of assuming zero.
- Transfers, refunds and installments are created with `createTransfer` / `createRefund` / `createInstallments`; writes accept a client-generated `id` and are idempotent.
- Never log or show raw errors: use `logError` / `userFacingError` from `src/platform/errors.ts` (no financial data in logs).
- New data columns that need values for existing rows get a step in `src/data/dataMigrations.ts`.
- Schema changes: edit `src/data/schema.ts`, then `npm run db:generate`; never edit generated migrations.
- While the app is tested in Expo Go, only use libraries bundled in Expo Go (see `node_modules/expo/bundledNativeModules.json`).
- The assistant only explains: numbers come from the tools in `src/ai/assistant/tools.ts`, each result is recorded as evidence (`withEvidence`: period, criteria, transaction ids) and the answer is checked by `checkAnswer`. Tools never write; changes are `AssistantAction` proposals the user confirms (with undo). Transaction text goes to the model through `sanitizeForModel`.
- AI contract (`docs/ai/spec/PROMPT_UNICO_CLAUDE_V2.md`, plan in `docs/ai/architecture.md`): financial tools in `src/ai/finance/tools.ts` are pure reads over `src/domain/financeQueries.ts`, validated by `validateArgs`; the user scope comes from the session, never from tool arguments. Reserves (`goals` repository) are never free money. `src/ai/eval/` (oracle, cases, synthetic scenario) is test-only; run `npm run ai:eval` to refresh `docs/ai/evaluation-report.json`.
- AI goes through the `AIProvider` interface in `src/ai/types.ts`; features never import a provider SDK directly. Provider adapters use the official SDKs (`@anthropic-ai/sdk`, `openai`), resolved as CommonJS by `metro.config.js`.
- UI uses the Maré Clara design system: colors, type, spacing, radii and motion only from `useTheme()` / `src/ui/tokens.ts` (no literal colors in screens), icons only via `Icon` (`src/ui/icons.tsx`, Lucide), money via `FinancialAmount` / `MoneyInput`. New color pairs go into `src/ui/__tests__/contrast.test.ts`. Review components in `/catalogo`.
- The app is developed PC-first (web) but must keep working on phones: use `useIsWide()` / `CONTENT_MAX_WIDTH` for layout, `src/platform/dialogs.ts` instead of `Alert` (a no-op on web), and `src/platform/secrets` for keys.
- UI text is Brazilian Portuguese; code and comments are English.
- Before pushing: `npm test`, `npm run typecheck`, `npm run lint`.
