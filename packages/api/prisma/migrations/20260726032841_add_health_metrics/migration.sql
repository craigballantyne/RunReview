-- CreateTable
CREATE TABLE "sleep" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "sleep_time_sec" INTEGER,
    "nap_time_sec" INTEGER,
    "deep_sleep_sec" INTEGER,
    "light_sleep_sec" INTEGER,
    "rem_sleep_sec" INTEGER,
    "awake_sleep_sec" INTEGER,
    "sleep_start_gmt" TIMESTAMPTZ(3) NOT NULL,
    "sleep_end_gmt" TIMESTAMPTZ(3) NOT NULL,
    "sleep_start_local" TIMESTAMP(3) NOT NULL,
    "sleep_end_local" TIMESTAMP(3) NOT NULL,
    "sleep_score" INTEGER,
    "sleep_score_qualifier" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sleep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_battery" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "charged" INTEGER,
    "drained" INTEGER,
    "start_timestamp_gmt" TIMESTAMPTZ(3) NOT NULL,
    "end_timestamp_gmt" TIMESTAMPTZ(3) NOT NULL,
    "start_timestamp_local" TIMESTAMP(3) NOT NULL,
    "end_timestamp_local" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_battery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_battery_readings" (
    "id" TEXT NOT NULL,
    "body_battery_id" TEXT NOT NULL,
    "reading_index" INTEGER NOT NULL,
    "timestamp_gmt" TIMESTAMPTZ(3) NOT NULL,
    "battery_level" INTEGER NOT NULL,

    CONSTRAINT "body_battery_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sleep_user_id_day_key" ON "sleep"("user_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "body_battery_user_id_day_key" ON "body_battery"("user_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "body_battery_readings_body_battery_id_reading_index_key" ON "body_battery_readings"("body_battery_id", "reading_index");

-- AddForeignKey
ALTER TABLE "sleep" ADD CONSTRAINT "sleep_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_battery" ADD CONSTRAINT "body_battery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_battery_readings" ADD CONSTRAINT "body_battery_readings_body_battery_id_fkey" FOREIGN KEY ("body_battery_id") REFERENCES "body_battery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
