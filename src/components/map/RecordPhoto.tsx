import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { CheckinRecord } from "../../types/checkin";
import { firstPhotoUrl } from "../../maps/model";

export default function RecordPhoto({ record }: { record: CheckinRecord }) {
  const src = firstPhotoUrl(record);
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? (
    <img src={src} alt={`${record.location.name}的第一张照片`} loading="lazy"
      decoding="async" referrerPolicy="no-referrer" draggable={false}
      onError={() => setFailed(src)} />
  ) : (
    <span className="photo-map-fallback" role="img"
      aria-label={src ? "首张照片加载失败，仍可打开记录" : "暂无首张照片，仍可打开记录"}>
      <ImageOff size={20} aria-hidden="true" />
    </span>
  );
}
