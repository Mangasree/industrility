# S3 Snapshots Ingestion

This guide covers generating 7-view PNG snapshots from local CAD files and uploading them to S3.

## 1) Place CAD files

Put CAD files under:

`backend/assets/cad_inputs/`

The ingestion script scans this folder recursively.

Supported input (for ingestion):
- `.step`
- `.stp`

During ingestion:
- FreeCAD renders snapshots directly from STEP/STP.
- No STL conversion and no Blender stage in this flow.

## 2) Install prerequisites

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Install FreeCAD and confirm command availability on PATH:

```bash
FreeCAD -h
```

If `FreeCAD` is unavailable on your system, `FreeCADCmd -h` is also accepted by the script.

## 3) Run ingestion locally

Defaults:
- `AWS_REGION=ap-south-1`
- `S3_BUCKET_NAME=industrility-dev-assets-121846058050`
- `S3_PREFIX=reference_snapshots/`
- `input_dir=backend/assets/cad_inputs`
- `output_dir=backend/assets/snapshots_out`
- `size=512`
- `concurrency=2`

Run with defaults:

```bash
cd backend
npm run ingest:s3-snapshots
```

Run with explicit args:

```bash
npm run ingest:s3-snapshots -- \
  --input_dir ./assets/cad_inputs \
  --output_dir ./assets/snapshots_out \
  --bucket industrility-dev-assets-121846058050 \
  --prefix reference_snapshots/ \
  --size 512 \
  --concurrency 2
```

Dry-run (render only, no S3 upload):

```bash
npm run ingest:s3-snapshots -- --dry_run
```

## 4) Verify uploaded objects

List uploaded objects:

```bash
aws s3 ls s3://industrility-dev-assets-121846058050/reference_snapshots/ --recursive
```

Expected key layout per part:

`reference_snapshots/<part_id>/top.png`
`reference_snapshots/<part_id>/bottom.png`
`reference_snapshots/<part_id>/left.png`
`reference_snapshots/<part_id>/right.png`
`reference_snapshots/<part_id>/front.png`
`reference_snapshots/<part_id>/back.png`
`reference_snapshots/<part_id>/isometric.png`

## 5) Troubleshooting

### Blender not found
- Not applicable for STEP-only ingestion flow.

### STEP files cannot be rendered directly
- Ensure FreeCAD (or FreeCADCmd) is on PATH so direct STEP rendering can run.
- If rendering fails, test manually with:
  `FreeCAD backend/src/scripts/freecad_step_snapshot_renderer.py <input.step> <output_dir> <size>`

### Import error for OBJ/STL
- Not applicable for STEP-only ingestion flow.

### AWS upload failures
- Confirm AWS credentials are configured via standard environment/CLI profile.
- Confirm bucket exists and caller has `s3:PutObject` permission.
