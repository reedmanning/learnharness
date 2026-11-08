/** Theme definitions and palette operations shared by settings and the renderer. */
import type { AppearanceSettings, MdRenderingSettings } from "./settings.ts";
import type { EffectiveAppearance } from "./settings-resolution.ts";

export type ColorMode = "light" | "dark";
export type AppearanceMode = ColorMode | "system";
export interface ThemeColors { background: string; foreground: string; accent: string }
export interface ThemeTypography {
	fontFamily: string | null;
	proseFontSize: number;
	sessionNameSerif: boolean;
	mdRendering: Required<MdRenderingSettings>;
}
export interface ThemeDefinition {
	id: string;
	name: string;
	colors: Record<ColorMode, ThemeColors>;
	typography?: ThemeTypography;
}

export const THEME_COLOR_KEYS = ["background", "foreground", "accent"] as const;
export const PRESET_THEMES: readonly ThemeDefinition[] = [
	{ id: "default", name: "Default", colors: {
		dark: { background: "#141414", foreground: "#e6e6e6", accent: "#e6e6e6" },
		light: { background: "#fafafa", foreground: "#242424", accent: "#242424" },
	} },
	{ id: "paper", name: "Paper", colors: {
		dark: { background: "#26231e", foreground: "#ece4d6", accent: "#e3c490" },
		light: { background: "#f6f1e5", foreground: "#383328", accent: "#785b2c" },
	} },
	{ id: "slate", name: "Slate", colors: {
		dark: { background: "#18212c", foreground: "#e1e9f3", accent: "#9bbce7" },
		light: { background: "#edf2f8", foreground: "#253448", accent: "#355c8b" },
	} },
];

const record = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const isThemeColor = (value: unknown): value is string =>
	typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);

/** Strict, bounded shapes; extra fields never become CSS or nested settings. */
export function parseThemeColors(value: unknown, partial = false): Partial<ThemeColors> | null {
	const raw = record(value);
	if (!raw) return null;
	const out: Partial<ThemeColors> = {};
	for (const key of THEME_COLOR_KEYS) {
		if (partial && raw[key] === undefined) continue;
		if (!isThemeColor(raw[key])) return null;
		out[key] = raw[key];
	}
	return out;
}

export function parseCustomTheme(value: unknown): ThemeDefinition | null {
	const raw = record(value), colors = record(raw?.colors), typography = record(raw?.typography);
	if (!raw || typeof raw.id !== "string" || !/^custom-[a-z0-9-]+$/i.test(raw.id)
		|| typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 80 || !colors || !typography) return null;
	const light = parseThemeColors(colors.light), dark = parseThemeColors(colors.dark);
	const md = record(typography.mdRendering);
	if (!light || !dark || !md
		|| (typography.fontFamily !== null && (typeof typography.fontFamily !== "string" || !typography.fontFamily.trim()))
		|| !Number.isInteger(typography.proseFontSize) || Number(typography.proseFontSize) < 12 || Number(typography.proseFontSize) > 24
		|| typeof typography.sessionNameSerif !== "boolean"
		|| !Number.isInteger(md.headingWeight) || Number(md.headingWeight) < 100 || Number(md.headingWeight) > 900
		|| (md.boldColor !== null && !isThemeColor(md.boldColor))
		|| (md.italicColor !== null && !isThemeColor(md.italicColor))) return null;
	return {
		id: raw.id, name: raw.name.trim(), colors: { light: light as ThemeColors, dark: dark as ThemeColors },
		typography: {
			fontFamily: typography.fontFamily === null ? null : (typography.fontFamily as string).trim(),
			proseFontSize: typography.proseFontSize as number, sessionNameSerif: typography.sessionNameSerif,
			mdRendering: { headingWeight: md.headingWeight as number, boldColor: md.boldColor as string | null, italicColor: md.italicColor as string | null },
		},
	};
}

export function findTheme(appearance: AppearanceSettings | undefined): ThemeDefinition {
	return [...PRESET_THEMES, ...(appearance?.customThemes ?? [])].find(t => t.id === appearance?.theme) ?? PRESET_THEMES[0]!;
}

export function resolveThemeColors(appearance: AppearanceSettings | undefined, mode: ColorMode): ThemeColors {
	return {
		...findTheme(appearance).colors[mode],
		// The old background control only affected the dark interface.
		...(mode === "dark" && appearance?.background ? { background: appearance.background } : {}),
		...appearance?.colors?.[mode],
	};
}

/** Selecting a saved theme replaces the current overrides, not the theme library or mode. */
export function selectTheme(appearance: AppearanceSettings | undefined, theme: string): AppearanceSettings {
	const { background, colors, fontFamily, proseFontSize, sessionNameSerif, mdRendering, ...rest } = appearance ?? {};
	return { ...rest, theme };
}

function rgb(hex: string): number[] {
	const full = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
	return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}
const hex = (channels: number[]) => "#" + channels.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
const shift = (color: string, by: number) => hex(rgb(color).map(n => n + by));
const mix = (a: string, b: string, ratio: number) => hex(rgb(a).map((n, i) => n + (rgb(b)[i]! - n) * ratio));

export function contrastRatio(a: string, b: string): number {
	const luminance = (color: string) => rgb(color).map(n => {
		const c = n / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i]!, 0);
	const x = luminance(a), y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Preserve the existing dark surface offsets; light surfaces step toward darker neutrals. */
export function derivedPalette(background: string, mode: ColorMode = "dark"): Record<string, string> {
	const direction = mode === "dark" ? 1 : -1;
	return {
		"--background": background,
		"--card": shift(background, 8 * direction), "--popover": shift(background, 8 * direction),
		"--secondary": shift(background, 8 * direction), "--muted": shift(background, 8 * direction),
		"--accent": shift(background, 22 * direction),
		"--border": shift(background, 47 * direction), "--input": shift(background, 47 * direction),
		"--primary-foreground": background,
	};
}

export function themeVariables(colors: ThemeColors, mode: ColorMode): Record<string, string> {
	const { background, foreground, accent } = colors;
	let mutedRatio = mode === "dark" ? 0.576 : 0.65;
	let muted = mix(background, foreground, mutedRatio);
	while (contrastRatio(background, muted) < 4.5 && mutedRatio < 1) {
		mutedRatio = Math.min(1, mutedRatio + 0.025);
		muted = mix(background, foreground, mutedRatio);
	}
	// Button text follows whichever neutral has better contrast with the chosen accent.
	const onAccent = contrastRatio(accent, "#141414") > contrastRatio(accent, "#fafafa") ? "#141414" : "#fafafa";
	return {
		...derivedPalette(background, mode),
		"--foreground": foreground, "--card-foreground": foreground, "--popover-foreground": foreground,
		"--secondary-foreground": foreground, "--accent-foreground": foreground,
		"--muted-foreground": muted, "--primary": accent, "--primary-foreground": onAccent,
		"--ring": muted,
		"--destructive": mode === "dark" ? "#ef7770" : "#b42318",
		"--lh-code-background": mix(background, mode === "dark" ? "#000000" : foreground, mode === "dark" ? 0.14 : 0.04),
	};
}

export function appearanceVariables(a: EffectiveAppearance, mode: ColorMode): Record<string, string> {
	const vars = themeVariables(a.colors[mode], mode);
	vars["--lh-prose-size"] = `${a.proseFontSize}px`;
	vars["--lh-heading-weight"] = String(a.mdRendering.headingWeight);
	if (a.fontFamily !== null) vars["--font-prose"] = `${JSON.stringify(a.fontFamily)}, var(--font-sans3), ui-sans-serif, system-ui, sans-serif`;
	if (!a.sessionNameSerif) vars["--font-title"] = "var(--font-prose)";
	if (a.mdRendering.boldColor !== null) vars["--lh-ink-strong"] = a.mdRendering.boldColor;
	if (a.mdRendering.italicColor !== null) vars["--lh-ink-italic"] = a.mdRendering.italicColor;
	return vars;
}

/** Apply system mode before hydration; only appearance data is embedded in the page. */
export function systemThemeScript(a: EffectiveAppearance): string {
	const palettes = JSON.stringify({ light: appearanceVariables(a, "light"), dark: appearanceVariables(a, "dark") }).replace(/</g, "\\u003c");
	return `(()=>{const e=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',p=${palettes};e.classList.toggle('dark',m==='dark');e.style.colorScheme=m;for(const [k,v] of Object.entries(p[m]))e.style.setProperty(k,v)})()`;
}
