-- Run manually in your own CloudBase administrator SQL console AFTER migration.
-- Register your application account first. Replace both values below.
-- user_sub is the identity used by auth.uid(), not auth.users' numeric primary key.
DO $$
DECLARE
 target_project text := 'your-cloudbase-env-id';
 target_sub text := 'replace-with-your-auth-user-sub';
BEGIN
 IF target_project = 'your-cloudbase-env-id' OR target_sub = 'replace-with-your-auth-user-sub' THEN
  RAISE EXCEPTION 'Replace the project and user identity before running';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE project=target_project AND sub=target_sub) <> 1 THEN
  RAISE EXCEPTION 'Expected exactly one registered user in the selected project';
 END IF;
 INSERT INTO public.site_admins(user_id) VALUES(target_sub) ON CONFLICT DO NOTHING;
END $$;
