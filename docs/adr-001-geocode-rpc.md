# RPC: set_activity_geocode

## Purpose

`set_activity_geocode` is a Postgres RPC function used to update an activity's geospatial location and related geocode metadata in a controlled and consistent way.

Instead of allowing direct updates to `location_point` and related columns from the application layer, we centralize this logic inside the database.

This ensures:
- Correct geometry construction (PostGIS)
- Consistent SRID usage (4326 / WGS84)
- Atomic updates of all related geocode fields
- Clean separation between business logic and spatial logic

---

## Why We Use an RPC Instead of Direct Updates

### 1. Correct Geometry Handling

PostGIS requires spatial data to be constructed properly:

```sql
st_setsrid(st_makepoint(lng, lat), 4326)
```

Rather than duplicating this logic in multiple services, we encapsulate it in the database.

This prevents:
- Incorrect SRID usage
- Swapped lat/lng values
- Inconsistent spatial formatting
- Hardcoded geometry construction in TypeScript

---

### 2. Single Source of Truth

The RPC ensures that:

- All geocode-related fields are updated together
- Clearing a location sets all related columns to NULL
- The logic remains consistent across create and update flows

Without the RPC, developers might accidentally:
- Update `location_point` but forget `geocode_label`
- Leave partial metadata behind
- Introduce inconsistencies across services

---

### 3. Security + RLS Compatibility

The function runs with the caller's permissions (no `SECURITY DEFINER`).

This means:

- Row-Level Security (RLS) still applies
- Only users allowed to update the activity can execute it successfully
- We can grant `EXECUTE` on the function to `authenticated` only

```sql
revoke all on function ... from public;
grant execute on function ... to authenticated;
```

This prevents anonymous execution.

---

## Function Signature

```sql
set_activity_geocode(
  p_activity_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_accuracy text,
  p_label text,
  p_feature_id text
)
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| p_activity_id | Activity ID to update |
| p_lng | Longitude |
| p_lat | Latitude |
| p_accuracy | Accuracy returned from geocoder |
| p_label | Display label from geocoder |
| p_feature_id | External geocoder feature identifier |

The `p_` prefix stands for **parameter**.  
It is a naming convention used to clearly distinguish function inputs from table columns.

---

## Behavior

### Case 1: Coordinates Provided

If `p_lng` and `p_lat` are not null:

- A geometry point is created using PostGIS
- SRID is set to 4326 (WGS84)
- Metadata columns are updated

```sql
location_point = st_setsrid(st_makepoint(p_lng, p_lat), 4326)
```

---

### Case 2: Coordinates Are Null

If either longitude or latitude is null:

- `location_point` is set to NULL
- All geocode metadata fields are cleared

This allows:
- Removing a location
- Handling failed geocode attempts cleanly

---

## How It Is Called From the Application

The frontend or backend calls:

```ts
supabase.rpc("set_activity_geocode", {
  p_activity_id: activityId,
  p_lng: lng,
  p_lat: lat,
  p_accuracy: accuracy,
  p_label: label,
  p_feature_id: featureId
});
```

The RPC does not return rows (`returns void`).
It performs the update internally.

---

## Architectural Role in the Project

This RPC supports:

- Geocoding via Mapbox/MapTiler
- Spatial search using PostGIS
- Future `/activities/near` queries
- Indexed spatial lookups

It is part of the **geospatial layer** of the application and ensures that the database remains the authority for spatial data integrity.

---

## Summary

We use an RPC because:

- Spatial data must be constructed correctly
- We want centralized, atomic geocode updates
- RLS must remain enforced
- The database should own spatial logic
- It improves maintainability and AI-assisted development

