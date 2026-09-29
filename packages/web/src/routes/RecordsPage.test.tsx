import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DistanceRecord } from "@run-review/shared";
import { RecordsPage } from "./RecordsPage.js";

const mockUseRecords = vi.hoisted(() => vi.fn());
vi.mock("../api/useRecords.js", () => ({ useRecords: mockUseRecords }));

function entry(runId: string, durationSec: number, date: string) {
  return { runId, activityName: `Run ${runId}`, durationSec, startTimeLocal: `${date}T08:00:00.0` };
}

const SAMPLE: DistanceRecord[] = [
  {
    distanceM: 1000,
    label: "1 km",
    category: "km",
    entries: [entry("a", 220, "2026-04-28"), entry("b", 238, "2026-05-30"), entry("c", 243, "2025-07-10")],
  },
  { distanceM: 1609, label: "1 mile", category: "mi", entries: [entry("d", 396, "2026-05-30")] },
  { distanceM: 21097, label: "Half marathon", category: "race", entries: [entry("e", 7036, "2025-12-24")] },
];

function renderPage(data: DistanceRecord[] | null, state: { isLoading?: boolean; isError?: boolean } = {}) {
  mockUseRecords.mockReturnValue({
    data: data === null ? undefined : { distances: data },
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
  return render(
    <MemoryRouter>
      <RecordsPage />
    </MemoryRouter>,
  );
}

describe("RecordsPage", () => {
  it("groups distances into kilometre, mile and race columns", () => {
    renderPage(SAMPLE);

    expect(screen.getByText("Kilometres")).toBeInTheDocument();
    expect(screen.getByText("Miles")).toBeInTheDocument();
    expect(screen.getByText("Race distances")).toBeInTheDocument();
  });

  it("titles each container with its distance", () => {
    renderPage(SAMPLE);

    expect(screen.getByText("1 km")).toBeInTheDocument();
    expect(screen.getByText("1 mile")).toBeInTheDocument();
    expect(screen.getByText("Half marathon")).toBeInTheDocument();
  });

  it("lists up to three times, fastest first", () => {
    renderPage(SAMPLE);
    const card = screen.getByText("1 km").closest("section")!;

    const times = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(times).toHaveLength(3);
    expect(times[0]).toContain("3:40");
    expect(times[2]).toContain("4:03");
  });

  it("formats times over an hour with an hours segment", () => {
    // A half marathon is around two hours; "117:16" would be wrong.
    renderPage(SAMPLE);
    const card = screen.getByText("Half marathon").closest("section")!;
    expect(within(card).getByText("1:57:16")).toBeInTheDocument();
  });

  it("links each date to its activity", () => {
    renderPage(SAMPLE);
    const card = screen.getByText("1 km").closest("section")!;

    const link = within(card).getAllByRole("link")[0]!;
    expect(link).toHaveAttribute("href", "/activities/a");
    expect(link.textContent).toMatch(/28 Apr 2026/);
  });

  it("omits a column with no records rather than leaving an empty heading", () => {
    // Most athletes have no marathon record for a long time.
    renderPage(SAMPLE.filter((d) => d.category !== "race"));
    expect(screen.queryByText("Race distances")).not.toBeInTheDocument();
  });

  it("explains itself when there are no records at all", () => {
    renderPage([]);
    expect(screen.getByText(/No records yet/)).toBeInTheDocument();
  });

  it("reports loading and error states", () => {
    renderPage(null, { isLoading: true });
    expect(screen.getByText(/Loading records/)).toBeInTheDocument();

    renderPage(null, { isError: true });
    expect(screen.getByText(/Couldn’t load your records/)).toBeInTheDocument();
  });
});
