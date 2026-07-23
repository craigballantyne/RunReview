import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ host: "0.0.0.0", port: app.config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
