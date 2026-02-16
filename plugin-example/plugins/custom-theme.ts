import type { World } from 'blecsd';
import { definePlugin } from 'blecsd/core';

let themeActive = false;

export const customThemePlugin = definePlugin({
  name: 'custom-theme',
  version: '1.0.0',

  init(world: World): World {
    themeActive = false;
    return world;
  },

  onActivate() {
    themeActive = true;
  },

  onDeactivate() {
    themeActive = false;
  },

  cleanup(world: World): World {
    themeActive = false;
    return world;
  },
});

export function getThemeStatus(): string {
  return themeActive ? 'Cyberpunk theme ACTIVE' : 'Cyberpunk theme inactive';
}
