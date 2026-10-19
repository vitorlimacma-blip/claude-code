@AGENTS.md

# Product specification

- The product brief is `docs/briefing-produto.md`: the complete specification of the current adaptation. Read it before changing behavior.
- Execution order and approval stops follow `docs/roteiro-fases.md`, which prevails over sections 2 and 18 of the brief on order and stops. Finish each phase with tests, a commit and a section-18 style summary, then stop for approval.
- Record decisions and assumptions in `docs/decisoes.md` (one row per decision, with status).
- `docs/fase0-inspecao.md` holds the inspection of the starting point and the phase plan.
- Where the brief conflicts with `docs/ARQUITETURA.md`, the brief wins; ARQUITETURA.md is history.
- Never claim tests or checks that were not actually run.
