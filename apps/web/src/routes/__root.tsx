import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/lib/theme";

import appCss from "../styles.css?url";


function NotFoundComponent() {
  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel max-w-md p-8 text-center">
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Error · 404
        </div>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Signal lost
        </h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          The route you dialed doesn't exist on this console.
        </p>
        <div className="mt-6">
          <Link
            to="/capture"
            className="inline-flex h-11 items-center justify-center rounded-md bg-[color:var(--primary)] px-5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--primary-deep)]"
          >
            Return to capture
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error("[SensePro+] Uncaught render error:", error);
  }, [error]);

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel max-w-md p-8 text-center">
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--bad)]">
          Fault · runtime
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[color:var(--ink)]">
          This console dropped out
        </h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Something failed while rendering. Retry, or return to capture.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-md bg-[color:var(--primary)] px-5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--primary-deep)]"
          >
            Retry
          </button>
          <a
            href="/capture"
            className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
          >
            Capture
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SensePro+ · Classroom Command Center" },
      {
        name: "description",
        content:
          "SensePro+ is a dark, cinematic classroom operations console for browser-based attendance, proctor review, and fairness-aware class-level analytics.",
      },
      { name: "theme-color", content: "#07070A" },
      { property: "og:title", content: "SensePro+ · Classroom Command Center" },
      {
        property: "og:description",
        content:
          "Mission-control for the classroom: attendance, proctor review, and fairness-aware engagement analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
