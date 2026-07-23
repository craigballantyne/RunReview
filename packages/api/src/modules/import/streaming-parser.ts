import { createReadStream } from "node:fs";
import streamChainModule from "stream-chain";
import streamJsonModule from "stream-json";
import PickModule from "stream-json/filters/Pick.js";
import StreamArrayModule from "stream-json/streamers/StreamArray.js";

const { chain } = streamChainModule;
const { parser } = streamJsonModule;
const { pick } = PickModule;
const { streamArray } = StreamArrayModule;

const ACTIVITY_COUNT_PREFIX_BYTES = 4096;

/**
 * Reads just the first few KB of the file to find "activity_count" without a full parse pass.
 * Returns null if it can't be found there (e.g. unusual field ordering) — the caller should
 * treat the total as unknown rather than fail the import over a cosmetic progress figure.
 */
export async function peekActivityCount(filePath: string): Promise<number | null> {
  const prefix = await new Promise<string>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 0, end: ACTIVITY_COUNT_PREFIX_BYTES, encoding: "utf8" });
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk;
    });
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });

  const match = prefix.match(/"activity_count"\s*:\s*(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * Streams the "activities" array from a (potentially huge) import file one element at a time,
 * so memory usage stays bounded to roughly one activity's nested data rather than the whole file.
 */
export async function* streamActivities(filePath: string): AsyncGenerator<unknown> {
  const pipeline = chain([createReadStream(filePath), parser(), pick({ filter: "activities" }), streamArray()]);

  for await (const item of pipeline as AsyncIterable<{ key: number; value: unknown }>) {
    yield item.value;
  }
}
