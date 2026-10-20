# Perf Quick Wins — FinanzaApp

Objective: implement the 5 requested optimization items as prioritized quick wins found by hotspot mapping; findings that need design (encrypted-column search scan, resumen endpoint) are logged, not implemented this pass.
Branch: `perf/quick-wins` (from main). Delivery: `ask-on-risk`. Runner: frontend `npm run build (tsc -b && vite build)` + `vitest run` + eslint; backend `SECRET_KEY=test python -m pytest backend/tests/ -v`.
Test-first note (exception, logged): these are render/bundle/DB-optimization changes with no observable behavior change; no unit-test runner exists for React components. Evidence = build passing, backend suite green, and per-rule behavior pinning only where the shared code is touched (T5 has an existing suite).

## Specs

- S1 (verbatim): "1) detectá y eliminá renders innecesarios."
- S2 (verbatim): "2) reducí el bundle con lazy loading."
- S3 (verbatim): "3) optimizá requests y caching."
- S4 (verbatim): "4) encontrá queries lentas y problemas N+1."
- S5 (verbatim): "5) optimizá imágenes, fuentes y scripts."

## Tasks

- T1 (S2, inline): lazy-load tab chunks in `frontend/src/App.tsx` (DashboardCiclo, MovimientoList, CicloTab, CicloWizard) inside `<Suspense>`; keep MovimientoModal eager. Commit: `deda71d` ✅ — entry now splits (MovimientoList 18.9KB / CicloTab 45.1KB / DashboardCiclo 15.1KB / CicloWizard 11.6KB out of the entry chunk).
- T2 (S1, inline): remove `key={refreshKey}` full remount of MovimientoList (`App.tsx:185`); add `refreshKey` prop + refetch effect in MovimientoList (existing guarded fetch reused, no dup first fetch). Commit: `3301ae6` ✅.
- T3 (S1, inline): guard `visibilitychange` refetch in `frontend/src/components/CicloTab.tsx:93-101` with last-fetch timestamp (skip if <30s). Commit: `695749d` ✅.
- T4 (S4, inline): kill confirmed N+1 in `backend/services/gasto_programado_service.py:306-314`: one query over existing ciclo items, match via set. Commit: `ff663a2` ✅.
- T5 (S5, inline): add `fonts.googleapis.com` to CSP `style-src` and `fonts.gstatic.com` to `font-src` in `frontend/nginx.conf` (CSP seemed to block Google Fonts; permission-widening on exact origins is a no-op if it wasn't enforced). Commit: `1cb0eba` ✅ — pending: verify fonts load on deployed prod.
- T6 (S1, deferred): extract memo'd MovimientoRow/MovimientoCard with stable callbacks (`MovimientoList.tsx:195-271,469-516`) — larger refactor, phase 2.
- T7 (S3, deferred, finding): `buscar_descripciones` fetches+decrypts every row per keystroke (`movimiento_service.py:387-397`); needs encrypted-column-compatible design (shadow hash column or client cache) — phase 2 decision.
- T8 (S4, deferred, finding): `/ciclos/{id}` resumen ≈5 queries + in-memory aggregation (`ciclo_service.py:253-424`); bounded but heaviest endpoint — phase 2.

## Log

- L1 (2026-10-20): «1) detectá y eliminá renders innecesarios. 2) reducí el bundle con lazy loading. 3) optimizá requests y caching. 4) encontrá queries lentas y problemas N+1. 5) optimizá imágenes, fuentes y scripts.»
- L2: hotspot map delegated to gentle-ai-explore (obs #476). Confirmed: eager tab imports (App.tsx:5-9), refreshKey remount (:185), visibilitychange blanket refetch (CicloTab.tsx:93), N+1 en gasto_programado_service.py:306-314, CSP↔Google Fonts conflict sospechado (nginx.conf:67 vs index.html:13-17). listar_ciclos/libeos OK (no N+1 en list endpoints; joinedload presente en movimientos y gastos programados).
- L3 (2026-10-20): T1–T5 implementados en 5 commits (`deda71d`, `3301ae6`, `695749d`, `ff663a2`, `1cb0eba`) + docs (`a428df4`) en branch `perf/quick-wins`. Evidencia: `npm run build` OK (chunks divididos), `vitest run` 34/34, `pytest tests -q` 152/152 (72s). Pendientes: T6 (memo rows), T7 (buscar_descripciones scan, requiere diseño), T8 (resumen endpoint), y verificar fonts en prod tras T5. Push/PR pendiente de decisión del usuario.
