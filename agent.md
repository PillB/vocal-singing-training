# Agent instructions

Canonical project instructions: [`AGENTS.md`](./AGENTS.md) at the repository
root (`vocal-singing-training/AGENTS.md`). Read and follow that file before
making changes. Audit status: `docs/40-PRODUCTION-AUDIT-2026-11-01.md`.

Per task and round: follow the falsifiable-test and preexecution/source-drift
contracts in `AGENTS.md`; run `npm run lint` (modified complexity <=15),
`npm run test:core`, focused browser tests and defect mutations.
Tautological tests are harmful: preserve the wrong-behavior counterexample.

Deployment ownership/recovery contract: `docs/53-DEPLOYMENT-OWNERSHIP-AND-RECOVERY.md`.
Keep ignored private ownership records current after account or deployment changes.


## BreathFlow: investigación, demostraciones y anti-tautologías

**Documento revisable:** [docs/56-BREATHFLOW-EVIDENCE-BASED-DESIGN.md](./docs/56-BREATHFLOW-EVIDENCE-BASED-DESIGN.md). Matriz de fuentes/funciones/estados: [data/breathflow-evidence-design.v1.json](./data/breathflow-evidence-design.v1.json). Ningún método se llamará clínicamente validado por una ilustración, pitch/RMS o checklist.

En **cada tarea y cada ronda**: (1) comparar al menos dos rutas y el ideal de un docente/foniatra/UX experto; (2) escribir resultado correcto, contraejemplo y medida observable; (3) exponer **todos** los trade-offs; (4) probar el caso positivo y un mutante/estado corrupto que deba fallar; (5) revisar regresiones de plan, semana/mes, audio, perfiles, mobile/AT y origen desplegado; (6) apuntar pruebas no ejecutadas como **no verificadas**; y (7) red-team cinco dominios con evidencia (ciencia, recursos/races, accesibilidad, motivación y drift/integración).

Comandos por tarea/ronda (ejecutar o registrar bloqueo, nunca simular resultados):

    npm run lint
    npm run test:core
    node --test tests/node/breathflow-evidence-design.test.mjs
    # En rama donde BreathFlow sí existe:
    node qa/mutate-breathflow.mjs
    npx playwright test tests/breathflow.spec.js --project=chromium

**chore(lint):** el gate existente en qa/lint-complexity.mjs exige McCabe modified <=15 para cada función nueva/modificada; no ampliar la baseline. El gate fuente y mutantes deben rechazar que una función/propuesta en PR se anuncie en main y errores de oracle que conviertan tests rotos en éxitos. La regla canónica y más extensa sigue en [AGENTS.md](./AGENTS.md).

Skill-focus implementation handoff: [docs/57-SKILL-FOCUSED-SETS.md](./docs/57-SKILL-FOCUSED-SETS.md).
Every task and round: source fault + correct observable case; no tautologies; npm run lint (chore(lint) modified CC <=15), npm run test:core, node --test tests/node/skill-sets.test.mjs, and browser skill flows. Red-team science, race/ledger, accessibility/mobile, gamification/privacy and catalog drift. Unrun physical/device checks remain unverified.
