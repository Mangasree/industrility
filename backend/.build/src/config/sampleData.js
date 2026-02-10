"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sampleViews = exports.sampleModels = void 0;
exports.getSampleImagePath = getSampleImagePath;
const path_1 = __importDefault(require("path"));
exports.sampleModels = ['motor', 'gearbox', 'bearing', 'valve', 'gaspack'];
exports.sampleViews = ['front', 'left', 'right', 'top', 'iso'];
function getSampleImagePath(rootDir, model, view) {
    return path_1.default.join(rootDir, model, `${view}.png`);
}
