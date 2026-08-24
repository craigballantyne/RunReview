import { describe, expect, it } from "vitest";
import { computeWeatherFlags, type WeatherInput } from "../../src/modules/analysis/weather-flags.js";

function weather(overrides: Partial<WeatherInput> = {}): WeatherInput {
  return {
    temperatureC: 10,
    apparentTemperatureC: 8,
    relativeHumidityPct: 82,
    windSpeedMps: 3,
    ...overrides,
  };
}

describe("computeWeatherFlags", () => {
  describe("humidity gating", () => {
    it("does not flag high humidity in the cold", () => {
      // The reference climate's median run is 9.6°C at 82% humidity. Flagging that would fire on
      // most runs and mean nothing — humidity only impairs cooling once it's warm.
      expect(computeWeatherFlags(weather({ temperatureC: 9.6, relativeHumidityPct: 82 })).humidityFlag).toBe(false);
    });

    it("flags high humidity when it is also warm", () => {
      expect(computeWeatherFlags(weather({ temperatureC: 21, relativeHumidityPct: 88 })).humidityFlag).toBe(true);
    });

    it("does not flag warm but dry conditions", () => {
      expect(computeWeatherFlags(weather({ temperatureC: 24, relativeHumidityPct: 45 })).humidityFlag).toBe(false);
    });

    it("requires both sides of the gate at the boundary", () => {
      expect(computeWeatherFlags(weather({ temperatureC: 15, relativeHumidityPct: 81 })).humidityFlag).toBe(true);
      expect(computeWeatherFlags(weather({ temperatureC: 14.9, relativeHumidityPct: 95 })).humidityFlag).toBe(false);
      expect(computeWeatherFlags(weather({ temperatureC: 20, relativeHumidityPct: 80 })).humidityFlag).toBe(false);
    });
  });

  describe("temperature buckets", () => {
    it("buckets across the range", () => {
      expect(computeWeatherFlags(weather({ temperatureC: 2 })).tempBucket).toBe("cold");
      expect(computeWeatherFlags(weather({ temperatureC: 9.6 })).tempBucket).toBe("cool");
      expect(computeWeatherFlags(weather({ temperatureC: 15 })).tempBucket).toBe("mild");
      expect(computeWeatherFlags(weather({ temperatureC: 20 })).tempBucket).toBe("warm");
      expect(computeWeatherFlags(weather({ temperatureC: 26.2 })).tempBucket).toBe("hot");
    });
  });

  describe("wind", () => {
    it("flags above 20 km/h, expressed in stored m/s", () => {
      expect(computeWeatherFlags(weather({ windSpeedMps: 5.5 })).windFlag).toBe(false);
      expect(computeWeatherFlags(weather({ windSpeedMps: 6 })).windFlag).toBe(true);
    });
  });

  describe("heat stress", () => {
    it("derives from apparent temperature, not raw temperature", () => {
      // Same air temperature, different feels-like — the whole point of using the apparent value.
      expect(computeWeatherFlags(weather({ temperatureC: 22, apparentTemperatureC: 16 })).heatStress).toBe("low");
      expect(computeWeatherFlags(weather({ temperatureC: 22, apparentTemperatureC: 27 })).heatStress).toBe("high");
    });

    it("covers the moderate band", () => {
      expect(computeWeatherFlags(weather({ apparentTemperatureC: 20 })).heatStress).toBe("moderate");
    });
  });

  describe("missing data", () => {
    it("returns inert flags when there is no weather at all", () => {
      expect(computeWeatherFlags(null)).toEqual({
        tempBucket: null,
        humidityFlag: false,
        windFlag: false,
        heatStress: null,
      });
    });

    it("degrades per field rather than discarding the whole record", () => {
      const flags = computeWeatherFlags(weather({ apparentTemperatureC: null, relativeHumidityPct: null }));
      expect(flags.tempBucket).toBe("cool");
      expect(flags.heatStress).toBeNull();
      expect(flags.humidityFlag).toBe(false);
    });
  });
});
