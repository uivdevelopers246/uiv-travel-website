select
  u.id,
  u.email,
  sa.user_id as is_admin
from auth.users u
left join public.site_admins sa on sa.user_id = u.id
where u.email = 'taonichol86@gmail.com';

