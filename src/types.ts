export type TruckStatus = 'IDLE' | 'IN_ROUTE' | 'ARRIVED';
export type DeliveryStatus = 'PENDING' | 'IN_ROUTE' | 'DELIVERED';

export interface Driver {
  id: string;
  name: string;
  phone: string;
}

export interface Truck {
  id: string;
  plate: string;
  driverName: string;
  lastLat?: number;
  lastLng?: number;
  lastUpdate?: string;
  status: TruckStatus;
}

export interface Delivery {
  id: string;
  truckId: string;
  residentName: string;
  residentId?: string;
  address: string;
  neighborhood?: string;
  referencePoint: string;
  phone?: string;
  councilman: string;
  status: DeliveryStatus;
  lat: number;
  lng: number;
  createdAt: string;
  photo?: string; // base64 photo for delivery confirmation
}

export type SitioType = 'WATER' | 'FUEL' | 'OTHER' | 'SCHOOL' | 'DAYCARE';
export type FuelType = 'DIESEL' | 'GASOLINE' | 'NONE';

export interface Sitio {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  type: SitioType;
  fuelType?: FuelType;
  referencePoint?: string;
}

export interface Resident {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  phone?: string;
  lat?: number;
  lng?: number;
  referencePoint?: string;
  councilman?: string;
  category?: 'RESIDENT' | 'SCHOOL' | 'DAYCARE';
}

export interface AdminConfig {
  password: string;
  updatedAt: string;
}

export interface Councilman {
  id: string;
  name: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  role: 'admin' | 'driver';
  name: string;
}
