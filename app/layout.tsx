import type { Metadata } from "next";
import AppSessionProvider from "@/components/session-provider";
import ThemeToggle from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Battle Frontier",
  description: "Pokemon TCG testing group analytics"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeToggle />
        <AppSessionProvider>{children}</AppSessionProvider>
        <footer className="siteFooter">
          <div className="container">
            <p className="muted">
              Battle Frontier: prep smart, test together, and keep moving.
            </p>
            <p className="muted">
              Inspired by{" "}
              <a href="https://trainingcourt.app" target="_blank" rel="noreferrer">
                Training Court
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
