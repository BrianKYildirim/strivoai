
## Out-of-scope discoveries (08.2-03)

- `src/components/ui/chart.tsx` emits ~8 pre-existing TypeScript errors under `npm run type-check` (recharts `Props`/`payload`/`label` typing mismatch). Unrelated to the career-compass changes in this plan (chart.tsx untouched). Not fixed — logged per SCOPE BOUNDARY.
