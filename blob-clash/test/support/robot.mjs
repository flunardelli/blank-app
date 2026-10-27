// Loads the RobotExpressive clips from disk for tests (the game fetches the same file).
import { readFile } from 'node:fs/promises';
import { parseRobot } from '../../src/art/retarget.js';

export async function loadRobotFromDisk() {
  const file = await readFile(new URL('../../assets/anim/RobotExpressive.glb', import.meta.url));
  return parseRobot(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}
