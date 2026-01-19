-- Enable RLS
alter table public.vendors enable row level security;
alter table public.activities enable row level security;
alter table public.site_admins enable row level security;

-- ACTIVITIES: Public can read published activities
