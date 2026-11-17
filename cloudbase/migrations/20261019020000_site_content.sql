-- Homepage content is public; drafts and edits are restricted to explicit administrators.
-- Rollback: revoke RPC execute first; retain the tables/assets to preserve content.
CREATE TABLE public.site_admins (user_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.site_content (
 id text PRIMARY KEY CHECK(id='home'), draft jsonb NOT NULL DEFAULT '{}', published jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, updated_by text
);
ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_admins,public.site_content FROM anon,authenticated;
GRANT ALL ON public.site_admins,public.site_content TO service_role;
INSERT INTO public.site_content(id) VALUES('home');
-- No default administrator. See cloudbase/bootstrap-admin.example.sql.

CREATE FUNCTION public.is_site_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.role()='authenticated' AND EXISTS(SELECT 1 FROM public.site_admins WHERE user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;
CREATE FUNCTION public.site_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('admin',public.is_site_admin());
$$;
REVOKE ALL ON FUNCTION public.site_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_access() TO authenticated;
CREATE FUNCTION public.get_home_content() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT published FROM public.site_content WHERE id='home';
$$;
REVOKE ALL ON FUNCTION public.get_home_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_content() TO anon,authenticated;
CREATE FUNCTION public.admin_home_content() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(public.is_site_admin(),false) THEN RAISE EXCEPTION '仅管理员可访问' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('draft',draft,'published',published,'version',version,'publishedAt',published_at) FROM public.site_content WHERE id='home');
END $$;
REVOKE ALL ON FUNCTION public.admin_home_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_home_content() TO authenticated;
CREATE FUNCTION public.save_home_content(p_content jsonb,p_version integer,p_publish boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_version integer; v_slide jsonb; v_key text;
BEGIN
 IF NOT coalesce(public.is_site_admin(),false) THEN RAISE EXCEPTION '仅管理员可修改' USING ERRCODE='42501'; END IF;
 IF p_content IS NULL OR jsonb_typeof(p_content)<>'object' OR octet_length(p_content::text)>60000
 OR jsonb_typeof(p_content->'hero') IS DISTINCT FROM 'object' OR jsonb_typeof(p_content->'slides') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_content->'autoplay') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_content->'intervalSec') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION '展示配置格式无效'; END IF;
 IF (p_content->>'intervalSec')::numeric NOT BETWEEN 3 AND 30 OR (p_content->>'intervalSec')::numeric<>trunc((p_content->>'intervalSec')::numeric)
 OR jsonb_array_length(p_content->'slides') NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION '轮播需1至8张，间隔为3至30秒整数'; END IF;
 FOREACH v_key IN ARRAY ARRAY['eyebrow','titleLine1','titleAccent','titleLine2','slogan','description'] LOOP
 IF jsonb_typeof(p_content->'hero'->v_key) IS DISTINCT FROM 'string' OR length(trim(p_content->'hero'->>v_key)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION '首页文案长度无效'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_content->'slides') s WHERE s->>'enabled'='true') THEN RAISE EXCEPTION '至少启用一张轮播图'; END IF;
 IF (SELECT count(DISTINCT s->>'id') FROM jsonb_array_elements(p_content->'slides') s)<>jsonb_array_length(p_content->'slides') THEN RAISE EXCEPTION '轮播标识不能重复'; END IF;
 FOR v_slide IN SELECT value FROM jsonb_array_elements(p_content->'slides') LOOP
 IF jsonb_typeof(v_slide)<>'object' OR jsonb_typeof(v_slide->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION '轮播数据无效'; END IF;
 FOREACH v_key IN ARRAY ARRAY['id','image','alt','title','subtitle','caption'] LOOP
 IF jsonb_typeof(v_slide->v_key) IS DISTINCT FROM 'string' OR length(trim(v_slide->>v_key))<1 OR length(v_slide->>v_key)>(CASE WHEN v_key='image' THEN 2000 ELSE 160 END) THEN RAISE EXCEPTION '轮播字段长度无效'; END IF;
 END LOOP;
 IF v_slide->>'image' !~ '^(images/[a-zA-Z0-9_.-]+|https://[^[:space:]<>]+)$' THEN RAISE EXCEPTION '图片地址必须为HTTPS或内置素材'; END IF;
 END LOOP;
 SELECT version INTO v_version FROM public.site_content WHERE id='home' FOR UPDATE;
 IF p_version IS NULL OR p_version<>v_version THEN RAISE EXCEPTION '配置已被其他页面更新，请重新载入后编辑' USING ERRCODE='40001'; END IF;
 UPDATE public.site_content SET draft=p_content,published=CASE WHEN p_publish THEN p_content ELSE published END,
 version=version+1,updated_at=now(),updated_by=auth.uid(),published_at=CASE WHEN p_publish THEN now() ELSE published_at END WHERE id='home';
 RETURN public.admin_home_content();
END $$;
REVOKE ALL ON FUNCTION public.save_home_content(jsonb,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_home_content(jsonb,integer,boolean) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('site-assets','site-assets',true,5242880,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY site_assets_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='site-assets');
CREATE POLICY site_assets_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='site-assets' AND public.is_site_admin() AND (storage.foldername(name))[1]=auth.uid());
NOTIFY pgrst,'reload schema';

