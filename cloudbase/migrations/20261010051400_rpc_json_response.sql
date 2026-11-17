-- Return structured JSON for SDK 3.10.1 scalar response compatibility.
DROP FUNCTION public.begin_checkin(uuid,jsonb);
CREATE FUNCTION public.begin_checkin(p_submission_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_id uuid; v_status text;
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 IF length(trim(coalesce(p_payload->>'place_name','')))=0 OR length(p_payload->>'place_name')>100
 OR length(coalesce(p_payload->>'text',''))>2000 OR length(coalesce(p_payload->>'title',''))>100 THEN RAISE EXCEPTION '地点或文字长度无效'; END IF;
 IF (p_payload->>'visited_on')::date > (now() AT TIME ZONE 'Pacific/Kiritimati')::date THEN RAISE EXCEPTION '不能记录未来日期'; END IF;
 INSERT INTO public.checkins(owner_id,submission_id,place_name) VALUES(v_uid,p_submission_id,trim(p_payload->>'place_name'))
 ON CONFLICT(owner_id,submission_id) DO NOTHING;
 SELECT id,status INTO v_id,v_status FROM public.checkins WHERE owner_id=v_uid AND submission_id=p_submission_id FOR UPDATE;
 IF v_status='deleted' THEN RAISE EXCEPTION '这次记录已删除，请重新开始'; END IF;
 IF v_status='active' THEN RETURN jsonb_build_object('id',v_id); END IF;
 UPDATE public.checkins SET title=nullif(trim(p_payload->>'title'),''),place_name=trim(p_payload->>'place_name'),
 text=coalesce(p_payload->>'text',''),country_code=coalesce(p_payload->>'country_code',''),admin_area=coalesce(p_payload->>'admin_area',''),
 locality=coalesce(p_payload->>'locality',''),address=coalesce(p_payload->>'address',''),
 longitude=(p_payload->>'longitude')::double precision,latitude=(p_payload->>'latitude')::double precision,
 coordinate_system=CASE WHEN p_payload->>'longitude' IS NOT NULL AND p_payload->>'latitude' IS NOT NULL THEN 'WGS84' END,
 visited_on=(p_payload->>'visited_on')::date,updated_at=now() WHERE id=v_id;
 RETURN jsonb_build_object('id',v_id);
END $$;

CREATE OR REPLACE FUNCTION public.prepare_checkin_photos(p_checkin_id uuid,p_photos jsonb) RETURNS SETOF public.checkin_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_status text; v_photo jsonb; v_id uuid; v_index integer:=0;
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
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

DROP FUNCTION public.finish_checkin(uuid);
CREATE FUNCTION public.finish_checkin(p_checkin_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid(); v_status text;
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 SELECT status INTO v_status FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid FOR UPDATE;
 IF NOT FOUND OR v_status='deleted' THEN RAISE EXCEPTION '记录不存在'; END IF;
 IF v_status='active' THEN RETURN jsonb_build_object('id',p_checkin_id); END IF;
 IF (SELECT count(*) FROM public.checkin_photos WHERE checkin_id=p_checkin_id) NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION '照片尚未上传完成'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos p LEFT JOIN storage.objects o ON o.bucket_id=p.bucket AND o.name=p.object_key
   WHERE p.checkin_id=p_checkin_id AND (o.id IS NULL OR o.owner_id IS DISTINCT FROM v_uid
    OR coalesce((o.metadata->>'size')::bigint,0)<>p.size_bytes
    OR coalesce(o.metadata->>'mimetype','')<>p.mime_type)) THEN RAISE EXCEPTION '照片验证未通过，请重试上传'; END IF;
 UPDATE public.checkin_photos SET status='ready' WHERE checkin_id=p_checkin_id;
 UPDATE public.checkins SET status='active',updated_at=now() WHERE id=p_checkin_id;
 RETURN jsonb_build_object('id',p_checkin_id);
END $$;

CREATE OR REPLACE FUNCTION public.clear_checkin_upload(p_checkin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 PERFORM 1 FROM public.checkins WHERE id=p_checkin_id AND owner_id=v_uid AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '记录不可清理'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkin_photos p JOIN storage.objects o ON o.bucket_id=p.bucket AND o.name=p.object_key WHERE p.checkin_id=p_checkin_id)
 THEN RAISE EXCEPTION '仍有文件待清理，请重试'; END IF;
 DELETE FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.delete_checkin(p_checkin_id uuid) RETURNS SETOF public.checkin_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
 UPDATE public.checkins SET status='deleted',updated_at=now() WHERE id=p_checkin_id AND owner_id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION '记录不存在或无权访问'; END IF;
 UPDATE public.checkin_photos SET status='deleting' WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
 RETURN QUERY SELECT * FROM public.checkin_photos WHERE checkin_id=p_checkin_id AND owner_id=v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.finish_delete_checkin(p_checkin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid text:=auth.uid();
BEGIN
 IF v_uid IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION '请先登录'; END IF;
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
