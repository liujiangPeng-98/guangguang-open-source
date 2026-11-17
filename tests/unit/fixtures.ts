import type { CheckinRow, PhotoRow } from "../../src/services/pgCheckin";
import type { NewCheckinInput } from "../../src/types/checkin";

export function photoFile(type = "image/jpeg", size = 64, name = "景色.jpg"): File {
  return new File([new Uint8Array(size)], name, { type });
}
export function checkinRow(status = "draft"): CheckinRow {
  return {
    id: "checkin-1", owner_id: "user-1", title: null, place_name: "西湖",
    text: "散步时的风景", country_code: "CN", admin_area: "浙江省",
    locality: "", address: "", longitude: 120.15, latitude: 30.25,
    visited_on: "2026-10-10", created_at: "2026-10-10T01:00:00Z",
    updated_at: "2026-10-10T01:05:00Z", status,
  };
}
export function photoRow(status = "pending"): PhotoRow {
  return {
    id: "photo-1", checkin_id: "checkin-1", owner_id: "user-1",
    object_key: "user-1/checkin-1/photo-1.jpg", filename: "景色.jpg",
    mime_type: "image/jpeg", size_bytes: 64, sort_order: 0, status,
  };
}
export function newInput(): NewCheckinInput & { __submissionId: string } {
  return {
    location: { name: " 西湖 ", countryCode: "CN", adminArea: "浙江省", longitude: 120.15, latitude: 30.25 },
    checkinDate: "2026-10-10", description: "散步时的风景",
    photos: [photoFile()], __submissionId: "aab25ef8-f60a-4c9e-b874-15dc77dc52b1",
  };
}
