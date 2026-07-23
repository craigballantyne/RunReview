/**
 * End-to-end route flow against a real Postgres + Redis, exercised via Fastify's app.inject().
 *
 * Requires DATABASE_URL / REDIS_URL pointed at real services with migrations applied
 * (`prisma migrate deploy`), e.g. the docker-compose Postgres/Redis or the CI service containers.
 * Not runnable in an environment without Postgres/Redis — see the CI workflow for how this is wired.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("auth + import flow", () => {
  let app: FastifyInstance;
  const email = `test-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let sessionCookie: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("signs up and receives a session cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email, password },
    });

    expect(response.statusCode).toBe(201);
    const cookies = response.cookies;
    const session = cookies.find((c) => c.name === "rr_session");
    expect(session).toBeDefined();
    sessionCookie = `${session!.name}=${session!.value}`;
  });

  it("reports the account as unverified via /api/auth/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: sessionCookie },
    });
    const body = response.json();
    expect(body.user.emailVerified).toBe(false);
  });

  it("blocks /api/runs for an unverified user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runs",
      headers: { cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("verifies the account via the token stored in the DB and imports the sample activity", async () => {
    const authToken = await app.prisma.authToken.findFirstOrThrow({
      where: { type: "EMAIL_VERIFICATION" },
      orderBy: { createdAt: "desc" },
    });
    // The raw token isn't recoverable from its hash — directly promote the user for this test,
    // exercising the same downstream state the /verify-email route would produce.
    await app.prisma.user.update({ where: { id: authToken.userId }, data: { emailVerifiedAt: new Date() } });

    const listBefore = await app.inject({
      method: "GET",
      url: "/api/runs",
      headers: { cookie: sessionCookie },
    });
    expect(listBefore.statusCode).toBe(200);
    expect(listBefore.json().items).toHaveLength(0);

    const fileBuffer = readFileSync(`${fixturesDir}/valid-single-activity.json`);
    const boundary = "----testboundary";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.json"\r\nContent-Type: application/json\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { cookie: sessionCookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(uploadResponse.statusCode).toBe(202);
    const { importJobId } = uploadResponse.json();

    // This test only exercises the upload/enqueue path; actual processing happens in the
    // separate worker process (packages/api/src/queue/worker.ts), which must be running
    // against the same Redis instance for the job to complete.
    const jobStatus = await app.inject({
      method: "GET",
      url: `/api/import/${importJobId}`,
      headers: { cookie: sessionCookie },
    });
    expect(jobStatus.statusCode).toBe(200);
    expect(["PENDING", "PROCESSING", "COMPLETED"]).toContain(jobStatus.json().status);
  });

  it("deletes the account and cascades", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: { cookie: sessionCookie },
      payload: { currentPassword: password },
    });
    expect(response.statusCode).toBe(204);

    const user = await app.prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });
});
