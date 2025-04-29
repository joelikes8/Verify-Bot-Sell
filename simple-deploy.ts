// Simple Deno Deploy entry point for testing
import { Application, Router } from "https://deno.land/x/oak/mod.ts";

// Configure environment
const PORT = Deno.env.get("PORT") || "8000";

const app = new Application();
const router = new Router();

// Root endpoint to verify service is running
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    message: "Discord Verify Bot API is running - Test",
    timestamp: new Date().toISOString(),
  };
});

// Health check endpoint
router.get("/healthz", (ctx) => {
  ctx.response.body = { status: "ok" };
});

// Use the router
app.use(router.routes());
app.use(router.allowedMethods());

// Log all requests
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Start the server
app.addEventListener("listen", ({ port }) => {
  console.log(`Server is running on port ${port}`);
});

await app.listen({ port: Number(PORT) });