import { type Request, type Response, type NextFunction } from "express";

/**
 * HTTP request logger middleware.
 * Captures method, URL, status code, and response time for every request.
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const timestamp = new Date().toISOString();
    const statusCode = res.statusCode;

    // Colour-code status: green 2xx, yellow 3xx, red 4xx/5xx
    const colour =
      statusCode < 300 ? "\x1b[32m" : statusCode < 400 ? "\x1b[33m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(
      `${colour}[${timestamp}] ${method} ${originalUrl} → ${statusCode} (${durationMs}ms)${reset}`
    );
  });

  next();
}
