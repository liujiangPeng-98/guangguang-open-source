-- Extend the four existing empty scaffold tables. No existing columns or rows are removed.
-- Business writes go through authenticated RPCs; files stay in a private PG bucket.
ALTER TABLE public.checkins
  ADD COLUMN owner_id text NOT NULL DEFAULT auth.uid(),
  ADD COLUMN submission_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN title text,
  ADD COLUMN place_name text NOT NULL DEFAULT '',
  ADD COLUMN text text NOT NULL DEFAULT '',
  ADD COLUMN country_code text NOT NULL DEFAULT '',
  ADD COLUMN admin_area text NOT NULL DEFAULT '',
  ADD COLUMN locality text NOT NULL DEFAULT '',
  ADD COLUMN address text NOT NULL DEFAULT '',
  ADD COLUMN longitude double precision,
  ADD COLUMN latitude double precision,
  ADD COLUMN coordinate_system text,
  ADD COLUMN visited_on date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','deleted')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT checkins_submission_unique UNIQUE(owner_id,submission_id),
  ADD CONSTRAINT checkins_owner_unique UNIQUE(id,owner_id),
  ADD CONSTRAINT checkins_text_length CHECK (length(text)<=2000 AND length(place_name)<=100 AND coalesce(length(title),0)<=100),
  ADD CONSTRAINT checkins_coordinates CHECK ((longitude IS NULL AND latitude IS NULL AND coordinate_system IS NULL) OR (longitude IS NOT NULL AND latitude IS NOT NULL AND coordinate_system IS NOT NULL AND longitude BETWEEN -180 AND 180 AND latitude BETWEEN -90 AND 90 AND coordinate_system='WGS84'));
CREATE INDEX checkins_owner_date ON public.checkins(owner_id,visited_on DESC,id DESC) WHERE status='active';

ALTER TABLE public.checkin_photos
  ADD COLUMN checkin_id uuid NOT NULL,
  ADD COLUMN owner_id text NOT NULL DEFAULT auth.uid(),
  ADD COLUMN bucket text NOT NULL DEFAULT 'checkin-photos' CHECK (bucket='checkin-photos'),
  ADD COLUMN object_key text NOT NULL,
  ADD COLUMN filename text NOT NULL,
  ADD COLUMN mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  ADD COLUMN size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  ADD COLUMN sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 8),
  ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','deleting')),
  ADD CONSTRAINT photos_parent_owner FOREIGN KEY(checkin_id,owner_id) REFERENCES public.checkins(id,owner_id),
  ADD CONSTRAINT photos_object_unique UNIQUE(bucket,object_key),
  ADD CONSTRAINT photos_order_unique UNIQUE(checkin_id,sort_order);
CREATE INDEX photos_checkin ON public.checkin_photos(checkin_id,sort_order);

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkins,public.checkin_photos,public.regions,public.region_marks FROM anon,authenticated;
GRANT SELECT ON public.checkins,public.checkin_photos TO authenticated;
CREATE POLICY checkins_read_own ON public.checkins FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY photos_read_own ON public.checkin_photos FOR SELECT TO authenticated USING(owner_id=auth.uid());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('checkin-photos','checkin-photos',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkin_files_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='checkin-photos' AND (storage.foldername(name))[1]=auth.uid());
CREATE POLICY checkin_files_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='checkin-photos' AND (storage.foldername(name))[1]=auth.uid()
 AND EXISTS(SELECT 1 FROM public.checkin_photos p JOIN public.checkins c ON c.id=p.checkin_id
 WHERE p.object_key=name AND p.owner_id=auth.uid() AND p.status='pending' AND c.status='draft'));
CREATE POLICY checkin_files_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='checkin-photos' AND (storage.foldername(name))[1]=auth.uid());

CREATE FUNCTION public.begin_checkin(p_submission_id uuid,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_id uuid; v_status text;
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 IF length(trim(coalesce(p_payload->>'place_name','')))=0 OR length(p_payload->>'place_name')>100
 OR length(coalesce(p_payload->>'text',''))>2000 OR length(coalesce(p_payload->>'title',''))>100 THEN RAISE EXCEPTION '地点或文字长度无效'; END IF;
 IF (p_payload->>'visited_on')::date > (now() AT TIME ZONE 'Pacific/Kiritimati')::date THEN RAISE EXCEPTION '不能记录未来日期'; END IF;
 INSERT INTO public.checkins(owner_id,submission_id,place_name) VALUES(v_uid,p_submission_id,trim(p_payload->>'place_name'))
 ON CONFLICT(owner_id,submission_id) DO NOTHING;
 SELECT id,status INTO v_id,v_status FROM public.checkins WHERE owner_id=v_uid AND submission_id=p_submission_id FOR UPDATE;
 IF v_status='deleted' THEN RAISE EXCEPTION '这次记录已删除，请重新开始'; END IF;
 IF v_status='active' THEN RETURN v_id; END IF;
 UPDATE public.checkins SET title=nullif(trim(p_payload->>'title'),''),place_name=trim(p_payload->>'place_name'),
 text=coalesce(p_payload->>'text',''),country_code=coalesce(p_payload->>'country_code',''),admin_area=coalesce(p_payload->>'admin_area',''),
 locality=coalesce(p_payload->>'locality',''),address=coalesce(p_payload->>'address',''),
 longitude=(p_payload->>'longitude')::double precision,latitude=(p_payload->>'latitude')::double precision,
 coordinate_system=CASE WHEN p_payload->>'longitude' IS NOT NULL AND p_payload->>'latitude' IS NOT NULL THEN 'WGS84' END,
 visited_on=(p_payload->>'visited_on')::date,updated_at=now() WHERE id=v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION public.prepare_checkin_photos(p_checkin_id uuid,p_photos jsonb) RETURNS SETOF public.checkin_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_status text; v_photo jsonb; v_id uuid; v_index integer:=0;
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 SELECT status INTO v_status FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_status<>'draft' THEN RAISE EXCEPTION '记录不可编辑'; END IF;
 IF jsonb_typeof(p_photos)<>'array' OR jsonb_array_length(p_photos) NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION '请上传1至9张照片'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos WHERE checkin_id=p_checkin_id) THEN RAISE EXCEPTION '请先清理上次未完成的上传'; END IF;
 FOR v_photo IN SELECT value FROM jsonb_array_elements(p_photos) LOOP
  v_id:=gen_random_uuid();
  INSERT INTO public.checkin_photos(id,checkin_id,owner_id,object_key,filename,mime_type,size_bytes,sort_order)
  VALUES(v_id,p_checkin_id,v_uid,v_uid||'/'||p_checkin_id::text||'/'||v_id::text,
   left(coalesce(v_photo->>'filename','照片'),180),v_photo->>'mime_type',(v_photo->>'size_bytes')::bigint,v_index);
  v_index:=v_index+1;
 END LOOP;
 RETURN QUERY SELECT * FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid ORDER BY sort_order;
END $$;

CREATE FUNCTION public.finish_checkin(p_checkin_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_status text;
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 SELECT status INTO v_status FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_status='deleted' THEN RAISE EXCEPTION '记录不存在'; END IF;
 IF v_status='active' THEN RETURN p_checkin_id; END IF;
 IF (SELECT count(*) FROM public.checkin_photos WHERE checkin_id=p_checkin_id) NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION '照片尚未上传完成'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos p LEFT JOIN storage.objects o ON o.bucket_id=p.bucket AND o.name=p.object_key
   WHERE p.checkin_id=p_checkin_id AND (o.id IS NULL OR o.owner_id IS DISTINCT FROM v_uid
    OR coalesce((o.metadata->>'size')::bigint,0)<>p.size_bytes
    OR coalesce(o.metadata->>'mimetype','')<>p.mime_type)) THEN RAISE EXCEPTION '照片验证未通过，请重试上传'; END IF;
 UPDATE public.checkin_photos SET status='ready' WHERE checkin_id=p_checkin_id;
 UPDATE public.checkins SET status='active',updated_at=now() WHERE id=p_checkin_id;
 RETURN p_checkin_id;
END $$;

CREATE FUNCTION public.clear_checkin_upload(p_checkin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 PERFORM 1 FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '记录不可清理'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos p JOIN storage.objects o ON o.bucket_id=p.bucket AND o.name=p.object_key WHERE p.checkin_id=p_checkin_id)
 THEN RAISE EXCEPTION '仍有文件待清理，请重试'; END IF;
 DELETE FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
END $$;

CREATE FUNCTION public.delete_checkin(p_checkin_id uuid) RETURNS SETOF public.checkin_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 UPDATE public.checkins SET status='deleted',updated_at=now() WHERE id=p_checkin_id AND owner_id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION '记录不存在或无权访问'; END IF;
 UPDATE public.checkin_photos SET status='deleting' WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
 RETURN QUERY SELECT * FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
END $$;

CREATE FUNCTION public.finish_delete_checkin(p_checkin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 PERFORM 1 FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid AND status='deleted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '记录不可删除'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos p JOIN storage.objects o ON o.bucket_id=p.bucket AND o.name=p.object_key WHERE p.checkin_id=p_checkin_id)
 THEN RAISE EXCEPTION '照片尚未清理完成，请重试'; END IF;
 DELETE FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
 DELETE FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid;
END $$;

REVOKE ALL ON FUNCTION public.begin_checkin(uuid,jsonb), public.prepare_checkin_photos(uuid,jsonb),public.finish_checkin(uuid),
 public.clear_checkin_upload(uuid),public.delete_checkin(uuid),public.finish_delete_checkin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_checkin(uuid,jsonb), public.prepare_checkin_photos(uuid,jsonb),public.finish_checkin(uuid),
 public.clear_checkin_upload(uuid),public.delete_checkin(uuid),public.finish_delete_checkin(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
