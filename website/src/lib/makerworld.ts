import data from '../generated/makerworld.json';

export const makerworldProfile = data.profileUrl;
export function makerworldModel(sourcePath: string): string | null {
  return data.models.find(model => model.device === sourcePath)?.makerworldUrl ?? null;
}
