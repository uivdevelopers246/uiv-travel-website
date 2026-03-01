-- Drop the old constraint and columns related to geocoding/mapbox
alter table public.activities
  drop constraint if exists activities_geocode_accuracy_check;
  drop column if exists geocode_accuracy;
  drop column if exists geocode_label;
  drop column if exists geocode_feature_id;

