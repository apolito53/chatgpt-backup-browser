import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const projectRoot = resolve(__dirname, "..");
const host = "127.0.0.1";
const requestedPort = Number.parseInt(process.env.CHATGPT_BROWSER_PORT || "4173", 10);
const startPage = process.env.CHATGPT_BROWSER_PAGE || "index.html";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

function send(response, statusCode, body, type = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": type });
  response.end(body);
}

function resolveRequestPath(requestUrl) {
  const parsed = new URL(requestUrl, `http://${host}`);
  const pathname = parsed.pathname === "/" ? `/${startPage}` : parsed.pathname;
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  return resolve(projectRoot, `.${safePath}`);
}

function handleRequest(request, response) {
  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath.startsWith(projectRoot)) {
    send(response, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    send(response, 404, "Not found");
    return;
  }

  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    const indexPath = join(filePath, startPage);
    if (!existsSync(indexPath)) {
      send(response, 404, "Not found");
      return;
    }
    response.writeHead(302, { Location: `/${startPage}` });
    response.end();
    return;
  }

  const contentType = contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}

function listen(port) {
  const server = http.createServer(handleRequest);

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }

    console.error("Server failed:", error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`ChatGPT Backup Browser running at http://${host}:${actualPort}/${startPage}`);
  });
}

listen(Number.isFinite(requestedPort) ? requestedPort : 4173);
