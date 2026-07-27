/**
 * Renders a minimal branded error page for catastrophic SSR failures.
 * Returns raw HTML string — no React dependency on the server error path.
 */
export function renderErrorPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Server Error · SensePro+</title>
  <style>
    body {
      margin: 0;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: #07070A;
      color: #F0EDE6;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .box {
      text-align: center;
      max-width: 420px;
      padding: 2rem;
    }
    h1 { font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem; }
    p { color: #6B6B78; font-size: 0.875rem; line-height: 1.6; margin: 0 0 1.5rem; }
    a {
      display: inline-block;
      padding: 0.6rem 1.4rem;
      background: #F59E0B;
      color: #07070A;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
    }
    a:hover { background: #D97706; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-size: 0.65rem; color: #6B6B78; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Something went wrong</h1>
    <p>The server encountered an error rendering this page. This has been logged. Try refreshing or return to the console.</p>
    <a href="/">Return to console</a>
    <div class="mono">SensePro+ · server error</div>
  </div>
</body>
</html>`;
}
