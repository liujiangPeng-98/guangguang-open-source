-- Fresh CloudBase PostgreSQL environments only. Do not apply to an existing installation.
-- Later migrations extend these tables. auth/storage schemas are supplied by CloudBase.
CREATE TABLE public.checkins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.checkin_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Reserved scaffold tables; map catalog currently comes from public/maps.
CREATE TABLE public.regions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.region_marks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkins,public.checkin_photos,public.regions,public.region_marks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.checkins,public.checkin_photos,public.regions,public.region_marks TO service_role;
