-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "run_insights" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "layer1_status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "layer1_version" INTEGER,
    "layer1_computed_at" TIMESTAMP(3),
    "layer1_error" TEXT,
    "lap_mode" TEXT,
    "lap_mode_source" TEXT,
    "run_type_by_distance" TEXT,
    "hr_zone" TEXT,
    "hr_zone_distribution" JSONB,
    "split_pattern" TEXT,
    "elevation_bucket" TEXT,
    "elevation_gain_m" DOUBLE PRECISION,
    "temp_bucket" TEXT,
    "humidity_flag" BOOLEAN,
    "wind_flag" BOOLEAN,
    "heat_stress" TEXT,
    "segment_roles" JSONB,
    "raw_point_flags" JSONB,
    "layer2_status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "layer2_version" INTEGER,
    "layer2_computed_at" TIMESTAMP(3),
    "layer2_error" TEXT,
    "workout_structure" TEXT,
    "warmup_cooldown_detected" BOOLEAN,
    "walk_break_pattern" BOOLEAN,
    "effort_pace_mismatch" TEXT,
    "fade_detected" BOOLEAN,
    "surge_pattern" BOOLEAN,
    "even_effort_despite_terrain" BOOLEAN,
    "parsed_intent" JSONB,
    "layer3_status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "layer3_version" INTEGER,
    "layer3_computed_at" TIMESTAMP(3),
    "layer3_error" TEXT,
    "narrative" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_best_efforts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "distance_m" INTEGER NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "start_offset_m" DOUBLE PRECISION NOT NULL,
    "is_pr" BOOLEAN NOT NULL DEFAULT false,
    "start_time_gmt" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_best_efforts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_insights_run_id_key" ON "run_insights"("run_id");

-- CreateIndex
CREATE INDEX "run_insights_user_id_workout_structure_run_type_by_distance_idx" ON "run_insights"("user_id", "workout_structure", "run_type_by_distance");

-- CreateIndex
CREATE INDEX "run_insights_layer1_status_idx" ON "run_insights"("layer1_status");

-- CreateIndex
CREATE INDEX "run_insights_layer2_status_idx" ON "run_insights"("layer2_status");

-- CreateIndex
CREATE INDEX "run_insights_layer3_status_idx" ON "run_insights"("layer3_status");

-- CreateIndex
CREATE INDEX "run_best_efforts_user_id_distance_m_start_time_gmt_idx" ON "run_best_efforts"("user_id", "distance_m", "start_time_gmt");

-- CreateIndex
CREATE UNIQUE INDEX "run_best_efforts_run_id_distance_m_key" ON "run_best_efforts"("run_id", "distance_m");

-- AddForeignKey
ALTER TABLE "run_insights" ADD CONSTRAINT "run_insights_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_insights" ADD CONSTRAINT "run_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_best_efforts" ADD CONSTRAINT "run_best_efforts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_best_efforts" ADD CONSTRAINT "run_best_efforts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
