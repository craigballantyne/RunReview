import multipart from "@fastify/multipart";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: fastify.config.IMPORT_MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  });
});
