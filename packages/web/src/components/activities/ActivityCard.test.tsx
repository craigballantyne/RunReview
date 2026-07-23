import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RunListItem } from "@run-review/shared";
import { ActivityCard } from "./ActivityCard.js";

const sampleRun: RunListItem = {
  id: "run-1",
  activityName: "City of Edinburgh - Benchmark Run",
  activityType: "running",
  startTimeLocal: "2021-07-04T20:25:53.0",
  location: "Edinburgh, United Kingdom",
  distanceM: 1508.48,
  movingDurationSec: 512,
};

describe("ActivityCard", () => {
  it("renders title, date, location, distance and pace", () => {
    render(<ActivityCard run={sampleRun} isSelected={false} onSelect={() => {}} />);

    expect(screen.getByText("City of Edinburgh - Benchmark Run")).toBeInTheDocument();
    expect(screen.getByText(/4 Jul 2021/)).toBeInTheDocument();
    expect(screen.getByText(/Edinburgh, United Kingdom/)).toBeInTheDocument();
    expect(screen.getByText("1.51 km")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<ActivityCard run={sampleRun} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("omits the location separator when location is null", () => {
    render(<ActivityCard run={{ ...sampleRun, location: null }} isSelected={false} onSelect={() => {}} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
