/**
 * Production Node host for the built TanStack Start app.
 *
 * `vite build` emits a Web-Fetch handler (dist/server/server.js exports
 * { default: { fetch } }), not a listening server — running it directly does
 * nothing. This bridges it onto node:http so a platform that just runs
 * `node server-node.mjs` (Render, Fly, a VM) can serve the app:
 *
 *   - /assets/* and other built files are served straight from dist/client
 *   - everything else goes to the SSR fetch handler
 *
 * Usage:  PORT=3000 node server-node.mjs   (PORT defaults to 3000)
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(ROOT, "dist", "client");
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

const { default: serverEntry } = await import("./dist/server/server.js");

/** Resolve a URL path to a real file inside dist/client, or null. */
function resolveStatic(urlPath) {
  // normalize() collapses "..", and the prefix check keeps traversal inside the
  // client directory.
  const candidate = normalize(join(CLIENT_DIR, decodeURIComponent(urlPath)));
  if (!candidate.startsWith(CLIENT_DIR)) return null;
  if (!existsSync(candidate)) return null;
  const stat = statSync(candidate);
  return stat.isFile() ? candidate : null;
}

/** node:http request -> Web Request */
function toWebRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((one) => headers.append(k, one));
    else if (v != null) headers.set(k, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url, "http://localhost").pathname;

    const file = urlPath === "/" ? null : resolveStatic(urlPath);
    if (file) {
      const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
      // Vite fingerprints filenames under /assets, so those are immutable.
      const cache = urlPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
      res.writeHead(200, { "content-type": type, "cache-control": cache });
      createReadStream(file).pipe(res);
      return;
    }

    const webRes = await serverEntry.fetch(toWebRequest(req), {}, {});
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("[server] request failed:", err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SensePro+ frontend listening on http://0.0.0.0:${PORT}`);
});
