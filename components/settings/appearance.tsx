"use client";
/** Apply the profile's appearance on every page and react to operating-system changes. */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { appearanceVariables, resolveAppearance, type AppearanceSettings, type ColorMode } from "@/src/core";

// Keep the existing public helpers available to settings consumers and tests.
export { resolveAppearance, derivedPalette } from "@/src/core";
export function appearanceVars(a: ReturnType<typeof resolveAppearance>, mode: ColorMode = a.mode === "light" ? "light" : "dark") {
	return appearanceVariables(a, mode);
}
export function staleVarNames(previous: readonly string[], next: Record<string, string>): string[] {
	return previous.filter(name => !(name in next));
}

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeSystemMode(changed: () => void) {
	const query = window.matchMedia(darkQuery);
	query.addEventListener("change", changed);
	return () => query.removeEventListener("change", changed);
}
const systemMode = (): ColorMode => window.matchMedia(darkQuery).matches ? "dark" : "light";
const serverMode = (): ColorMode => "dark";

interface AppearanceContextValue {
	appearance: ReturnType<typeof resolveAppearance>;
	colorMode: ColorMode;
	onAppearanceChange: (next: AppearanceSettings | undefined) => void;
}
const AppearanceContext = createContext<AppearanceContextValue>({
	appearance: resolveAppearance(undefined), colorMode: "dark", onAppearanceChange: () => {},
});
export function useAppearance() { return useContext(AppearanceContext); }

export function AppearanceProvider({ initialAppearance, children }: {
	initialAppearance?: AppearanceSettings;
	children: React.ReactNode;
}) {
	const [delta, setDelta] = useState(initialAppearance);
	const preferredMode = useSyncExternalStore(subscribeSystemMode, systemMode, serverMode);
	const appearance = useMemo(() => resolveAppearance(delta), [delta]);
	const colorMode = appearance.mode === "system" ? preferredMode : appearance.mode;
	const vars = useMemo(() => appearanceVars(appearance, colorMode), [appearance, colorMode]);
	// Include server-applied names so selecting Default also clears saved font/ink overrides.
	const appliedNames = useRef(Object.keys(appearanceVars(resolveAppearance(initialAppearance))));
	useLayoutEffect(() => {
		const root = document.documentElement;
		for (const name of staleVarNames(appliedNames.current, vars)) root.style.removeProperty(name);
		for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
		root.classList.toggle("dark", colorMode === "dark");
		root.style.colorScheme = colorMode;
		window.lh?.setAppearance?.({ background: vars["--background"]!, foreground: vars["--foreground"]! });
		appliedNames.current = Object.keys(vars);
	}, [vars, colorMode]);
	const onAppearanceChange = useCallback((next: AppearanceSettings | undefined) => setDelta(next), []);
	const value = useMemo(() => ({ appearance, colorMode, onAppearanceChange }), [appearance, colorMode, onAppearanceChange]);
	return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
