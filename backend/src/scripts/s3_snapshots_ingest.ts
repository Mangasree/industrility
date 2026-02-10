import fs from 'fs/promises';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { S3Provider } from '../providers/storage/s3Provider';

const VIEWS = [
  'top',
  'bottom',
  'left',
  'right',
  'front',
  'back',
  'isometric'
] as const;
const STEP_EXTENSIONS = new Set(['.step', '.stp']);

type CliOptions = {
  inputDir: string;
  outputDir: string;
  region: string;
  bucket: string;
  prefix: string;
  size: number;
  concurrency: number;
  dryRun: boolean;
  freecadCmd?: string;
};

type IngestSummary = {
  cadFilesProcessed: number;
  snapshotsGenerated: number;
  uploaded: number;
  errors: number;
};

function parseArgs(argv: string[]): CliOptions {
  const defaults = {
    inputDir: path.resolve(__dirname, '..', '..', 'assets', 'cad_inputs'),
    outputDir: path.resolve(__dirname, '..', '..', 'assets', 'snapshots_out'),
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.S3_BUCKET_NAME || 'industrility-dev-assets-121846058050',
    prefix: process.env.S3_PREFIX || 'reference_snapshots/',
    size: 512,
    concurrency: 2,
    dryRun: false
  };

  const nextValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  const options: CliOptions = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--input_dir':
        options.inputDir = path.resolve(nextValue(i, arg));
        i += 1;
        break;
      case '--output_dir':
        options.outputDir = path.resolve(nextValue(i, arg));
        i += 1;
        break;
      case '--bucket':
        options.bucket = nextValue(i, arg);
        i += 1;
        break;
      case '--prefix':
        options.prefix = nextValue(i, arg);
        i += 1;
        break;
      case '--size':
        options.size = Number.parseInt(nextValue(i, arg), 10);
        i += 1;
        break;
      case '--concurrency':
        options.concurrency = Number.parseInt(nextValue(i, arg), 10);
        i += 1;
        break;
      case '--dry_run':
        options.dryRun = true;
        break;
      case '--freecad_cmd':
        options.freecadCmd = nextValue(i, arg);
        i += 1;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!Number.isInteger(options.size) || options.size <= 0) {
    throw new Error('Invalid --size value. Expected a positive integer.');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error('Invalid --concurrency value. Expected a positive integer.');
  }
  options.prefix = normalizePrefix(options.prefix);
  return options;
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }
  const noLeadingSlash = trimmed.replace(/^\/+/, '');
  return noLeadingSlash.endsWith('/') ? noLeadingSlash : `${noLeadingSlash}/`;
}

function sanitizePartId(fileName: string): string {
  const basename = path.parse(fileName).name;
  const normalized = basename
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'part';
}

async function listStepFilesRecursive(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (STEP_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

function findFreeCadRenderCommand(): string | null {
  const candidates =
    process.platform === 'win32' ? ['FreeCAD', 'freecad', 'FreeCADCmd', 'freecadcmd'] : ['FreeCAD', 'freecadcmd', 'FreeCADCmd'];
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['-h'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5000
    });
    if (!check.error && check.status !== null) {
      return candidate;
    }
  }

  if (process.platform === 'win32') {
    const windowsPaths = [
      'C:\\Program Files\\FreeCAD 1.0\\bin\\FreeCAD.exe',
      'C:\\Program Files\\FreeCAD\\bin\\FreeCAD.exe',
      'C:\\Program Files\\FreeCAD 1.0\\bin\\FreeCADCmd.exe',
      'C:\\Program Files\\FreeCAD\\bin\\FreeCADCmd.exe',
      'C:\\Program Files\\FreeCAD 1.0\\bin\\freecad.exe',
      'C:\\Program Files\\FreeCAD\\bin\\freecad.exe',
      'C:\\Program Files\\FreeCAD 1.0\\bin\\freecadcmd.exe',
      'C:\\Program Files\\FreeCAD\\bin\\freecadcmd.exe'
    ];
    for (const candidate of windowsPaths) {
      const check = spawnSync(candidate, ['-h'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000
      });
      if (!check.error && check.status !== null) {
        return candidate;
      }
    }
  }

  return null;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function renderSnapshotsWithFreeCad(
  freecadCmd: string,
  stepFile: string,
  outputDir: string,
  size: number
): Promise<void> {
  const freecadScript = path.resolve(__dirname, 'freecad_step_snapshot_renderer.py');
  await ensureDirectory(outputDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(freecadCmd, [freecadScript, stepFile, outputDir, String(size)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || 'offscreen'
      }
    });

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          [
            `FreeCAD render failed for "${stepFile}"`,
            stdout.trim() ? `stdout: ${stdout.trim()}` : '',
            stderr.trim() ? `stderr: ${stderr.trim()}` : ''
          ]
            .filter(Boolean)
            .join('\n')
        )
      );
    });
  });

  const missingViews: string[] = [];
  for (const view of VIEWS) {
    const expected = path.join(outputDir, `${view}.png`);
    try {
      await fs.access(expected);
    } catch {
      missingViews.push(view);
    }
  }

  if (missingViews.length > 0) {
    throw new Error(`Snapshot generation incomplete for "${stepFile}". Missing views: ${missingViews.join(', ')}`);
  }
}

async function uploadSnapshots(
  s3: S3Provider,
  bucket: string,
  prefix: string,
  partId: string,
  outputDir: string
): Promise<number> {
  let uploaded = 0;
  for (const view of VIEWS) {
    const filePath = path.join(outputDir, `${view}.png`);
    const body = await fs.readFile(filePath);
    const key = `${prefix}${partId}/${view}.png`;
    await s3.putObject({
      bucket,
      key,
      body,
      contentType: 'image/png'
    });
    uploaded += 1;
    console.log(`[UPLOAD] s3://${bucket}/${key}`);
  }
  return uploaded;
}

async function runWorkerPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) {
        return;
      }
      await worker(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const summary: IngestSummary = {
    cadFilesProcessed: 0,
    snapshotsGenerated: 0,
    uploaded: 0,
    errors: 0
  };

  console.log('[CONFIG]');
  console.log(`- input_dir: ${options.inputDir}`);
  console.log(`- output_dir: ${options.outputDir}`);
  console.log(`- region: ${options.region}`);
  console.log(`- bucket: ${options.bucket}`);
  console.log(`- prefix: ${options.prefix}`);
  console.log(`- size: ${options.size}`);
  console.log(`- concurrency: ${options.concurrency}`);
  console.log(`- dry_run: ${options.dryRun}`);
  if (options.freecadCmd) {
    console.log(`- freecad_cmd (forced): ${options.freecadCmd}`);
  }

  if (!(await fs.stat(options.inputDir).then(() => true).catch(() => false))) {
    throw new Error(`Input directory does not exist: ${options.inputDir}`);
  }

  const freecadCmd = options.freecadCmd || findFreeCadRenderCommand();
  if (!freecadCmd) {
    throw new Error(
      [
        'FreeCAD command is not available on PATH.',
        'Install FreeCAD and ensure "FreeCAD -h" or "FreeCADCmd -h" works.',
        'Or pass explicit binary path using --freecad_cmd "C:\\Program Files\\FreeCAD 1.0\\bin\\FreeCADCmd.exe".'
      ].join(' ')
    );
  }
  if (/freecadcmd(?:\.exe)?$/i.test(path.basename(freecadCmd))) {
    throw new Error(
      [
        `Selected FreeCAD command "${freecadCmd}" is console-only and cannot render snapshots with ImportGui.`,
        'Use FreeCAD GUI executable instead (example: "C:\\Program Files\\FreeCAD 1.0\\bin\\FreeCAD.exe").'
      ].join(' ')
    );
  }
  console.log(`- freecad_cmd: ${freecadCmd}`);

  const cadFiles = await listStepFilesRecursive(options.inputDir);
  if (cadFiles.length === 0) {
    console.log('No STEP/STP CAD files found to process.');
    console.log('[SUMMARY] CAD files processed=0, snapshots generated=0, uploaded=0, errors=0');
    return;
  }

  const s3 = new S3Provider(options.region);

  await runWorkerPool(cadFiles, options.concurrency, async (cadFile) => {
    summary.cadFilesProcessed += 1;
    const partId = sanitizePartId(path.basename(cadFile));
    const outputDir = path.join(options.outputDir, partId);

    try {
      console.log(`[RENDER] ${cadFile} -> ${outputDir}`);
      await renderSnapshotsWithFreeCad(freecadCmd, cadFile, outputDir, options.size);
      summary.snapshotsGenerated += VIEWS.length;

      if (options.dryRun) {
        console.log(`[DRY_RUN] Skipped upload for part_id=${partId}`);
        return;
      }

      const uploaded = await uploadSnapshots(s3, options.bucket, options.prefix, partId, outputDir);
      summary.uploaded += uploaded;
    } catch (error) {
      summary.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR] ${cadFile}: ${message}`);
    }
  });

  console.log('[SUMMARY]');
  console.log(`- CAD files processed: ${summary.cadFilesProcessed}`);
  console.log(`- Snapshots generated: ${summary.snapshotsGenerated}`);
  console.log(`- Uploaded: ${summary.uploaded}`);
  console.log(`- Errors: ${summary.errors}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FATAL] ${message}`);
  process.exit(1);
});
