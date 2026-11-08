"use client";
import { useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import {
	PRESET_THEMES, THEME_COLOR_KEYS, captureTheme, contrastRatio, findTheme, isThemeColor, resolveAppearance, selectTheme,
	type AppearanceSettings, type ThemeColors,
} from "@/src/core";
import { CommitInput, SettingsRow, ThinSelect } from "./controls";
import { useAppearance } from "./appearance";

const action = "rounded-sm border border-border px-2.5 py-1.5 font-ui text-xs transition-colors hover:bg-accent disabled:opacity-40";
const quiet = "rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const labels: Record<keyof ThemeColors, string> = { background: "Background", foreground: "Text", accent: "Accent" };

export function ThemeControls({ appearance, onChange }: {
	appearance?: AppearanceSettings;
	onChange: (next: AppearanceSettings) => Promise<boolean>;
}) {
	const { colorMode: activeMode } = useAppearance();
	const resolved = resolveAppearance(appearance);
	const colorMode = resolved.mode === "system" ? activeMode : resolved.mode;
	const theme = findTheme(appearance), custom = theme.id.startsWith("custom-");
	const themes = appearance?.customThemes ?? [];
	const [operation, setOperation] = useState<"save" | "rename" | "delete" | null>(null);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const current = captureTheme(appearance, theme.id, theme.name);
	const original = captureTheme(selectTheme(appearance, theme.id), theme.id, theme.name);
	const modified = JSON.stringify(current) !== JSON.stringify(original);
	const colors = resolved.colors[colorMode];
	const lowContrast = contrastRatio(colors.background, colors.foreground) < 4.5;

	const choose = async (id: string) => {
		if (await onChange(selectTheme(appearance, id))) { setOperation(null); setError(null); }
	};
	const save = async (replace: boolean) => {
		const title = replace ? theme.name : name.trim();
		if (!title || title.length > 80) { setError("Choose a theme name between 1 and 80 characters."); return; }
		if (!replace && [...PRESET_THEMES, ...themes].some(t => t.name.toLocaleLowerCase() === title.toLocaleLowerCase())) {
			setError("That theme name is already in use."); return;
		}
		const id = replace ? theme.id : `custom-${crypto.randomUUID()}`;
		const saved = captureTheme(appearance, id, title);
		if (await onChange(selectTheme({ ...appearance, customThemes: [...themes.filter(t => t.id !== id), saved] }, id))) {
			setOperation(null); setError(null);
		}
	};
	const rename = async () => {
		const title = name.trim();
		if (!title || title.length > 80) { setError("Choose a theme name between 1 and 80 characters."); return; }
		if ([...PRESET_THEMES, ...themes].some(t => t.id !== theme.id && t.name.toLocaleLowerCase() === title.toLocaleLowerCase())) {
			setError("That theme name is already in use."); return;
		}
		if (await onChange({ ...appearance, customThemes: themes.map(t => t.id === theme.id ? { ...t, name: title } : t) })) {
			setOperation(null); setError(null);
		}
	};
	const remove = async () => {
		if (await onChange(selectTheme({ ...appearance, customThemes: themes.filter(t => t.id !== theme.id) }, "default"))) {
			setOperation(null); setError(null);
		}
	};
	const setColor = (key: keyof ThemeColors, value: string) => {
		if (!isThemeColor(value)) { setError("Enter a color as #RGB or #RRGGBB."); return; }
		setError(null);
		void onChange({ ...appearance, colors: { ...appearance?.colors, [colorMode]: { ...appearance?.colors?.[colorMode], [key]: value } } });
	};

	return <>
		<SettingsRow label="Mode" testid="row-mode">
			<ThinSelect value={resolved.mode} ariaLabel="mode" testid="select-mode" onChange={mode => {
				setError(null); void onChange({ ...appearance, mode: mode as AppearanceSettings["mode"] });
			}}>
				<option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow system</option>
			</ThinSelect>
		</SettingsRow>
		<SettingsRow label="Theme" hint={modified ? "Modified" : undefined} testid="row-theme">
			<div className="flex items-center gap-2">
				{modified && <button type="button" className={quiet + " text-xs"} onClick={() => void choose(theme.id)}>Reset changes</button>}
				<ThinSelect value={theme.id} ariaLabel="Theme" testid="select-theme" onChange={id => void choose(id)}>
					<optgroup label="Presets">{PRESET_THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
					{themes.length > 0 && <optgroup label="Your themes">{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
				</ThinSelect>
			</div>
		</SettingsRow>
		<div className="rounded-md border border-border bg-background p-4" aria-label="Theme preview" data-testid="theme-preview">
			<div className="mb-3 flex items-center justify-between gap-3 font-ui text-xs text-muted-foreground">
				<span>Preview</span><span>{colorMode === "dark" ? "Dark" : "Light"}</span>
			</div>
			<p className="font-title text-xl">Eigenvalues and eigenvectors</p>
			<div className="lh-prose mt-2 font-prose text-(length:--lh-prose-size)"><h4>Key idea</h4><p>A nonzero vector <i>v</i> is an eigenvector when <strong>Av = λv</strong>.</p></div>
			<div className="mt-3 flex items-center gap-3 font-ui text-xs">
				<span className="rounded-sm bg-primary px-2 py-1 text-primary-foreground">Selected</span>
				<span className="text-muted-foreground">Definitions, examples, and practice</span>
			</div>
		</div>
		<div className="flex flex-wrap items-center gap-2">
			{custom && modified && <button type="button" className={action} onClick={() => void save(true)}>Save changes</button>}
			<button type="button" className={action} onClick={() => { setOperation("save"); setName(""); setError(null); }}>Save as theme</button>
			{custom && <>
				<button type="button" className={quiet} aria-label="Rename theme" title="Rename theme" onClick={() => { setOperation("rename"); setName(theme.name); setError(null); }}><PencilIcon className="size-3.5" /></button>
				<button type="button" className={quiet} aria-label="Delete theme" title="Delete theme" onClick={() => { setOperation("delete"); setError(null); }}><Trash2Icon className="size-3.5" /></button>
			</>}
		</div>
		{operation && <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3" role="group" aria-label={operation === "delete" ? "Delete theme" : operation === "rename" ? "Rename theme" : "Save theme"}>
			{operation === "delete" ? <p className="font-prose text-sm">Delete “{theme.name}”? The app will use Default.</p> : <label className="flex flex-col gap-2 font-prose text-sm">
				Theme name
				<input autoFocus aria-label="Theme name" maxLength={80} value={name} onChange={e => setName(e.target.value)}
					className="h-8 rounded-sm border border-border bg-card px-2 font-ui text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
					onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void (operation === "rename" ? rename() : save(false)); } }} />
			</label>}
			<div className="flex justify-end gap-2">
				<button type="button" className={quiet + " text-xs"} onClick={() => { setOperation(null); setError(null); }}>Cancel</button>
				<button type="button" className={action} disabled={operation !== "delete" && !name.trim()} onClick={() => void (operation === "delete" ? remove() : operation === "rename" ? rename() : save(false))}>{operation === "delete" ? "Delete" : "Save"}</button>
			</div>
		</div>}
		{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		{lowContrast && <div role="status" className="rounded-md border p-3 text-sm" style={{ background: "#fafafa", color: "#242424", borderColor: "#aaa" }}>
			Text may be hard to read with these colors. <button type="button" className="underline" onClick={() => void choose("default")}>Use Default theme</button>
		</div>}
		<div className="mt-2 border-t border-border pt-4">
			<p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">{colorMode === "dark" ? "Dark" : "Light"} colors</p>
			<div className="flex flex-col gap-3">{THEME_COLOR_KEYS.map(key => <SettingsRow key={key} label={labels[key]} testid={`row-${key === "foreground" ? "text-color" : key}`}>
				<div className="flex items-center gap-2">
					<div className="flex gap-1" aria-label={`${labels[key]} palette`}>{PRESET_THEMES.map(preset => <button
						key={preset.id} type="button" className="size-5 rounded-sm border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style={{ background: preset.colors[colorMode][key] }} aria-label={`${preset.name} ${labels[key].toLowerCase()}`}
						title={`${preset.name}: ${preset.colors[colorMode][key]}`} onClick={() => setColor(key, preset.colors[colorMode][key])} />)}</div>
					<CommitInput value={colors[key]} placeholder={theme.colors[colorMode][key]} ariaLabel={`${labels[key].toLowerCase()} hex`}
						testid={`input-${key}`} onCommit={value => setColor(key, value)} />
				</div>
			</SettingsRow>)}</div>
		</div>
	</>;
}
