# Archive Notes

This folder contains legacy or non-submission paths moved out of the active runtime code path.

## Moved on 2026-02-10

### Legacy sample-data indexing pipeline
- `archive/backend/scripts/preindex.ts`
- `archive/backend/scripts/gen_placeholders.ts`
- `archive/backend/src/config/sampleData.ts`

Reason:
- These files implement an older placeholder/sample-image pipeline.
- Current project flow uses:
  - `backend/src/scripts/s3_snapshots_ingest.ts`
  - `backend/src/scripts/index_s3_snapshots.ts`
  - `backend/src/handlers/search.ts`

### Legacy Blender renderers
- `archive/backend/src/scripts/blender_snapshot_renderer.py`
- `archive/backend/src/scripts/blender_step_snapshot_renderer.py`

Reason:
- Active submission pipeline is FreeCAD STEP/STP rendering via `freecad_step_snapshot_renderer.py`.
- Blender scripts are retained here for reference only.

## Removed file
- `frontend/KEYS.txt`

Reason:
- Not used by runtime code and not required for submission.
- Environment setup is documented in `.env.example` files.
