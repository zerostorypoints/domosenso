import data from '../generated/makerworld.json';

export const makerworldProfile = data.profileUrl;
export function makerworldModel(deviceId: string): string | null {
  return data.models.find(model => model.deviceId === deviceId)?.makerworldUrl ?? null;
}
