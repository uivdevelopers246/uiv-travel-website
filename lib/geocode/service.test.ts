import { describe, it, expect, vi } from "vitest";
import { geocodeAddress } from "./service";

// --- Helpers (similar vibe to makeMockSupabase in your activities tests) ---

type MockFeature = {
  center?: [number, number]; // [lng, lat]
  place_type?: string[];
  place_name?: string;
  id?: string;
};

function makeMapboxResponse(features: MockFeature[]) {
  return { type: "FeatureCollection", features };
}

function makeMockFetchOk(json: any) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => json,
  })) as any;
}

function makeMockFetchNotOk(status = 500, body: any = { message: "provider error" }) {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => body,
  })) as any;
}

function makeMockFetchThrows() {
  return vi.fn(async () => {
    throw new Error("Network error");
  }) as any;
}

// --- Tests ---

describe("geocodeAddress", () => {
  it("throws when address is missing/empty", async () => {
    const fetchFn = makeMockFetchOk(makeMapboxResponse([]));

    await expect(
      geocodeAddress("   ", { country: "BB" }, { fetchFn, accessToken: "test" })
    ).rejects.toThrow("Address is required");
  });

  it("returns precise when Mapbox returns place_type=address", async () => {
    const fetchFn = makeMockFetchOk(
      makeMapboxResponse([
        {
          center: [-59.6, 13.1],
          place_type: ["address"],
          place_name: "Some Address, Barbados",
          id: "feat.123",
        },
      ])
    );

    const res = await geocodeAddress(
      "Some Address",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).not.toBeNull();
    expect(res?.quality).toBe("precise");
    expect(res?.lng).toBeCloseTo(-59.6);
    expect(res?.lat).toBeCloseTo(13.1);
    expect(res?.label).toBe("Some Address, Barbados");
    expect(res?.featureId).toBe("feat.123");
  });

  it("returns precise when Mapbox returns place_type=poi", async () => {
    const fetchFn = makeMockFetchOk(
      makeMapboxResponse([
        {
          center: [-59.58, 13.09],
          place_type: ["poi"],
          place_name: "Some Landmark, Barbados",
          id: "poi.1",
        },
      ])
    );

    const res = await geocodeAddress(
      "Some Landmark",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).not.toBeNull();
    expect(res?.quality).toBe("precise");
  });

  it("returns approx when Mapbox returns place_type=street", async () => {
    const fetchFn = makeMockFetchOk(
      makeMapboxResponse([
        {
          center: [-59.59, 13.12],
          place_type: ["street"],
          place_name: "Bonnetts Road, Barbados",
          id: "street.1",
        },
      ])
    );

    const res = await geocodeAddress(
      "Bonnetts Road, Brittons Hill, St. Michael",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).not.toBeNull();
    expect(res?.quality).toBe("approx");
  });

  it("returns approx when Mapbox returns place_type=locality", async () => {
    const fetchFn = makeMockFetchOk(
      makeMapboxResponse([
        {
          center: [-59.61, 13.11],
          place_type: ["locality"],
          place_name: "Brittons Hill, Barbados",
          id: "locality.1",
        },
      ])
    );

    const res = await geocodeAddress(
      "Brittons Hill",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).not.toBeNull();
    expect(res?.quality).toBe("approx");
  });

  it("returns null when Mapbox returns no features", async () => {
    const fetchFn = makeMockFetchOk(makeMapboxResponse([]));

    const res = await geocodeAddress(
      "Definitely Not A Real Place",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).toBeNull();
  });

  it("returns null when Mapbox returns a too-broad place_type (region/place/country)", async () => {
    const fetchFn = makeMockFetchOk(
      makeMapboxResponse([
        {
          center: [-59.55, 13.2],
          place_type: ["region"],
          place_name: "St. Michael, Barbados",
          id: "region.1",
        },
      ])
    );

    const res = await geocodeAddress(
      "St. Michael",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(res).toBeNull();
  });

  it("throws a normal Error when Mapbox responds non-OK", async () => {
    const fetchFn = makeMockFetchNotOk(500);

    await expect(
      geocodeAddress("Anything", { country: "BB" }, { fetchFn, accessToken: "test" })
    ).rejects.toThrow("Geocoding provider error");
  });

  it("throws a normal Error when fetch throws (network failure)", async () => {
    const fetchFn = makeMockFetchThrows();

    await expect(
      geocodeAddress("Anything", { country: "BB" }, { fetchFn, accessToken: "test" })
    ).rejects.toThrow("Geocoding provider error");
  });

  it("includes Barbados bias params in the outbound request (country=BB, limit=1)", async () => {
    const fetchFn = makeMockFetchOk(makeMapboxResponse([]));

    await geocodeAddress(
      "Bonnetts Road",
      { country: "BB" },
      { fetchFn, accessToken: "test" }
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);

    const url = String((fetchFn as any).mock.calls[0][0]);
    expect(url).toContain("country=BB");
    expect(url).toContain("limit=1");
  });
});
