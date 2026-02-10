"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePlaceholders = generatePlaceholders;
const canvas_1 = require("canvas");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sampleData_1 = require("../src/config/sampleData");
const logger_1 = require("../src/utils/logger");
const DEFAULT_SIZE = 512;
function hashToColor(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 70%)`;
}
async function ensureDir(target) {
    await promises_1.default.mkdir(target, { recursive: true });
}
async function generatePlaceholders(outputDir) {
    logger_1.logger.info(`Generating placeholder images in ${outputDir}`);
    for (const model of sampleData_1.sampleModels) {
        const modelDir = path_1.default.join(outputDir, model);
        await ensureDir(modelDir);
        for (const view of sampleData_1.sampleViews) {
            const canvas = (0, canvas_1.createCanvas)(DEFAULT_SIZE, DEFAULT_SIZE);
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
            const outputPath = (0, sampleData_1.getSampleImagePath)(outputDir, model, view);
            await promises_1.default.writeFile(outputPath, buffer);
            logger_1.logger.info(`Placeholder generated: ${outputPath}`);
        }
    }
}
async function run() {
    const outputDir = path_1.default.resolve(__dirname, '..', 'sample_data');
    await generatePlaceholders(outputDir);
}
if (require.main === module) {
    run().catch((error) => {
        logger_1.logger.error(`Placeholder generation failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
