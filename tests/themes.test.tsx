import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { after, test } from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import {
	PRESET_THEMES, appearanceVariables, captureTheme, contrastRatio, resolveAppearance,
	selectTheme, systemThemeScript, sanitizeUserSettings, type AppearanceSettings,
} from "../src/core/index.ts";
import { AppearanceProvider, useAppearance } from "../components/settings/appearance.tsx";
import { GraphCanvasRenderer } from "../components/graph-canvas.ts";
import { mermaidThemeFor } from "../components/mermaid-render.ts";

// Route and disk checks use their own profile and never installed credentials.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-themes-test-"));
process.env.LH_DATA_DIR = directory;
process.env.LH_AUTH_FILE = path.join(directory, "auth.json");
process.env.LH_IGNORE_ENV_KEYS = "1";
fs.writeFileSync(process.env.LH_AUTH_FILE, "{}");
const { readSettings, writeSettings } = await import("../src/store/settings.ts");
const { PUT } = await import("../app/api/settings/[section]/route.ts");
after(() => fs.rmSync(directory, { recursive: true, force: true }));
const put = (body: unknown) => PUT(new Request("http://localhost/api/settings/appearance", {
	method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ section: "appearance" }) });

test("legacy reading settings survive; their dark background never leaks into light mode", () => {
	const a = resolveAppearance({ background: "#18202c", fontFamily: "Georgia", proseFontSize: 19 });
	assert.equal(a.mode, "dark");
	assert.equal(a.colors.dark.background, "#18202c");
	assert.equal(a.colors.light.background, "#fafafa");
	assert.equal(a.fontFamily, "Georgia");
	assert.equal(a.proseFontSize, 19);
	assert.equal(resolveAppearance({ theme: "missing" }).theme, "default");
});

test("every preset supplies readable text, muted labels, and accent buttons in both modes", () => {
	for (const theme of PRESET_THEMES) for (const mode of ["light", "dark"] as const) {
		const vars = appearanceVariables(resolveAppearance({ theme: theme.id }), mode);
		for (const surface of ["--background", "--card", "--accent"]) {
			assert.ok(contrastRatio(vars[surface]!, vars["--foreground"]!) >= 4.5, `${theme.name} ${mode} ${surface}`);
		}
		assert.ok(contrastRatio(vars["--background"]!, vars["--muted-foreground"]!) >= 4.5, `${theme.name} ${mode} muted`);
		assert.ok(contrastRatio(vars["--primary"]!, vars["--primary-foreground"]!) >= 4.5);
	}
});

test("custom themes save both palettes and typography; rename, update, and delete round-trip through the route", async () => {
	writeSettings({ version: 1, general: { autoUpdate: false }, graph: { enabled: false } });
	const edited: AppearanceSettings = {
		mode: "system", theme: "paper", fontFamily: "Georgia", proseFontSize: 20, sessionNameSerif: false,
		colors: { dark: { accent: "#abc" }, light: { background: "#faf6ec" } },
		mdRendering: { headingWeight: 600, boldColor: "#777", italicColor: null },
	};
	const saved = captureTheme(edited, "custom-study", "Study");
	const selected = selectTheme({ ...edited, customThemes: [saved] }, saved.id);
	assert.equal((await put(selected)).status, 200);
	const stored = readSettings()!;
	assert.deepEqual(stored.appearance, selected);
	assert.deepEqual(stored.general, { autoUpdate: false });
	assert.deepEqual(stored.graph, { enabled: false });
	assert.deepEqual(captureTheme(stored.appearance, saved.id, saved.name), saved);
	assert.equal(resolveAppearance({ ...selected, fontFamily: null, mdRendering: { boldColor: null } }).fontFamily, null);
	assert.equal(resolveAppearance({ ...selected, mdRendering: { boldColor: null } }).mdRendering.boldColor, null);
	const renamed = { ...selected, customThemes: [{ ...saved, name: "Course notes" }] };
	assert.equal((await put(renamed)).status, 200);
	assert.equal(readSettings()!.appearance!.customThemes![0]!.name, "Course notes");
	const updated = captureTheme({ ...renamed, proseFontSize: 22 }, saved.id, "Course notes");
	assert.equal((await put(selectTheme({ ...renamed, customThemes: [updated] }, saved.id))).status, 200);
	assert.equal(resolveAppearance(readSettings()!.appearance).proseFontSize, 22);
	const reset = selectTheme(readSettings()!.appearance, "slate");
	assert.equal(reset.mode, "system");
	assert.equal(reset.customThemes!.length, 1, "selecting a preset preserves the custom library");
	assert.equal(resolveAppearance(reset).fontFamily, null, "preset clears custom typography overrides");
	assert.equal((await put(selectTheme({ ...reset, customThemes: [] }, "default"))).status, 200);
	assert.deepEqual(readSettings()!.appearance!.customThemes, []);
});

test("invalid themes reject without corrupting settings; damaged disk entries fall back safely", async () => {
	const theme = captureTheme(undefined, "custom-valid", "Valid");
	const before = readSettings();
	for (const invalid of [
		{ mode: "automatic" }, { theme: "missing" }, { colors: { dark: { background: "url(x)" } } },
		{ customThemes: [theme, theme] }, { customThemes: [{ ...theme, typography: undefined }] },
		{ customThemes: [{ ...theme, id: "default" }] },
		{ customThemes: [{ ...theme, colors: { ...theme.colors, light: { ...theme.colors.light, accent: "red" } } }] },
	]) {
		assert.equal((await put(invalid)).status, 400);
		assert.deepEqual(readSettings(), before);
	}
	const clean = sanitizeUserSettings({ version: 1, appearance: { theme: "custom-broken", customThemes: [{ id: "custom-broken" }, theme, theme] } })!;
	assert.equal(clean.appearance!.customThemes!.length, 1);
	assert.equal(resolveAppearance(clean.appearance).theme, "default");
});

test("system startup script chooses the OS palette and safely embeds a custom font", () => {
	const a = resolveAppearance({ mode: "system", theme: "slate", fontFamily: '</script><script>bad()</script>' });
	const script = systemThemeScript(a);
	assert.ok(!script.includes("</script>"));
	for (const mode of ["light", "dark"] as const) {
		const dom = parseHTML('<html><body></body></html>');
		vm.runInNewContext(script, { document: dom.document, matchMedia: () => ({ matches: mode === "dark" }) });
		assert.equal(dom.document.documentElement.classList.contains("dark"), mode === "dark");
		assert.equal(dom.document.documentElement.style.getPropertyValue("--background"), a.colors[mode].background);
		assert.equal(dom.document.documentElement.style.colorScheme, mode);
	}
});

test("live system changes repaint the document and native shell; Default removes font overrides", async () => {
	const dom = parseHTML('<html><body><div id="app"></div></body></html>');
	const globals = { window: dom.window, document: dom.document, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
	const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
	for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
	let dark = false;
	const listeners = new Set<() => void>();
	Object.assign(dom.window, { matchMedia: () => ({ matches: dark, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }) });
	const native: unknown[] = [];
	Object.assign(dom.window, { lh: { setAppearance: (colors: unknown) => native.push(colors) } });
	let update: ReturnType<typeof useAppearance>["onAppearanceChange"] = () => {};
	function Consumer() { const value = useAppearance(); update = value.onAppearanceChange; return <span>{value.colorMode}</span>; }
	const root = createRoot(dom.document.getElementById("app")!);
	try {
		await act(async () => root.render(<AppearanceProvider initialAppearance={{ mode: "system", fontFamily: "Georgia", sessionNameSerif: false }}><Consumer /></AppearanceProvider>));
		assert.equal(dom.document.getElementById("app")!.textContent, "light");
		assert.equal(dom.document.documentElement.style.colorScheme, "light");
		await act(async () => { dark = true; listeners.forEach(cb => cb()); });
		assert.equal(dom.document.getElementById("app")!.textContent, "dark");
		assert.equal(dom.document.documentElement.style.getPropertyValue("--background"), "#141414");
		assert.deepEqual(native.at(-1), { background: "#141414", foreground: "#e6e6e6" });
		await act(async () => update(selectTheme({ mode: "light" }, "paper")));
		assert.equal(dom.document.documentElement.style.getPropertyValue("--font-prose"), "");
		assert.equal(dom.document.documentElement.style.getPropertyValue("--font-title"), "");
		await act(async () => { dark = false; listeners.forEach(cb => cb()); dark = true; listeners.forEach(cb => cb()); });
		assert.equal(dom.document.getElementById("app")!.textContent, "light", "explicit mode ignores OS changes");
	} finally {
		await act(async () => root.unmount());
		for (const key of Object.keys(globals)) {
			if (previous[key]) Object.defineProperty(globalThis, key, previous[key]!);
			else Reflect.deleteProperty(globalThis, key);
		}
	}
});

test("graph theme changes only request a repaint, preserving layout, simulation, and pending saves", () => {
	const nodes = [{ id: "n", x: 12, y: 8 }], camera = { k: 2, x: 4, y: 5 }, sim = {}, commitTimer = {};
	let paints = 0;
	const renderer = { data: { nodes, colors: {} }, world: camera, sim, commitTimer, geoVersion: 17, markDirty: () => paints++ };
	const colors = { node: "#123", edge: "#666", label: "#555", hoverText: "#111", mode: "light" as const };
	GraphCanvasRenderer.prototype.setColors.call(renderer as unknown as GraphCanvasRenderer, colors);
	assert.equal(renderer.data.colors, colors);
	assert.equal(renderer.data.nodes, nodes);
	assert.equal(renderer.world, camera);
	assert.equal(renderer.sim, sim);
	assert.equal(renderer.commitTimer, commitTimer);
	assert.equal(renderer.geoVersion, 17);
	assert.equal(paints, 1);
});

test("diagram colors follow the chosen light/dark palette", () => {
	for (const mode of ["light", "dark"] as const) {
		const colors = resolveAppearance({ theme: "paper" }).colors[mode];
		const theme = mermaidThemeFor(mode, colors);
		assert.equal(theme.securityLevel, "strict");
		assert.equal(theme.themeVariables.darkMode, mode === "dark");
		assert.equal(theme.themeVariables.primaryTextColor, colors.foreground);
		assert.equal(theme.themeVariables.background, colors.background);
	}
});
