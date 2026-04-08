export const accommodationTypes = [
  { value: "hotel", label: "Hotel" },
  { value: "villa", label: "Villa" },
  { value: "apartment", label: "Apartment" },
  { value: "guesthouse", label: "Guesthouse" },
  { value: "resort", label: "Resort" },
  { value: "cottage", label: "Cottage" },
] as const;

export const amenityOptions = [
  { value: "wifi", label: "WiFi" },
  { value: "pool", label: "Pool" },
  { value: "parking", label: "Parking" },
  { value: "air-conditioning", label: "Air Conditioning" },
  { value: "kitchen", label: "Kitchen" },
  { value: "beach-access", label: "Beach Access" },
  { value: "gym", label: "Gym" },
  { value: "spa", label: "Spa" },
  { value: "restaurant", label: "Restaurant" },
  { value: "room-service", label: "Room Service" },
  { value: "laundry", label: "Laundry" },
  { value: "pet-friendly", label: "Pet Friendly" },
] as const;

export const bedroomFilters = [
  { value: "all", label: "Any Bedrooms" },
  { value: "1", label: "1 Bedroom" },
  { value: "2", label: "2 Bedrooms" },
  { value: "3", label: "3 Bedrooms" },
  { value: "4+", label: "4+ Bedrooms" },
] as const;

export const priceRangeFilters = [
  { value: "all", label: "Any Price" },
  { value: "0-100", label: "$0 - $100" },
  { value: "100-200", label: "$100 - $200" },
  { value: "200-300", label: "$200 - $300" },
  { value: "300-500", label: "$300 - $500" },
  { value: "500+", label: "$500+" },
] as const;
