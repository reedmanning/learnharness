import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Script from "next/script";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./session-notes.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { appearanceVariables, resolveAppearance, systemThemeScript } from "@/src/core";
import { settingsStore } from "@/src/server";

// Preferences belong to the running profile, never a build-time snapshot.
export const dynamic = "force-dynamic";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const initialAppearance = settingsStore.readSettings()?.appearance;
	const appearance = resolveAppearance(initialAppearance);
	const mode = appearance.mode === "light" ? "light" : "dark";
	return (
		<html lang="en" suppressHydrationWarning className={`${mode === "dark" ? "dark " : ""}${ui.variable} ${prose.variable}`}
			style={{ ...appearanceVariables(appearance, mode), colorScheme: mode } as CSSProperties}>
			<body className="min-h-dvh antialiased">
			{appearance.mode === "system" && <Script id="system-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: systemThemeScript(appearance) }} />}
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<AppearanceProvider initialAppearance={initialAppearance}>
					<SidebarProvider>
						<ActivityProvider>
							<AppShell>{children}</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</body>
		</html>
	);
}
