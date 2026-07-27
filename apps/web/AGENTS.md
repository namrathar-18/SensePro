# SensePro+ — Web Frontend

Browser-based attendance, exam proctoring review, and fairness-aware engagement analytics.
MCA major project, CHRIST University.

## Stack
- React 19 + TypeScript + Vite + Tailwind CSS v4
- TanStack Router (file-based) + TanStack Start
- shadcn/ui + Radix primitives + Framer Motion + Recharts
- Supabase (auth + database) · FastAPI backend (separate repo)

## Conventions
- Design tokens in `src/styles.css` (source of truth: `docs/design-system.md`)
- CSS variables: `--bg`, `--surface`, `--primary`, `--accent`, `--ok`, `--warn`, `--bad`
- Typography: Archivo (display), Inter (body), IBM Plex Mono (data)
- No per-student engagement scores. No emotion labels. Human-in-the-loop proctoring.
