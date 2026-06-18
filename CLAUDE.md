# stereo-lab — project instructions

A learning lab: each `src/stations/NN-*.ts` exercises one 3D concept (procedural
geometry, glTF I/O, SDF shaders, motion, physics) inside one Vite app.

## Git conventions

- Make `npm run build` (tsc + vite) pass before committing.
- Commit subject: imperative, scoped by area — `station-NN:`, `lib:`, `fix:`, `docs:`
  (e.g. `station-05: add Rapier physics with fixed timestep`).
- `public/models/building.glb` is committed (station 02 loads it at runtime).
  Regenerate with `npm run gen:glb` and re-commit whenever `src/lib/building.ts` changes.
- Don't commit stray verification screenshots (`*.png` left in the repo root).
