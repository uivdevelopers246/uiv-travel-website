export type GeocodeQuality = "precise" | "approx";

export type GeocodeResult = {
    lat: number;
    lng: number;
    quality: GeocodeQuality;
    label?: string;
    featureId: string;
};

export type GeocodeOptions = {
    country?: string;        //e.g BB
    limit?: number;         // e.g. 1 (top result)
    proximity?: {lng: number , lat: number}; // bias results near a point
    bbox?: [number, number, number, number];  // [minLng, minLat, maxLng, maxLat]
    includeBarbadosHint?: boolean; // append ", Barbados" to queries for MVP
};


export type FetchFn = typeof fetch;

export async function geocodeAddress (
    address: string,
    options: GeocodeOptions = {},
    deps: { fetchFn?: FetchFn; accessToken?: string } = {}
) : Promise<GeocodeResult | null> {

    const trimmedAddress = address.trim();
    if (trimmedAddress.length === 0) {
        throw new Error("Address is required")
    }

    const country = options.country ?? "BB";
    const limit = options.limit ?? 1;
    const includeBarbadosHint = options.includeBarbadosHint ?? true;                            

    const query = includeBarbadosHint && !trimmedAddress.toLowerCase().includes("barbados") ? `${trimmedAddress}, Barbados` : trimmedAddress;

    const fetchFn = deps.fetchFn ?? fetch;
    const token = deps.accessToken ?? process.env.MAPBOX_ACCESS_TOKEN;

    if (!token) {
        throw new Error("Missing Mapbox access token") // need to add a fastfail test for when the token is missing
    }

    const encodedQuery = encodeURIComponent(query);
    const baseUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json`;

    const url = new URL(baseUrl)
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", country);
    url.searchParams.set("limit", String(limit));


    const prox = options.proximity;
    if (prox && Number.isFinite(prox.lng) && Number.isFinite(prox.lat)) {
        url.searchParams.set("proximity", `${prox.lng},${prox.lat}`);
    }

    const bbox = options.bbox;
    if (bbox && bbox.length === 4 && bbox.every(Number.isFinite)) {
        url.searchParams.set("bbox", bbox.join(","));
    }

    let res: Response;
    try {
        res = await fetchFn(url.toString());
    } catch (error) {
        throw new Error("Geocoding provider error");
    }
    
    if (!res.ok) {
        throw new Error("Geocoding provider error")
    }

    let data: any;
    try {
        data = await res.json();
    } catch {
        throw new Error("Geocoding provider error");
    }

    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0){
        return null;
    }

    const feature = features[0];
    if (!feature) return null;

    const placeType: unknown = feature.place_type;
    if (!Array.isArray(placeType)) return null;

    let quality: GeocodeQuality | null = null;
    if (placeType.includes("address") || placeType.includes("poi")) {
        quality = "precise";
    } else if (
        placeType.includes("street") ||
        placeType.includes("neighborhood") ||
        placeType.includes("locality")
    ) {
        quality = "approx";
    } else {
        return null; // too broad (place/region/country/etc.)
    }
    
    const center: unknown = feature.center;
    if (!Array.isArray(center) || center.length < 2) return null;
  
    const lng = center[0];
    const lat = center[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  
    return {
        lat,
        lng,
        quality,
        label: typeof feature.place_name === "string" ? feature.place_name : undefined,
        featureId: typeof feature.id === "string" ? feature.id : undefined,
    };  
}