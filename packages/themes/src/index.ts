import type { Theme } from './types.js';
import { defaultTheme } from './default.js';
import { cyberpunkTheme } from './cyberpunk.js';

export type { Theme, LightColors } from './types.js';

const themes = new Map<string, Theme>();

function register(theme: Theme): void {
  themes.set(theme.id, theme);
}

register(defaultTheme);
register(cyberpunkTheme);

export function getTheme(id: string): Theme {
  return themes.get(id) ?? defaultTheme;
}

export function getAllThemes(): Theme[] {
  return Array.from(themes.values());
}

export function registerTheme(theme: Theme): void {
  register(theme);
}

export { defaultTheme, cyberpunkTheme };
