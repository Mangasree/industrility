import { createCanvas } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import { sampleModels, sampleViews, getSampleImagePath } from '../src/config/sampleData';
import { logger } from '../src/utils/logger';

const DEFAULT_SIZE = 512;

function hashToColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 70%)`;
}

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function generatePlaceholders(outputDir: string): Promise<void> {
  logger.info(`Generating placeholder images in ${outputDir}`);
  for (const model of sampleModels) {
    const modelDir = path.join(outputDir, model);
    await ensureDir(modelDir);
    for (const view of sampleViews) {
      const canvas = createCanvas(DEFAULT_SIZE, DEFAULT_SIZE);
      const context = canvas.getContext('2d');
      const label = `${model.toUpperCase()} / ${view.toUpperCase()}`;

      context.fillStyle = hashToColor(`${model}-${view}`);
      context.fillRect(0, 0, DEFAULT_SIZE, DEFAULT_SIZE);

      context.fillStyle = '#111111';
      context.font = 'bold 36px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, DEFAULT_SIZE / 2, DEFAULT_SIZE / 2);

      const buffer = canvas.toBuffer('image/png');
      const outputPath = getSampleImagePath(outputDir, model, view);
      await fs.writeFile(outputPath, buffer);
      logger.info(`Placeholder generated: ${outputPath}`);
    }
  }
}

async function run(): Promise<void> {
  const outputDir = path.resolve(__dirname, '..', 'sample_data');
  await generatePlaceholders(outputDir);
}

if (require.main === module) {
  run().catch((error) => {
    logger.error(`Placeholder generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
