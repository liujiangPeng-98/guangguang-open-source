import { test } from "node:test";
import assert from "node:assert/strict";
import { detailPath, firstPhotoUrl, groupPhotoPoints, loadMapRecords, toMapPoint } from "../src/maps/model.ts";
import type { CheckinRecord } from "../src/types/checkin.ts";

function record(id: string, owner = "owner"): CheckinRecord {
  return { _id: id, authorId: owner, location: { name: "西湖", longitude: 120.1, latitude: 30.2 },
    checkinDate: "2026-09-30", description: "测试", photos: [], createdAt: 1, updatedAt: 1 };
}
const photo = (url: string) => ({ fileID: url, filename: "photo.jpg", size: 100, mimeType: "image/jpeg", url });

test("first photo keeps record ordering, even if first URL is missing or invalid", () => {
  const item = record("one");
  item.photos = [photo("https://example.com/first.jpg"), photo("https://example.com/second.jpg")];
  assert.equal(firstPhotoUrl(item), item.photos[0].url);
  item.photos[0].url = undefined;
  assert.equal(firstPhotoUrl(item), undefined);
  item.photos[0].url = "javascript:alert(1)";
  assert.equal(firstPhotoUrl(item), undefined);
});

test("valid zero coordinates render, missing/invalid coordinates do not become fictitious points", () => {
  const item = record("one");
  item.location = { name: "赤道", longitude: 0, latitude: 0 };
  assert.deepEqual(toMapPoint(item)?.position, [0, 0]);
  for (const latitude of [undefined, null, NaN, Infinity, 91, -91]) {
    item.location.latitude = latitude;
    assert.equal(toMapPoint(item), null);
  }
  item.location.latitude = 0;
  item.location.longitude = 181;
  assert.equal(toMapPoint(item), null);
});

test("overlapping markers retain every record and do not move coordinates", () => {
  const points = [record("one"), record("two"), record("three")].map((item, index) => ({ record: item, position: [index < 2 ? 10 : 100, 20] as [number, number] }));
  const groups = groupPhotoPoints(points, ([x, y]) => ({ x, y }));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].points.map(point => point.record._id), ["one", "two"]);
  assert.deepEqual(groups[0].position, [10, 20]);
  assert.equal(groupPhotoPoints(points, ([x, y]) => ({ x: x * 10, y })).length, 2);
});

test("detail route safely encodes the exact record id", () => {
  assert.equal(detailPath("a/b?#"), "/checkin/a%2Fb%3F%23");
});

test("map loads beyond first page and excludes another account's records", async () => {
  const data = Array.from({ length: 205 }, (_, i) => record(String(i), i === 3 ? "other" : "owner"));
  const calls: number[] = [];
  const result = await loadMapRecords(async (skip, limit) => {
    calls.push(skip); return data.slice(skip, skip + limit);
  }, "owner", new AbortController().signal);
  assert.deepEqual(calls, [0, 100, 200]);
  assert.equal(result.length, 204);
  assert.ok(result.every(item => item.authorId === "owner"));
});

test("cancelled requests and a backend ignoring pagination cannot leak stale or partial results", async () => {
  const controller = new AbortController();
  await assert.rejects(loadMapRecords(async () => { controller.abort(); return [record("one")]; }, "owner", controller.signal), { name: "AbortError" });
  const page = Array.from({ length: 100 }, (_, i) => record(String(i)));
  await assert.rejects(loadMapRecords(async () => page, "owner", new AbortController().signal), /分页/);
});
