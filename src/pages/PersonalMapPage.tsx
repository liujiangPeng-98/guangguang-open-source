import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listMyCheckins } from "../services/checkinService";
import type { CheckinRecord } from "../types/checkin";
import { loadMapRecords } from "../maps/model";
import PersonalMapView from "../components/map/PersonalMapView";

interface Result {
  ownerId: string;
  revision: number;
  records: CheckinRecord[];
  error?: string;
}

const EMPTY_RECORDS: CheckinRecord[] = [];

export default function PersonalMapPage() {
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result>();
  const current = result?.ownerId === ownerId && result.revision === revision ? result : undefined;

  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    void loadMapRecords(
      (skip, limit) => listMyCheckins({ skip, limit, sortKey: "createdAt", sortOrder: "desc" }),
      ownerId, controller.signal,
    ).then(records => {
      if (!controller.signal.aborted) setResult({ ownerId, revision, records });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("个人地图读取记录失败", error);
      setResult({ ownerId, revision, records: [], error: "打卡记录暂时读取失败，请稍后重试。" });
    });
    return () => controller.abort();
  }, [ownerId, revision]);

  return <PersonalMapView key={ownerId} records={current?.records ?? EMPTY_RECORDS}
    loading={!current} error={current?.error} onRefresh={() => setRevision(value => value + 1)} />;
}
