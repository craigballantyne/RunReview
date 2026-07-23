-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ACCOUNT_CREATED', 'ACCOUNT_DELETED', 'PASSWORD_UPDATED', 'PASSWORD_RESET', 'RUN_DATA_IMPORTED', 'RUN_DATA_DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "external_activity_id" BIGINT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "start_time_gmt" TIMESTAMPTZ(3) NOT NULL,
    "start_time_local" TIMESTAMP(3) NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "moving_duration_sec" DOUBLE PRECISION NOT NULL,
    "distance_m" DOUBLE PRECISION NOT NULL,
    "avg_speed_mps" DOUBLE PRECISION,
    "max_speed_mps" DOUBLE PRECISION,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "avg_cadence_spm" DOUBLE PRECISION,
    "max_cadence_spm" DOUBLE PRECISION,
    "elevation_gain_m" DOUBLE PRECISION,
    "elevation_loss_m" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "start_latitude" DOUBLE PRECISION,
    "start_longitude" DOUBLE PRECISION,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "splits" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "split_index" INTEGER NOT NULL,
    "start_time_gmt" TIMESTAMPTZ(3) NOT NULL,
    "distance_m" DOUBLE PRECISION NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "avg_speed_mps" DOUBLE PRECISION,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "avg_cadence_spm" DOUBLE PRECISION,
    "elevation_gain_m" DOUBLE PRECISION,
    "elevation_loss_m" DOUBLE PRECISION,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_zones" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "zone_number" INTEGER NOT NULL,
    "zone_low_bpm" INTEGER,
    "zone_high_bpm" INTEGER,
    "seconds_in_zone" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "hr_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_points" (
    "id" BIGSERIAL NOT NULL,
    "run_id" TEXT NOT NULL,
    "point_index" INTEGER NOT NULL,
    "elapsed_sec" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "elevation_m" DOUBLE PRECISION,
    "heart_rate" INTEGER,
    "speed_mps" DOUBLE PRECISION,

    CONSTRAINT "track_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "file_name" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "total_activities" INTEGER,
    "processed_activities" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_details" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_cache" (
    "id" SERIAL NOT NULL,
    "lat_rounded" DOUBLE PRECISION NOT NULL,
    "lon_rounded" DOUBLE PRECISION NOT NULL,
    "location" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "runs_user_id_start_time_gmt_idx" ON "runs"("user_id", "start_time_gmt");

-- CreateIndex
CREATE UNIQUE INDEX "runs_user_id_external_activity_id_key" ON "runs"("user_id", "external_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "splits_run_id_split_index_key" ON "splits"("run_id", "split_index");

-- CreateIndex
CREATE UNIQUE INDEX "hr_zones_run_id_zone_number_key" ON "hr_zones"("run_id", "zone_number");

-- CreateIndex
CREATE INDEX "track_points_run_id_idx" ON "track_points"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "track_points_run_id_point_index_key" ON "track_points"("run_id", "point_index");

-- CreateIndex
CREATE INDEX "import_jobs_user_id_created_at_idx" ON "import_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_lat_rounded_lon_rounded_key" ON "geocode_cache"("lat_rounded", "lon_rounded");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_zones" ADD CONSTRAINT "hr_zones_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_points" ADD CONSTRAINT "track_points_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

