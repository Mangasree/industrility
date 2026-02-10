import path from 'path';

export const sampleModels = ['motor', 'gearbox', 'bearing', 'valve', 'gaspack'] as const;
export const sampleViews = ['front', 'left', 'right', 'top', 'iso'] as const;

export type SampleModel = (typeof sampleModels)[number];
export type SampleView = (typeof sampleViews)[number];

export function getSampleImagePath(rootDir: string, model: SampleModel, view: SampleView): string {
  return path.join(rootDir, model, `${view}.png`);
}
