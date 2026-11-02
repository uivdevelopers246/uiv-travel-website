import { describe, it, expect, vi } from "vitest";
import { retrieveStayCandidates } from "./accommodations";
import { getAccommodationStayQuote } from "@/lib/accommodation-calendar/service";
vi.mock("@/lib/accommodation-calendar/service", () => ({ getAccommodationStayQuote: vi.fn() }));
describe("stay retrieval", () => {
 it("uses published capacity-compatible bounded rows and excludes unavailable and over-budget quotes", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: ["a", "b", "c"].map(id => ({ id, name: id, image_url: null, parish: null })), error: null }) };
  const client = { from: vi.fn(() => query) };
  vi.mocked(getAccommodationStayQuote).mockResolvedValueOnce({ available: true, total_cents: 10000 } as never).mockResolvedValueOnce({ available: false, total_cents: 0 } as never).mockResolvedValueOnce({ available: true, total_cents: 10001 } as never);
  const result = await retrieveStayCandidates(client as never, { budgetUsd: 100, checkInDate: "2027-02-01", checkOutDate: "2027-02-03" }, 2);
  expect(result.map(x => x.id)).toEqual(["a"]);
  expect(query.eq).toHaveBeenCalledWith("status", "published");
  expect(query.gte).toHaveBeenCalledWith("max_guest_capacity", 2);
  expect(query.limit).toHaveBeenCalledWith(30);
  expect(getAccommodationStayQuote).toHaveBeenCalledWith(client, "a", "2027-02-01", "2027-02-03");
 });
});
