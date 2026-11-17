import type { CheckinRecord } from "../types/checkin";

export interface MapPoint {
  record: CheckinRecord;
  position: [number, number];
}

export interface PhotoGroup {
  id: string;
  points: MapPoint[];
  position: [number, number];
}

// Bundled Natural Earth geometry uses WGS84 longitude and latitude.
// Missing coordinates must never be coerced to zero or guessed from a place name.
export function toMapPoint(record: CheckinRecord): MapPoint | null {
  const { longitude, latitude } = record.location;
  if (
    typeof longitude !== "number" || typeof latitude !== "number" ||
    !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
    longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
  ) return null;
  return { record, position: [longitude, latitude] };
}

export function firstPhotoUrl(record: CheckinRecord): string | undefined {
  const url = record.photos[0]?.url;
  if (!url) return undefined;
  // Use the owner's resolved URL; never manufacture a public cloud-file URL.
  try {
    const parsed = new URL(url);
    return ["https:", "blob:"].includes(parsed.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function detailPath(id: string): string {
  return `/checkin/${encodeURIComponent(id)}`;
}

// Group overlapping photo frames in screen space. Keep the actual geographic
// coordinates unchanged; a group opens a chooser instead of hiding records.
export function groupPhotoPoints(
  points: MapPoint[],
  project: (position: [number, number]) => { x: number; y: number },
  distance = 64,
): PhotoGroup[] {
  const groups: (PhotoGroup & { x: number; y: number })[] = [];
  const cells = new Map<string, typeof groups>();
  for (const point of points) {
    const { x, y } = project(point.position);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cellX = Math.floor(x / distance);
    const cellY = Math.floor(y / distance);
    let match: (typeof groups)[number] | undefined;
    for (let dx = -1; dx <= 1 && !match; dx++) {
      for (let dy = -1; dy <= 1 && !match; dy++) {
        match = cells.get(`${cellX + dx}:${cellY + dy}`)?.find(
          group => Math.abs(x - group.x) < distance && Math.abs(y - group.y) < distance,
        );
      }
    }
    if (match) {
      match.points.push(point);
    } else {
      const group = { id: point.record._id, points: [point], position: point.position, x, y };
      groups.push(group);
      const key = `${cellX}:${cellY}`;
      cells.set(key, [...(cells.get(key) ?? []), group]);
    }
  }
  return groups.map(({ id, points: members, position }) => ({ id, points: members, position }));
}

export async function loadMapRecords(
  fetchPage: (skip: number, limit: number) => Promise<CheckinRecord[]>,
  ownerId: string,
  signal: AbortSignal,
): Promise<CheckinRecord[]> {
  const result = new Map<string, CheckinRecord>();
  const seen = new Set<string>();
  const pageSize = 100;
  for (let skip = 0; ; skip += pageSize) {
    signal.throwIfAborted();
    const page = await fetchPage(skip, pageSize);
    signal.throwIfAborted();
    let added = 0;
    for (const record of page) {
      if (!seen.has(record._id)) { seen.add(record._id); added++; }
      if (record.authorId === ownerId) result.set(record._id, record);
    }
    if (page.length < pageSize) return [...result.values()];
    if (added === 0) throw new Error("记录分页读取异常，请稍后重试");
  }
}
