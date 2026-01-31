
Goal: stop the Polotno editor from getting stuck on the “Loading editor…” spinner by eliminating the bootstrap cancellation/race condition introduced by the refactor, and align our integration with Polotno’s documented SidePanel/sections contract.

What I can already see (root cause)
- Your screenshot’s sequence:
  - “Waiting for mount element…”
  - “Bootstrap starting with mount element available”
  - “Bootstrap cleanup – cancelled flag set”
  - “Bootstrap already in flight, skipping”
  strongly indicates a React effect is being re-run (due to dependency changes), which triggers cleanup (sets `cancelled = true`) while the async bootstrap is still running. Then the “new” effect run refuses to start because `bootstrapInFlightRef.current` is still true, leaving the editor stuck forever.
- In `usePolotnoBootstrap`, the bootstrap effect depends on volatile values:
  - `projectImages` (array identity can change frequently)
  - `regenerateLayout` (function identity changes because it is recreated whenever `availableFields/allSampleData/projectImages/...` change)
- In `PolotnoEditorWrapper`, we call `useLayoutGenerator` twice; the first time is effectively just to get `regenerateLayout` and it’s not stable. That doubles churn and increases chances of bootstrap cancellation.
- Polotno documentation confirms custom section panels receive `{ store }` and should be defined as `Panel: observer(({ store }) => ...)`. Our “store prop” wiring in `polotno-sections.js` matches that contract now, so the remaining blocker is the bootstrap lifecycle itself (not Polotno’s section API). Reference: https://polotno.com/docs/side-panel-overview

High-level strategy
1) Make bootstrap “one-shot” per mount/template unless the user explicitly retries.
2) Remove volatile dependencies from the bootstrap effect; read dynamic data via refs instead.
3) Make `regenerateLayout` stable via refs (not via dependency-heavy `useCallback`).
4) Remove the duplicate `useLayoutGenerator` invocation and route all interactions through a single instance.
5) Add deterministic instrumentation so if it fails again we can point to the exact phase and why it aborted (key fetch, module load, store create, UI render, DOM verify).

Concrete implementation plan (code changes)
A) Fix `usePolotnoBootstrap` effect dependency churn (main spinner fix)
- Change `UsePolotnoBootstrapOptions` to accept:
  - `projectImagesRef` (RefObject) instead of `projectImages` array
  - `regenerateLayoutRef` (RefObject<() => Promise<void>>) or accept `regenerateLayout` but store it into a local ref inside `usePolotnoBootstrap` and do not include it in deps
- Update the bootstrap effect dependencies to only include stable primitives:
  - `mountEl`, `labelWidth`, `labelHeight`, `bleedMm`, `projectType`, `retryCount`
  - (Avoid including arrays/functions like `projectImages`, `regenerateLayout`, etc.)
- Inside bootstrap, whenever we need images or regenerateLayout, read from refs:
  - `const images = projectImagesRef.current || []`
  - `await regenerateLayoutRef.current?.()`
- Improve cancellation logic so a cancelled run never blocks a future run:
  - Introduce a `bootstrapRunIdRef` incremented each time we start
  - Each awaited step checks `if (runId !== bootstrapRunIdRef.current) return;`
  - In cleanup, increment the runId so the in-flight async chain becomes a no-op
  - Ensure `bootstrapInFlightRef.current` is cleared even when cancelled early

B) Fix `PolotnoEditorWrapper` orchestration (reduce re-render churn)
- Remove the first `useLayoutGenerator` call that uses `bootstrapStage: 'ready'`.
- Keep only one `useLayoutGenerator` call (the one driven by the real `bootstrapStage`).
- Create a stable `regenerateLayoutRef` in the wrapper:
  - `const regenerateLayoutRef = useRef(async () => {});`
  - `useEffect(() => { regenerateLayoutRef.current = layoutGenerator.regenerateLayout; }, [layoutGenerator.regenerateLayout]);`
- Pass `regenerateLayoutRef` into `usePolotnoBootstrap` (instead of passing the function directly).
- Pass `projectImagesRef` into `usePolotnoBootstrap` (instead of passing the array).

C) Make `useLayoutGenerator.regenerateLayout` stable (avoid function identity changes)
- Convert `useLayoutGenerator` to internally use refs for:
  - `availableFields`, `allSampleData`, `projectImages`, `labelWidth/height`, `projectType`
- Implement `regenerateLayout` with `useCallback([])` (or a very small dependency list), reading everything from those refs.
- This ensures:
  - `regenerateLayout` does not change identity on data updates
  - `usePolotnoBootstrap` won’t be retriggered by layout generator changes

D) Add targeted bootstrap diagnostics (so this doesn’t regress silently again)
- Add a single structured log per stage transition with a runId, e.g.:
  - `[polotno-bootstrap run=3 stage=load_modules] ...`
- Add a “timeout watchdog” (e.g. 20s) per run:
  - If we don’t reach `ready`, set `error` with the stage that timed out.
- Log the reason for abort:
  - “aborted because mountEl changed”
  - “aborted because runId superseded”
  - “aborted because key fetch failed”
- This will give us definitive proof the spinner is caused by cancellation and exactly which dependency is causing reruns (if any remain).

E) Re-validate against Polotno docs (to satisfy the “deep dive” request)
- Confirm we follow the documented SidePanel contract:
  - sections array passed into `<SidePanel store={store} sections={...} />`
  - custom section uses `Panel: observer(({ store }) => ...)`
- Confirm our bridge pattern (isolating Polotno imports in `polotno-runtime.js`) remains intact and we’re not accidentally importing Polotno types in TS anywhere else.
- Check if any “Polotno init” steps changed across versions (we’ll pin symptoms to our lifecycle rather than guessing).

Testing checklist (end-to-end, the critical part)
1) Open any existing project → editor should reach “ready” without spinner.
2) Confirm the Polotno UI actually renders (tabs visible, canvas visible).
3) Record navigation:
   - Click next/previous record; confirm text changes per record.
4) Side panel:
   - Click Barcodes; confirm it loads (no blank panel, no console error).
   - Insert a barcode/QR/sequence; confirm it appears and persists when switching records.
5) Reload the page:
   - Confirm editor still loads (no dependency-churn regressions).
6) Repeat in at least two different projects (one with images, one without).

Fallback / safety net
- If we still see any instability after the above, we will:
  - Add a “hard reset editor” button that calls `retry()` and also increments `bootstrapRunIdRef` (forces a clean restart).
  - Provide a quick rollback path via History to the last known stable snapshot, then re-apply only the stabilization changes incrementally.

Files that will be modified (expected)
- src/components/polotno/hooks/usePolotnoBootstrap.ts
- src/components/polotno/hooks/useLayoutGenerator.ts
- src/components/polotno/PolotnoEditorWrapper.tsx
(plus any hook type exports if needed)

Why this will fix the spinner
- It removes the exact mechanism shown in your console: bootstrap cleanup happening mid-flight due to dependency churn + a “bootstrap already in flight” guard that prevents restart.
- After these changes, data updates (fields, images, subscription banners, etc.) will not cancel bootstrap. Bootstrap will only rerun on intentional events (mount change, template change via key, or retry).
