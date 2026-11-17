export interface CheckinLocation {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  countryCode?: string;
  adminArea?: string;
  locality?: string;
  address?: string;
}

export interface CheckinPhoto {
  fileID: string;
  filename: string;
  size: number;
  mimeType: string;
  url?: string;
}

export interface CheckinRecord {
  _id: string;
  authorId: string;
  title?: string;
  location: CheckinLocation;
  checkinDate: string;
  description: string;
  photos: CheckinPhoto[];
  createdAt: number;
  updatedAt: number;
}

export interface NewCheckinInput {
  title?: string;
  location: {
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    countryCode?: string;
    adminArea?: string;
    locality?: string;
    address?: string;
  };
  checkinDate: string;
  description: string;
  photos: File[];
}

export interface CheckinUpdateInput {
  _id: string;
  title?: string;
  location?: Partial<CheckinLocation>;
  checkinDate?: string;
  description?: string;
}

export type CheckinListSortKey = "checkinDate" | "createdAt";

export interface CheckinListOptions {
  limit?: number;
  skip?: number;
  sortKey?: CheckinListSortKey;
  sortOrder?: "asc" | "desc";
}
