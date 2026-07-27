# SensePro+ — Design System ("Command Center")

Single source of truth for UI tokens. Every UI tool prompt and every frontend change uses these
exactly. Do not invent new tokens. Skills must not override this file.

Aesthetic: a calm, premium operations console — dark, high-contrast, cinematic, confident.
Mission-control meets modern SaaS. Restrained motion, never busy.

Color tokens (CSS variables):
  --bg:#0B1120; --surface:#111A2E; --surface-2:#16213B; --line:#22304D;
  --ink:#E8EEF7; --muted:#8094B0;
  --primary:#3B82F6;  --primary-deep:#1D4ED8;   /* electric cobalt */
  --accent:#22D3EE;   /* single cyan accent, used sparingly for live/active */
  --ok:#34D399; --warn:#FBBF24; --bad:#F87171;

Type: display = "Archivo" (700-900); body = Inter; data/labels = "IBM Plex Mono".
Surfaces: glassy panels (surface @ ~92% + 1px --line), 14px radius, soft shadow.
Background: --bg with a faint 32px dot/grid and one slow cobalt radial glow top-left.
Data style: monospace labels, animated count-up numbers, a small pulsing dot for "live".
Motion: framer-motion; 150-250ms ease-out; respect prefers-reduced-motion.
Accents: React Bits sparingly (one hero/background effect + count-up + a spotlight card).
Accessibility: AA contrast, visible focus rings, keyboard reachable.
Stack: React + TypeScript + Vite + Tailwind + shadcn/ui. No HTML <form> posts — handlers only.
Rule: do NOT over-animate data tables or the live capture view; the camera feed is the spectacle.
