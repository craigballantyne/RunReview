-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "weather_id" INTEGER;

-- CreateTable
CREATE TABLE "weather_hourly" (
    "id" SERIAL NOT NULL,
    "lat_rounded" DOUBLE PRECISION NOT NULL,
    "lon_rounded" DOUBLE PRECISION NOT NULL,
    "timestamp_utc" TIMESTAMPTZ(3) NOT NULL,
    "temperature_c" DOUBLE PRECISION,
    "apparent_temperature_c" DOUBLE PRECISION,
    "relative_humidity_pct" INTEGER,
    "precipitation_mm" DOUBLE PRECISION,
    "weather_code" INTEGER,
    "cloud_cover_pct" INTEGER,
    "wind_speed_mps" DOUBLE PRECISION,
    "wind_direction_deg" INTEGER,
    "wind_gusts_mps" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weather_hourly_lat_rounded_lon_rounded_timestamp_utc_key" ON "weather_hourly"("lat_rounded", "lon_rounded", "timestamp_utc");

-- CreateIndex
CREATE INDEX "runs_weather_id_idx" ON "runs"("weather_id");

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_weather_id_fkey" FOREIGN KEY ("weather_id") REFERENCES "weather_hourly"("id") ON DELETE SET NULL ON UPDATE CASCADE;
