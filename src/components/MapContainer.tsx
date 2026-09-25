import { MapContainer as LeafletMap, TileLayer, Marker, Popup, useMapEvents, Polyline, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { Truck, Delivery, Sitio } from '../types';
import { LocateFixed, Filter, Check, Layers, ExternalLink, User, Search, X, Navigation, Plus, Minus, Maximize } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchRoadRoute, isRoadRoute } from '../lib/routing';

// Using divIcon for all markers to avoid image import issues in TS
const defaultIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #3B82F6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// Haversine formula to compute great-circle distance in kilometers
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Compute bearing between two geographical coordinates in degrees [0, 360)
function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLonRad = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);

  const bearingRad = Math.atan2(y, x);
  const bearingDeg = (bearingRad * 180) / Math.PI;
  return (bearingDeg + 360) % 360;
}

// Calculate intermediate directional arrow points along the polyline path
// following the exact road curvature with smooth tangent bearing calculations
interface RouteArrowPoint {
  position: [number, number];
  heading: number;
  id: string;
  index: number;
}

function calculateRouteArrows(
  points: [number, number][],
  minDistanceMeters?: number
): RouteArrowPoint[] {
  if (!points || points.length < 2) return [];

  // Filter out any invalid/zero coordinates
  const validPoints = points.filter(
    (p) => typeof p[0] === 'number' && !isNaN(p[0]) && p[0] !== 0 &&
           typeof p[1] === 'number' && !isNaN(p[1]) && p[1] !== 0
  );

  if (validPoints.length < 2) return [];

  // Compute segment lengths and cumulative distances
  const segDistances: number[] = [];
  const cumDistances: number[] = [0];
  let totalDistance = 0;

  for (let i = 0; i < validPoints.length - 1; i++) {
    const p1 = validPoints[i];
    const p2 = validPoints[i + 1];
    const d = getHaversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;
    segDistances.push(d);
    totalDistance += d;
    cumDistances.push(totalDistance);
  }

  if (totalDistance < 15) return [];

  // Helper to interpolate coordinate along the polyline at a given distance
  const getPointAtDist = (dist: number): [number, number] => {
    const clampedDist = Math.max(0, Math.min(dist, totalDistance));
    let segIdx = 0;
    for (let i = 0; i < cumDistances.length - 1; i++) {
      if (clampedDist >= cumDistances[i] && clampedDist <= cumDistances[i + 1]) {
        segIdx = i;
        break;
      }
    }
    const segLen = segDistances[segIdx] || 0.0001;
    const t = Math.max(0, Math.min(1, (clampedDist - cumDistances[segIdx]) / segLen));
    const pA = validPoints[segIdx];
    const pB = validPoints[segIdx + 1] || pA;
    return [
      pA[0] + t * (pB[0] - pA[0]),
      pA[1] + t * (pB[1] - pA[1])
    ];
  };

  // Helper to compute smoothed curve tangent bearing at a given distance
  // Samples points along the road polyline curve to eliminate micro-jitter and follow bends
  const getCurveHeadingAtDist = (dist: number): number => {
    const lookAhead = Math.min(dist + 12, totalDistance);
    const lookBehind = Math.max(dist - 6, 0);
    const pBehind = getPointAtDist(lookBehind);
    const pAhead = getPointAtDist(lookAhead);

    if (Math.abs(pBehind[0] - pAhead[0]) < 1e-7 && Math.abs(pBehind[1] - pAhead[1]) < 1e-7) {
      return computeBearing(
        validPoints[0][0], validPoints[0][1],
        validPoints[validPoints.length - 1][0], validPoints[validPoints.length - 1][1]
      );
    }

    return computeBearing(pBehind[0], pBehind[1], pAhead[0], pAhead[1]);
  };

  // Adaptive spacing: closer on short/urban trips, balanced on long rural routes
  let step = minDistanceMeters || 50;
  if (!minDistanceMeters) {
    if (totalDistance < 400) step = 32;
    else if (totalDistance < 1800) step = 45;
    else if (totalDistance < 6000) step = 60;
    else step = 85;
  }

  // Cap maximum arrows to 110 to preserve silky 60fps performance on mobile
  if (totalDistance / step > 110) {
    step = totalDistance / 110;
  }

  const arrows: RouteArrowPoint[] = [];
  const startOffset = Math.min(22, step * 0.45);
  const endOffset = Math.min(20, step * 0.4);

  let currentDist = startOffset;
  let arrowIndex = 0;

  while (currentDist <= totalDistance - endOffset) {
    const pos = getPointAtDist(currentDist);
    const heading = getCurveHeadingAtDist(currentDist);

    arrows.push({
      position: pos,
      heading,
      id: `arrow-${arrowIndex}-${pos[0].toFixed(5)}-${pos[1].toFixed(5)}`,
      index: arrowIndex
    });

    arrowIndex++;
    currentDist += step;
  }

  // Ensure at least one arrow if we have a reasonable route length
  if (arrows.length === 0 && totalDistance >= 15) {
    const midDist = totalDistance / 2;
    arrows.push({
      position: getPointAtDist(midDist),
      heading: getCurveHeadingAtDist(midDist),
      id: 'arrow-fallback-mid',
      index: 0
    });
  }

  return arrows;
}

// Directional Animated Arrow Icon with dynamic rotation and streaming animation
const routeArrowIcon = (
  bearing: number,
  colorTheme: 'neon' | 'navy' = 'neon',
  animIndex = 0
) => {
  const isNeon = colorTheme === 'neon';
  const fillColor = isNeon ? '#10B981' : '#0284C7';
  const coreColor = isNeon ? '#ECFDF5' : '#F0F9FF';
  const strokeColor = isNeon ? '#064E3B' : '#082F49';
  const glowColor = isNeon ? 'rgba(16, 185, 129, 0.8)' : 'rgba(2, 132, 199, 0.8)';
  
  // Stagger animation delay so the arrows stream forward continuously in a wave
  const delaySec = (-((animIndex * 0.22) % 1.76)).toFixed(2);

  return L.divIcon({
    className: 'route-arrow-icon',
    html: `
      <div class="route-arrow-wrapper" style="transform: rotate(${bearing.toFixed(1)}deg);">
        <div class="route-arrow-anim" style="animation-delay: ${delaySec}s;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)) drop-shadow(0 0 5px ${glowColor});">
            <!-- Aerodynamic Directional Arrow aligned with road curvature -->
            <path d="M12 3.2L4.5 12.2H8.5V19.8H15.5V12.2H19.5L12 3.2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M12 6.5L7.8 11.6H10V18.2H14V11.6H16.2L12 6.5Z" fill="${coreColor}"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
};

// Custom icons for different types
const getTruckColor = (driverName?: string, truckId?: string) => {
  const colors = [
    '#EF4444', // Red
    '#3B82F6', // Blue
    '#10B981', // Green
    '#D97706', // Yellow/Amber/Orange
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#6366F1'  // Indigo
  ];
  const str = driverName || truckId || '';
  if (!str) return '#4B5563'; // Gray default
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const truckIcon = (
  driverName: string, 
  truckId: string, 
  status: string, 
  isSelected: boolean,
  isActiveInService: boolean = false
) => {
  const uniqueColor = getTruckColor(driverName, truckId);
  let classes = isSelected ? 'custom-div-icon selected-truck' : 'custom-div-icon';
  if (status === 'IN_ROUTE' || isActiveInService) {
    classes += ' truck-in-route-pulse';
  }
  
  const truckSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2" ry="2" fill="white" fill-opacity="0.2"></rect>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" fill="white" fill-opacity="0.2"></polygon>
      <circle cx="5.5" cy="18.5" r="2.5" fill="black" stroke="white" stroke-width="1.5"></circle>
      <circle cx="18.5" cy="18.5" r="2.5" fill="black" stroke="white" stroke-width="1.5"></circle>
    </svg>
  `;

  const size = isSelected ? 38 : (isActiveInService ? 34 : 28);
  const borderSize = isSelected ? 3 : 2;
  const shadowStyle = isSelected 
    ? 'box-shadow: 0 4px 12px rgba(0,0,0,0.5);' 
    : (isActiveInService 
        ? 'box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45), 0 3px 8px rgba(0,0,0,0.3);' 
        : 'box-shadow: 0 2px 6px rgba(0,0,0,0.3);');

  const displayName = driverName ? driverName.split(' ')[0] : 'Pipa';
  const activeBadge = isActiveInService ? `
    <div style="
      position: absolute;
      top: -24px;
      left: 50%;
      transform: translateX(-50%);
      background: #064E3B;
      color: #A7F3D0;
      border: 1px solid #10B981;
      padding: 1px 6px;
      border-radius: 6px;
      font-size: 9px;
      font-weight: 800;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.35);
      letter-spacing: 0.02em;
      pointer-events: none;
    ">
      <span style="width: 5px; height: 5px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
      ${displayName}
    </div>
  ` : '';

  return L.divIcon({
    className: classes,
    html: `
      <div style="position: relative;">
        ${activeBadge}
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${size}px;
          height: ${size}px;
          background-color: ${uniqueColor};
          border: ${borderSize}px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          ${shadowStyle}
          transition: all 0.3s ease;
        ">
          <div style="
            transform: rotate(45deg);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            ${truckSvg}
          </div>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size]
  });
};

const deliveryIcon = (status: string) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: ${status === 'IN_ROUTE' ? '#F59E0B' : '#3B82F6'}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

const getSitioIcon = (type?: string, fuelType?: string) => {
  let bgColor = '#8B5CF6'; // Default color (purple)
  let iconHtml = '';

  if (type === 'WATER') {
    bgColor = '#0EA5E9'; // Blue for water
    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';
  } else if (type === 'FUEL') {
    bgColor = fuelType === 'DIESEL' ? '#B45309' : '#EF4444'; // Brown for diesel, Red for gasoline
    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h13M3 18h13M3 10h13M3 6h13M16 4v16a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg>';
  } else if (type === 'SCHOOL') {
    bgColor = '#6366F1'; // Indigo for school
    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v6"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 5v17"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>';
  } else if (type === 'DAYCARE') {
    bgColor = '#EC4899'; // Pink for daycare
    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><circle cx="12" cy="12" r="10"/></svg>';
  } else {
    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>';
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
        <div style="background-color: ${bgColor}; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; border: 2px solid white; display: flex; align-items: center; justify-content: center; transform: rotate(-45deg);">
          <div style="transform: rotate(45deg); display: flex;">
            ${iconHtml}
          </div>
        </div>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 36],
    popupAnchor: [0, -32]
  });
};

const newPointIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
      <div style="background-color: #10B981; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; border: 3px solid white; display: flex; align-items: center; justify-content: center; transform: rotate(-45deg);">
        <div style="transform: rotate(45deg); display: flex;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </div>
      </div>
    </div>
  `,
  iconSize: [32, 38],
  iconAnchor: [16, 36],
  popupAnchor: [0, -32]
});

const userLocationIcon = L.divIcon({
  className: 'user-location-pulse',
  html: `<div style="background-color: #3B82F6; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

interface MapViewProps {
  trucks: Truck[];
  deliveries: Delivery[];
  sitios: Sitio[];
  onMapClick?: (lat: number, lng: number) => void;
  onSitioClick?: (sitio: Sitio) => void;
  selectedTruckId?: string | null;
  route?: [number, number][];
  newPoint?: [number, number] | null;
  isDriver?: boolean;
}

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function LocateControl({ 
  streetViewMode, 
  setStreetViewMode, 
  onMarkerClick,
  selectedTruck,
  autoTrack,
  setAutoTrack,
  isDriver,
  mapLayer,
  setMapLayer,
  trucks,
  setSelectedDetail
}: { 
  streetViewMode: boolean; 
  setStreetViewMode: (v: boolean) => void; 
  onMarkerClick?: (lat: number, lng: number) => void;
  selectedTruck?: Truck;
  autoTrack: boolean;
  setAutoTrack: (v: boolean) => void;
  isDriver?: boolean;
  mapLayer: 'osmand' | 'satellite';
  setMapLayer: (v: 'osmand' | 'satellite') => void;
  trucks: Truck[];
  setSelectedDetail: (detail: any) => void;
}) {
  const map = useMap();
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLocateMenu, setShowLocateMenu] = useState(false);

  useEffect(() => {
    let watchId: number;

    if (isLocating && isDriver) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setPosition([latitude, longitude]);
          map.flyTo([latitude, longitude], map.getZoom());
        },
        (err) => {
          console.error("Erro ao obter localização:", err);
          setIsLocating(false);
        },
        { enableHighAccuracy: true }
      );
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [isLocating, map, isDriver]);

  return (
    <>
      {/* Barra de Ferramentas Alinhada do Lado Direito (Web e Celular) */}
      <div 
        className={`absolute ${isDriver ? 'top-16 sm:top-20 right-3' : 'top-2.5 right-2.5 sm:top-3 sm:right-3'} z-[400] flex flex-col gap-1 p-1 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl pointer-events-auto transition-all`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {/* Toggle Camada do Mapa (Satélite / OsmAnd) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMapLayer(mapLayer === 'osmand' ? 'satellite' : 'osmand');
          }}
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
            mapLayer === 'satellite'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400/40'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title={mapLayer === 'satellite' ? "Mudar para Mapa Padrão (Vias)" : "Mudar para Visão Satélite"}
        >
          <Layers size={18} />
        </button>

        <div className="h-px w-6 bg-slate-200 mx-auto" />

        {/* Localizar Motorista (Admin) ou Minha Localização GPS (Driver) */}
        {isDriver ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsLocating(!isLocating);
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
              isLocating 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40' 
                : 'text-blue-600 hover:bg-blue-50'
            }`}
            title={isLocating ? "Parar de Seguir Minha Localização" : "Minha Localização Atual"}
          >
            <LocateFixed size={18} className={isLocating ? "animate-pulse" : ""} />
          </button>
        ) : (
          <div className="relative flex flex-col items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLocateMenu(!showLocateMenu);
              }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                selectedTruck || showLocateMenu ? 'bg-blue-550 text-blue-600 border border-blue-200 bg-blue-50 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Selecionar e Localizar Operador"
            >
              <LocateFixed size={18} className={selectedTruck || showLocateMenu ? "animate-pulse text-blue-600" : ""} />
            </button>
            
            {/* Dropdown Menu listing all drivers with GPS, controlled by React state */}
            {showLocateMenu && (
              <div className="absolute right-11 sm:right-12 top-0 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-52 text-left z-[500] max-h-64 overflow-y-auto pointer-events-auto">
                <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100">
                  <span className="font-black uppercase text-[9px] text-slate-400 tracking-wider">Localizar Operador:</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLocateMenu(false);
                    }} 
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
                {trucks.length === 0 ? (
                  <div className="p-3 text-center text-[10px] font-bold text-slate-400">Nenhum cadastrado</div>
                ) : (
                  trucks.map(truck => {
                    const hasGPS = typeof truck.lastLat === 'number' && typeof truck.lastLng === 'number';
                    const isSelected = selectedTruck?.id === truck.id;
                    return (
                      <button
                        key={truck.id}
                        disabled={!hasGPS}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasGPS && truck.lastLat && truck.lastLng) {
                            map.flyTo([truck.lastLat, truck.lastLng], 15, { animate: true, duration: 1.2 });
                            setSelectedDetail({ type: 'truck', data: truck });
                            setShowLocateMenu(false);
                          }
                        }}
                        className={`px-2.5 py-2 rounded-xl text-left flex flex-col gap-0.5 transition-colors ${
                          isSelected 
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                            : hasGPS 
                              ? 'hover:bg-blue-50 text-slate-800' 
                              : 'opacity-40 cursor-not-allowed text-slate-400'
                        }`}
                      >
                        <span className="font-extrabold truncate text-[11px] uppercase tracking-tight">{truck.driverName}</span>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                          {hasGPS ? `Placa: ${truck.plate}` : 'Sem sinal GPS'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Modo Street View */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setStreetViewMode(!streetViewMode);
          }}
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
            streetViewMode 
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400/40' 
              : 'text-amber-600 hover:bg-amber-50'
          }`}
          title={streetViewMode ? "Desativar Street View" : "Ativar Modo Street View (Clique no mapa)"}
        >
          <User size={18} className={streetViewMode ? "animate-bounce" : ""} />
        </button>

        {/* Botão Ver Todos os Motoristas (Show all drivers on map) */}
        {!isDriver && (
          <>
            <div className="h-px w-6 bg-slate-200 mx-auto" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                const validTrucks = trucks.filter(t => typeof t.lastLat === 'number' && typeof t.lastLng === 'number');
                if (validTrucks.length > 0) {
                  const points = validTrucks.map(t => [t.lastLat!, t.lastLng!] as [number, number]);
                  const bounds = L.latLngBounds(points);
                  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                } else {
                  map.setView([-9.2201, -36.3503], 13);
                }
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 text-indigo-600 hover:bg-indigo-50"
              title="Enquadrar Todos os Motoristas (Visão Geral)"
            >
              <Maximize size={18} />
            </button>
          </>
        )}

        {/* Rastreamento Automático do Caminhão Selecionado */}
        {selectedTruck && (
          <>
            <div className="h-px w-6 bg-slate-200 mx-auto" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAutoTrack(!autoTrack);
              }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                autoTrack 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/40' 
                  : 'text-emerald-600 hover:bg-emerald-50'
              }`}
              title={autoTrack ? "Desativar Rastreamento Automático" : "Ativar Rastreamento Automático do Caminhão"}
            >
              <Navigation size={18} className={`-rotate-45 ${autoTrack ? "animate-pulse" : ""}`} />
            </button>
          </>
        )}
      </div>

      {position && isDriver && (
        <Marker 
          position={position} 
          icon={userLocationIcon}
          eventHandlers={{
            click: () => onMarkerClick?.(position[0], position[1])
          }}
        />
      )}
    </>
  );
}

function StreetViewHandler({ active }: { active: boolean }) {
  useMapEvents({
    click(e) {
      if (active) {
        const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${e.latlng.lat},${e.latlng.lng}`;
        window.open(url, '_blank');
      }
    },
  });
  return null;
}

function MapAutoZoom({ truck, route, autoTrack }: { truck?: Truck, route?: [number, number][], autoTrack: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    let timeoutId: number;

    const performZoom = () => {
      map.invalidateSize();

      if (route && route.length > 0) {
        if (route.length === 1) {
          map.flyTo(route[0], 15, { animate: true, duration: 1.5 });
        } else {
          const bounds = L.polyline(route).getBounds();
          const isMobile = window.innerWidth < 1024;
          
          map.fitBounds(bounds, { 
            paddingTopLeft: isMobile ? [30, 30] : [120, 120],
            paddingBottomRight: isMobile ? [30, 320] : [120, 120], // Bottom margin for mobile drawer (Driver App)
            maxZoom: 16,
            animate: true,
            duration: 1.5
          });
        }
      } else if (truck?.lastLat && truck?.lastLng) {
        if (autoTrack) {
          map.setView([truck.lastLat, truck.lastLng], map.getZoom() || 15, {
            animate: true,
            duration: 0.8
          });
        }
      }
    };

    performZoom();
    // Re-verify after a small timer in case CSS animations were running
    timeoutId = window.setTimeout(performZoom, 400);

    const handleResize = () => {
      performZoom();
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [truck?.id, truck?.lastLat, truck?.lastLng, route, map, autoTrack]);

  return null;
}

function MapFlyToHandler({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { animate: true, duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

function CustomZoomControl({ isDriver }: { isDriver?: boolean }) {
  const map = useMap();
  return (
    <div 
      className={`absolute ${isDriver ? 'top-[116px] sm:top-[128px]' : 'top-24 sm:top-28'} left-3 z-[400] flex flex-col gap-1 rounded-2xl bg-white/95 backdrop-blur-md p-1 border border-slate-200 shadow-xl pointer-events-auto transition-all`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          map.zoomIn();
        }}
        className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-xl active:scale-90 transition-all font-bold"
        title="Aumentar Zoom"
      >
        <Plus size={18} />
      </button>
      <div className="h-px w-6 bg-slate-200 mx-auto" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          map.zoomOut();
        }}
        className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-xl active:scale-90 transition-all font-bold"
        title="Diminuir Zoom"
      >
        <Minus size={18} />
      </button>
    </div>
  );
}

export default function MapContainer({ trucks, deliveries, sitios, onMapClick, onSitioClick, selectedTruckId, route, newPoint, isDriver }: MapViewProps) {
  const center: [number, number] = route && route.length > 0 ? route[0] : [-9.2201, -36.3503]; // Use route start or Inhapi, AL city center
  const selectedTruck = trucks.find(t => t.id === selectedTruckId);

  const [mapLayer, setMapLayer] = useState<'osmand' | 'satellite'>('osmand');
  const [autoTrack, setAutoTrack] = useState(true);
  const [mapFlyTarget, setMapFlyTarget] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (selectedTruckId) {
      setAutoTrack(true);
    }
  }, [selectedTruckId]);

  // Caminhões que estão ativos em serviço com GPS disponível
  const activeInServiceTrucks = useMemo(() => {
    return trucks.filter(truck => {
      const hasCoords = typeof truck.lastLat === 'number' && typeof truck.lastLng === 'number';
      if (!hasCoords) return false;
      const isInRouteOrArrived = truck.status === 'IN_ROUTE' || truck.status === 'ARRIVED';
      const hasAssignedDeliveries = deliveries.some(
        d => d.truckId === truck.id && (d.status === 'IN_ROUTE' || d.status === 'PENDING')
      );
      return isInRouteOrArrived || hasAssignedDeliveries;
    });
  }, [trucks, deliveries]);

  const [filters, setFilters] = useState({
    trucks: true,
    onlyActiveInService: true, // Prioriza rastrear os caminhões ativos em serviço no mapa do admin
    pending: true,
    inRoute: true,
    delivered: false,
    sitios: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [streetViewMode, setStreetViewMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<{
    type: 'truck' | 'delivery' | 'sitio' | 'water_supply' | 'new_point' | 'user_location';
    data: any;
  } | null>(null);

  // Search and active service filtering
  const filteredTrucks = trucks.filter(truck => {
    if (filters.onlyActiveInService && !activeInServiceTrucks.some(at => at.id === truck.id)) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (truck.driverName || '').toLowerCase().includes(q) ||
      (truck.plate || '').toLowerCase().includes(q)
    );
  });

  const filteredDeliveries = deliveries.filter(delivery => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (delivery.residentName || '').toLowerCase().includes(q) ||
      (delivery.address || '').toLowerCase().includes(q)
    );
  });

  const filteredSitios = sitios.filter(sitio => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (sitio.name || '').toLowerCase().includes(q) ||
      (sitio.description || '').toLowerCase().includes(q)
    );
  });

  const [routeColorStyle, setRouteColorStyle] = useState<'neon' | 'navy'>('neon');
  const [showRouteControls, setShowRouteControls] = useState(true);
  const [activeRoadRoute, setActiveRoadRoute] = useState<[number, number][] | undefined>(undefined);
  const [isCalculatingRoad, setIsCalculatingRoad] = useState(false);

  // Garante estritamente que rotas sejam SEMPRE traçadas no caminho real da pista/estrada (NUNCA em linha reta)
  useEffect(() => {
    if (!route || route.length === 0) {
      setActiveRoadRoute(undefined);
      return;
    }

    // Se já é uma rota detalhada pelas vias (> 2 pontos de estrada), utiliza diretamente
    if (route.length > 2) {
      setActiveRoadRoute(route);
      setShowRouteControls(true);
      return;
    }

    // Se possui 2 pontos (tentativa de linha reta), busca a geometria real da estrada
    // Jamais desenha a linha reta provisória!
    let isCancelled = false;
    setIsCalculatingRoad(true);

    fetchRoadRoute(route)
      .then((roadCoords) => {
        if (!isCancelled) {
          setIsCalculatingRoad(false);
          if (roadCoords && isRoadRoute(roadCoords)) {
            setActiveRoadRoute(roadCoords);
            setShowRouteControls(true);
          } else {
            // Em hipótese alguma desenhar em linha reta
            setActiveRoadRoute(undefined);
          }
        }
      })
      .catch((err) => {
        console.warn('Falha ao traçar rota real pelas vias:', err);
        if (!isCancelled) {
          setIsCalculatingRoad(false);
          setActiveRoadRoute(undefined);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [route]);

  // Calcula setas direcionais animadas que seguem fielmente a curvatura da rota calculada pelas vias
  const routeArrows = useMemo(() => {
    if (!activeRoadRoute || activeRoadRoute.length < 2) return [];
    return calculateRouteArrows(activeRoadRoute);
  }, [activeRoadRoute]);

  // Calcula a quilometragem total real percorrendo as curvas da pista
  const roadTotalKm = useMemo(() => {
    if (!activeRoadRoute || activeRoadRoute.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < activeRoadRoute.length - 1; i++) {
      total += getHaversineDistance(
        activeRoadRoute[i][0], activeRoadRoute[i][1],
        activeRoadRoute[i + 1][0], activeRoadRoute[i + 1][1]
      );
    }
    return total;
  }, [activeRoadRoute]);

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full h-full min-h-[400px] relative rounded-xl overflow-hidden shadow-lg border border-gray-200 z-0">
      {/* Auto tracking Active Badge - Centralizado no topo */}
      {selectedTruck && autoTrack && (
        <div className={`absolute ${isDriver ? 'top-16 sm:top-20' : 'top-16 sm:top-16'} left-1/2 -translate-x-1/2 z-[399] max-w-[calc(100%-140px)] bg-emerald-950/95 text-emerald-300 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-2 shadow-lg text-[10px] font-black uppercase tracking-wider truncate pointer-events-auto`}>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping flex-shrink-0" />
          <span className="truncate">Seguindo: {selectedTruck.driverName || 'Caminhão'}</span>
        </div>
      )}

      {/* Indicador de cálculo de rota real pelas pistas - Centralizado no topo */}
      {isCalculatingRoad && (
        <div className={`absolute ${isDriver ? (selectedTruck && autoTrack ? 'top-26 sm:top-28' : 'top-16 sm:top-20') : (selectedTruck && autoTrack ? 'top-26 sm:top-26' : 'top-16 sm:top-16')} left-1/2 -translate-x-1/2 z-[399] max-w-[calc(100%-140px)] bg-brand-dark/95 text-cyan-300 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 flex items-center gap-2 shadow-lg text-[10px] font-black uppercase tracking-wider animate-pulse pointer-events-auto`}>
          <Navigation size={12} className="animate-spin text-cyan-400 shrink-0" />
          <span className="truncate">Traçando caminho pelas estradas...</span>
        </div>
      )}

      {/* Search Input UI */}
      {!isDriver && (
        <div 
          className="absolute top-2.5 left-13 sm:top-3 sm:left-15 z-[400] w-[calc(100%-140px)] sm:w-72 md:w-80 shadow-lg bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-2.5 py-1.5 sm:py-2 flex items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-brand-dark/20"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input 
            type="text" 
            placeholder="Buscar motorista, placa, morador..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder:text-slate-400 font-bold"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-full hover:bg-slate-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Active Trucks Tracking Radar Bar (Admin Mode) */}
      {!isDriver && (
        <div 
          className="absolute top-11 sm:top-12 left-13 sm:left-15 z-[399] max-w-[calc(100%-80px)] sm:max-w-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quick toggle between active in service vs all */}
          <button
            onClick={() => toggleFilter('onlyActiveInService')}
            className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap shadow-md transition-all active:scale-95 border ${
              filters.onlyActiveInService
                ? 'bg-emerald-600 text-white border-emerald-400/50 shadow-emerald-600/30'
                : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white backdrop-blur-md'
            }`}
            title="Alternar entre rastrear apenas caminhões em serviço ou todos"
          >
            <span className={`w-2 h-2 rounded-full ${filters.onlyActiveInService ? 'bg-emerald-300 animate-ping' : 'bg-slate-400'}`} />
            {filters.onlyActiveInService ? `Ativos em Serviço (${activeInServiceTrucks.length})` : `Todos (${trucks.length})`}
          </button>

          {/* Quick focus chip for each active truck */}
          {activeInServiceTrucks.map(t => {
            const isSelected = selectedTruckId === t.id || selectedDetail?.data?.id === t.id;
            const uniqueColor = getTruckColor(t.driverName, t.id);
            const assignedDelivery = deliveries.find(d => d.truckId === t.id && (d.status === 'IN_ROUTE' || d.status === 'PENDING'));
            
            return (
              <button
                key={t.id}
                onClick={async () => {
                  if (t.lastLat && t.lastLng) {
                    setMapFlyTarget([t.lastLat, t.lastLng]);
                    if (assignedDelivery) {
                      setIsCalculatingRoad(true);
                      const road = await fetchRoadRoute([
                        [t.lastLat, t.lastLng],
                        [assignedDelivery.lat, assignedDelivery.lng]
                      ]);
                      setIsCalculatingRoad(false);
                      if (road && isRoadRoute(road)) {
                        setActiveRoadRoute(road);
                        setShowRouteControls(true);
                      }
                    }
                  }
                  setSelectedDetail({ type: 'truck', data: t });
                }}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1.5 whitespace-nowrap border backdrop-blur-md shadow-md transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-white text-slate-950 border-white font-black ring-2 ring-emerald-500'
                    : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-slate-500'
                }`}
                title={`Focar e rastrear ${t.driverName || 'Caminhão'} (${t.plate})`}
              >
                <span 
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white/50" 
                  style={{ backgroundColor: uniqueColor }}
                />
                <span className="font-black text-[9px] uppercase">{t.plate || 'PIPA'}</span>
                <span className="text-[10px] font-semibold text-slate-300 max-w-[85px] truncate">
                  {t.driverName ? t.driverName.split(' ')[0] : 'Motorista'}
                </span>
                {t.status === 'IN_ROUTE' ? (
                  <span className="text-[8px] bg-amber-500/30 text-amber-300 px-1 py-0.2 rounded font-black">ROTA</span>
                ) : (
                  <span className="text-[8px] bg-emerald-500/30 text-emerald-300 px-1 py-0.2 rounded font-black">ATIVO</span>
                )}
              </button>
            );
          })}

          {activeInServiceTrucks.length === 0 && (
            <span className="text-[10px] text-slate-400 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700 font-medium italic whitespace-nowrap">
              Nenhum caminhão em serviço no momento
            </span>
          )}
        </div>
      )}

      {/* Route Active Control Badge & Vibrant Color Switcher */}
      {activeRoadRoute && isRoadRoute(activeRoadRoute) && showRouteControls && (
        <div 
          className={`absolute ${isDriver ? 'bottom-16 sm:bottom-20 left-3 right-3 sm:right-auto sm:max-w-md' : 'bottom-3 sm:bottom-4 left-3 sm:left-4 max-w-[calc(100%-24px)] sm:max-w-md'} z-[400] bg-slate-900/95 text-white backdrop-blur-md px-3 py-2 rounded-2xl border border-emerald-500/30 shadow-2xl flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`w-2.5 h-2.5 rounded-full animate-ping shrink-0 ${routeColorStyle === 'neon' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
          <div className="flex flex-col">
            <span className="text-[8px] min-[360px]:text-[9px] font-black uppercase tracking-widest text-emerald-400">
              Traçado pelas Estradas Ativo
            </span>
            <span className="text-[10px] min-[360px]:text-[11px] font-bold text-white flex items-center gap-1.5">
              <Navigation size={11} className={routeColorStyle === 'neon' ? 'text-emerald-400' : 'text-sky-400'} />
              {roadTotalKm > 0 ? `${roadTotalKm.toFixed(1)} km • ${routeArrows.length} setas animadas` : `${routeArrows.length} Setas Animadas nas Vias`}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 ml-auto sm:ml-2">
            <button
              onClick={() => setRouteColorStyle('neon')}
              className={`px-1.5 min-[360px]:px-2 py-1 rounded-lg text-[8px] min-[360px]:text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                routeColorStyle === 'neon'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Destacar com Verde Neon"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 border border-black/30" />
              Neon
            </button>
            <button
              onClick={() => setRouteColorStyle('navy')}
              className={`px-1.5 min-[360px]:px-2 py-1 rounded-lg text-[8px] min-[360px]:text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                routeColorStyle === 'navy'
                  ? 'bg-sky-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Destacar com Azul Marinho / Royal"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 border border-black/30" />
              Azul
            </button>
          </div>

          <button 
            onClick={() => setShowRouteControls(false)}
            className="p-1 text-slate-400 hover:text-white transition-colors ml-1"
            title="Ocultar painel de rota"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter UI */}
      {!isDriver && (
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-[400] flex flex-col gap-1.5">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-lg border transition-all active:scale-95 flex items-center justify-center ${
              showFilters ? 'bg-slate-800 text-white border-slate-700 shadow-slate-800/30' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Filtros do Mapa"
          >
            <Filter size={18} />
          </button>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl border border-slate-200 w-48 space-y-1.5 z-[450]"
              >
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2.5 tracking-widest px-1">Filtros do Mapa</p>
                
                <button 
                  onClick={() => toggleFilter('trucks')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500" />
                    <span className="text-xs font-bold text-slate-700">Caminhões</span>
                  </div>
                  {filters.trucks && <Check size={14} className="text-blue-500" />}
                </button>

                <button 
                  onClick={() => toggleFilter('onlyActiveInService')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-700">Apenas em Serviço</span>
                  </div>
                  {filters.onlyActiveInService && <Check size={14} className="text-emerald-600" />}
                </button>

                <button 
                  onClick={() => toggleFilter('pending')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-slate-700">Pendentes</span>
                  </div>
                  {filters.pending && <Check size={14} className="text-blue-500" />}
                </button>

                <button 
                  onClick={() => toggleFilter('inRoute')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-bold text-slate-700">Em Rota</span>
                  </div>
                  {filters.inRoute && <Check size={14} className="text-blue-500" />}
                </button>

                <button 
                  onClick={() => toggleFilter('delivered')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">Concluídas</span>
                  </div>
                  {filters.delivered && <Check size={14} className="text-blue-500" />}
                </button>

                <button 
                  onClick={() => toggleFilter('sitios')}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-xs font-bold text-slate-700">Abastecimentos</span>
                  </div>
                  {filters.sitios && <Check size={14} className="text-blue-500" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <LeafletMap
        center={center}
        zoom={route ? 17 : 16}
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <CustomZoomControl isDriver={isDriver} />
        <MapFlyToHandler target={mapFlyTarget} />
        {mapLayer === 'osmand' ? (
          <TileLayer
            key="tile-osmand"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            key="tile-satellite"
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            maxZoom={22}
            maxNativeZoom={20}
          />
        )}
        

        <MapClickHandler onClick={onMapClick} />
        <StreetViewHandler active={streetViewMode} />
        <LocateControl 
          streetViewMode={streetViewMode} 
          setStreetViewMode={setStreetViewMode} 
          onMarkerClick={(lat, lng) => setSelectedDetail({
            type: 'user_location',
            data: { lat, lng }
          })}
          selectedTruck={selectedTruck}
          autoTrack={autoTrack}
          setAutoTrack={setAutoTrack}
          isDriver={isDriver}
          mapLayer={mapLayer}
          setMapLayer={setMapLayer}
          trucks={trucks}
          setSelectedDetail={setSelectedDetail}
        />
        <MapAutoZoom truck={selectedTruck} route={activeRoadRoute} autoTrack={autoTrack} />

        {/* Optimized Route Visualization with Vibrant Highlights & Directional Arrows */}
        {activeRoadRoute && isRoadRoute(activeRoadRoute) && (
          <>
            {/* Outer Glow Halo Layer */}
            <Polyline 
              positions={activeRoadRoute} 
              color={routeColorStyle === 'neon' ? '#10B981' : '#0284C7'} 
              weight={14} 
              opacity={0.35} 
              lineJoin="round"
              lineCap="round"
            />
            {/* Main Vibrant Track Layer */}
            <Polyline 
              positions={activeRoadRoute} 
              color={routeColorStyle === 'neon' ? '#059669' : '#0369A1'} 
              weight={7} 
              opacity={0.9} 
              lineJoin="round"
              lineCap="round"
            />
            {/* High-Contrast Crisp Center Core Line */}
            <Polyline 
              positions={activeRoadRoute} 
              color={routeColorStyle === 'neon' ? '#A7F3D0' : '#BAE6FD'} 
              weight={2.5} 
              opacity={1} 
              lineJoin="round"
              lineCap="round"
            />
            {/* Directional Animated Arrows along the Road Path */}
            {routeArrows.map((arrow) => (
              <Marker
                key={arrow.id}
                position={arrow.position}
                icon={routeArrowIcon(arrow.heading, routeColorStyle, arrow.index)}
                interactive={false}
                zIndexOffset={200}
              />
            ))}
          </>
        )}

        {/* Trucks */}
        {filters.trucks && filteredTrucks.map((truck) => {
          const isActive = activeInServiceTrucks.some(at => at.id === truck.id);
          return (
            truck.lastLat && truck.lastLng && (
              <Marker
                key={truck.id}
                position={[truck.lastLat, truck.lastLng]}
                icon={truckIcon(truck.driverName, truck.id, truck.status, truck.id === selectedTruckId, isActive)}
                eventHandlers={{
                  click: () => setSelectedDetail({
                    type: 'truck',
                    data: truck
                  })
                }}
              />
            )
          );
        })}

        {/* Deliveries with sequence numbers if route is active */}
        {filteredDeliveries
          .filter(d => {
            if (d.status === 'PENDING' && !filters.pending) return false;
            if (d.status === 'IN_ROUTE' && !filters.inRoute) return false;
            if (d.status === 'DELIVERED' && !filters.delivered) return false;
            return true;
          })
          .map((delivery) => {
            const sequenceIndex = route ? route.findIndex(p => p[0] === delivery.lat && p[1] === delivery.lng) : -1;
            
            return (
              <Marker
                key={delivery.id}
                position={[delivery.lat, delivery.lng]}
                icon={sequenceIndex > 0 ? L.divIcon({
                  className: 'custom-div-icon',
                  html: `<div style="background-color: #10B981; width: 22px; height: 22px; border-radius: 50%; border: 2px solid white; color: white; font-size: 11px; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(0,0,0,0.3);">${sequenceIndex}</div>`,
                  iconSize: [22, 22],
                  iconAnchor: [11, 11]
                }) : deliveryIcon(delivery.status)}
                eventHandlers={{
                  click: () => setSelectedDetail({
                    type: 'delivery',
                    data: { ...delivery, sequenceIndex }
                  })
                }}
              />
            );
          })}

        {/* Sitios */}
        {filters.sitios && filteredSitios.map((sitio) => (
          <Marker
            key={sitio.id}
            position={[sitio.lat, sitio.lng]}
            icon={getSitioIcon(sitio.type, sitio.fuelType)}
            eventHandlers={{
              click: () => {
                setSelectedDetail({
                  type: 'sitio',
                  data: sitio
                });
                onSitioClick?.(sitio);
              }
            }}
          />
        ))}

        {/* New Point Marker */}
        {newPoint && (
          <Marker 
            position={newPoint} 
            icon={newPointIcon}
            eventHandlers={{
              click: () => setSelectedDetail({
                type: 'new_point',
                data: { lat: newPoint[0], lng: newPoint[1] }
              })
            }}
          />
        )}
      </LeafletMap>

      {/* Slide-out Sidebar for Marker Details */}
      <AnimatePresence>
        {selectedDetail && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="absolute top-0 right-0 h-full w-full sm:w-96 max-w-full bg-white/95 sm:bg-white/80 backdrop-blur-xl shadow-2xl border-l border-white/40 z-[500] flex flex-col transition-all duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-200/60 bg-white/60 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
                <h4 className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-600">Detalhes do Item</h4>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 sm:space-y-5">
              {selectedDetail.type === 'truck' && (() => {
                const truck = selectedDetail.data;
                const assignedDelivery = deliveries.find(d => d.truckId === truck.id && d.status === 'IN_ROUTE') 
                  || deliveries.find(d => d.truckId === truck.id && d.status === 'PENDING');
                const distance = (truck.lastLat && truck.lastLng && assignedDelivery) 
                  ? getHaversineDistance(truck.lastLat, truck.lastLng, assignedDelivery.lat, assignedDelivery.lng) 
                  : null;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 border border-amber-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" ry="2"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base leading-tight">{truck.driverName || 'Sem Motorista'}</h3>
                        <p className="text-xs font-mono font-black text-slate-400 uppercase mt-0.5 tracking-wider">PLACA: {truck.plate}</p>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status Geral</p>
                        <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          truck.status === 'IN_ROUTE' ? 'bg-amber-100 text-amber-700 border border-amber-200 /80' :
                          truck.status === 'ARRIVED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 /80' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {truck.status === 'IN_ROUTE' ? 'Em Rota' :
                           truck.status === 'ARRIVED' ? 'No Local' : 'Disponível'}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Coordenadas</p>
                        <p className="text-xs font-mono font-bold text-slate-600 mt-1 leading-tight">
                          {truck.lastLat?.toFixed(4)},<br/>{truck.lastLng?.toFixed(4)}
                        </p>
                      </div>
                    </div>

                    {distance !== null && assignedDelivery && (
                      <div className="bg-emerald-50 border border-emerald-100/60 p-3.5 rounded-2xl flex flex-col shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Distância até a Entrega
                        </p>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <p className="text-2xl font-black text-emerald-950 leading-none">{distance.toFixed(2)}</p>
                          <p className="text-xs font-black text-emerald-700">km</p>
                        </div>
                        <p className="text-[10px] text-emerald-700 font-bold mt-1.5 leading-normal">
                          Para: {assignedDelivery.residentName} ({assignedDelivery.address})
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 !mt-6">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">Ações rápidas</label>
                      {assignedDelivery && (
                        <button
                          onClick={async () => {
                            setIsCalculatingRoad(true);
                            const road = await fetchRoadRoute([
                              [truck.lastLat, truck.lastLng],
                              [assignedDelivery.lat, assignedDelivery.lng]
                            ]);
                            setIsCalculatingRoad(false);
                            if (road && isRoadRoute(road)) {
                              setActiveRoadRoute(road);
                              setShowRouteControls(true);
                            }
                          }}
                          className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-emerald-600/20"
                        >
                          <Navigation size={14} /> Traçar Rota pelas Estradas
                        </button>
                      )}
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${truck.lastLat},${truck.lastLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-amber-950 rounded-xl font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-amber-500/10"
                      >
                        <ExternalLink size={14} /> Ver Street View
                      </a>
                      
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${truck.lastLat}, ${truck.lastLng}`);
                        }}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-[0.98] text-slate-700 rounded-xl font-bold text-xs transition-all"
                      >
                        Copiar Coordenadas
                      </button>
                    </div>
                  </div>
                );
              })()}

              {selectedDetail.type === 'delivery' && (() => {
                const delivery = selectedDetail.data;
                const assignedTruck = trucks.find(t => t.id === delivery.truckId);
                const distance = (assignedTruck && assignedTruck.lastLat && assignedTruck.lastLng)
                  ? getHaversineDistance(assignedTruck.lastLat, assignedTruck.lastLng, delivery.lat, delivery.lng)
                  : null;

                return (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 border border-blue-100 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base leading-tight">{delivery.residentName}</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-snug font-semibold">{delivery.address}</p>
                      </div>
                    </div>

                    {delivery.sequenceIndex > 0 && (
                      <div className="bg-emerald-50 border border-emerald-100/60 p-3 rounded-2xl flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-800">Caminho da Rota Ativa</span>
                        <span className="bg-emerald-600 text-white font-black text-xs px-3 py-1 rounded-full shadow-sm">
                          PARADA #{delivery.sequenceIndex}
                        </span>
                      </div>
                    )}

                    <hr className="border-slate-100" />

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status da Entrega</p>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        delivery.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/80' :
                        delivery.status === 'IN_ROUTE' ? 'bg-amber-100 text-amber-700 border border-amber-200/80' :
                        'bg-blue-100 text-blue-700 border border-blue-200/80'
                      }`}>
                        {delivery.status === 'DELIVERED' ? 'Entregue' :
                         delivery.status === 'IN_ROUTE' ? 'Em Rota' : 'Pendente'}
                      </span>
                    </div>

                    {distance !== null && assignedTruck && (
                      <div className="bg-blue-50 border border-blue-100/60 p-3.5 rounded-2xl flex flex-col shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-850 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Distância até o Caminhão
                        </p>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <p className="text-2xl font-black text-blue-950 leading-none">{distance.toFixed(2)}</p>
                          <p className="text-xs font-black text-blue-700">km</p>
                        </div>
                        <p className="text-[10px] text-blue-700 font-bold mt-1.5 leading-normal">
                          Motorista: {assignedTruck.driverName || 'Sem Motorista'} ({assignedTruck.plate})
                        </p>
                      </div>
                    )}

                    {delivery.referencePoint && (
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ponto de Referência</p>
                        <p className="text-xs text-slate-700 font-bold mt-1 leading-normal">{delivery.referencePoint}</p>
                      </div>
                    )}

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Latitude</p>
                        <p className="text-xs font-mono text-slate-600 font-bold mt-0.5">{delivery.lat?.toFixed(5)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Longitude</p>
                        <p className="text-xs font-mono text-slate-600 font-bold mt-0.5">{delivery.lng?.toFixed(5)}</p>
                      </div>
                    </div>

                    {delivery.councilman && (
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vereador Solicitante</p>
                        <p className="text-xs text-slate-800 font-black uppercase mt-0.5">{delivery.councilman}</p>
                      </div>
                    )}

                    <div className="space-y-2 !mt-6">
                      {assignedTruck && assignedTruck.lastLat && assignedTruck.lastLng && (
                        <button
                          onClick={async () => {
                            setIsCalculatingRoad(true);
                            const road = await fetchRoadRoute([
                              [assignedTruck.lastLat, assignedTruck.lastLng],
                              [delivery.lat, delivery.lng]
                            ]);
                            setIsCalculatingRoad(false);
                            if (road && isRoadRoute(road)) {
                              setActiveRoadRoute(road);
                              setShowRouteControls(true);
                            }
                          }}
                          className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-emerald-600/20"
                        >
                          <Navigation size={14} /> Traçar Rota do Caminhão pelas Vias
                        </button>
                      )}
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${delivery.lat},${delivery.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-amber-950 rounded-xl font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-amber-500/10"
                      >
                        <ExternalLink size={14} /> Ver Street View
                      </a>
                      
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${delivery.lat}, ${delivery.lng}`);
                        }}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 active:scale-[0.98] text-slate-700 rounded-xl font-bold text-xs transition-all"
                      >
                        Copiar Coordenadas
                      </button>
                    </div>
                  </div>
                );
              })()}

              {selectedDetail.type === 'sitio' && (() => {
                const sitio = selectedDetail.data;
                return (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 bg-purple-50 rounded-2xl text-purple-600 border border-purple-100 flex-shrink-0 font-bold">
                        SÍ
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base leading-tight">{sitio.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 uppercase font-black flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            sitio.type === 'WATER' ? 'bg-sky-500' :
                            sitio.type === 'FUEL' ? (sitio.fuelType === 'DIESEL' ? 'bg-amber-700' : 'bg-red-500') :
                            sitio.type === 'SCHOOL' ? 'bg-indigo-500' :
                            sitio.type === 'DAYCARE' ? 'bg-pink-500' :
                            'bg-purple-500'
                          }`} />
                          {sitio.type === 'WATER' ? 'Abastecimento de Água' :
                           sitio.type === 'FUEL' ? 'Combustível' :
                           sitio.type === 'SCHOOL' ? 'Escola' :
                           sitio.type === 'DAYCARE' ? 'Creche' :
                           'Ponto Registrado'}
                        </p>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Informações</p>
                      <p className="text-xs text-slate-600 font-bold mt-1 whitespace-pre-line leading-relaxed">{sitio.description}</p>
                    </div>

                    <div className="space-y-2 !mt-6">
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sitio.lat},${sitio.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-amber-950 rounded-xl font-black uppercase tracking-wider text-xs transition-all"
                      >
                        <ExternalLink size={14} /> Ver Street View
                      </a>
                    </div>
                  </div>
                );
              })()}

              {selectedDetail.type === 'water_supply' && (() => {
                const water = selectedDetail.data;
                return (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 bg-sky-50 rounded-2xl text-sky-600 border border-sky-100 flex-shrink-0 animate-pulse">
                        💡
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base leading-tight">{water.name}</h3>
                        <p className="text-xs font-black uppercase text-sky-600 mt-1">Sede de Captação</p>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</p>
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed mt-1">{water.description}</p>
                    </div>

                    <div className="space-y-2 !mt-6">
                      <a
                        href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${water.lat},${water.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-amber-950 rounded-xl font-black uppercase tracking-wider text-xs transition-all"
                      >
                        <ExternalLink size={14} /> Street View
                      </a>
                    </div>
                  </div>
                );
              })()}

              {selectedDetail.type === 'new_point' && (() => {
                const point = selectedDetail.data;
                return (
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-base">Ponto Escolhido no Mapa</h3>
                    <p className="text-xs text-slate-500 leading-normal mb-2">Utilize as coordenadas para mapear novas rotas ou designar entregas para moradores da localidade.</p>
                    
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 font-mono text-xs">
                      <p className="font-bold text-slate-700">LAT: {point.lat?.toFixed(6)}</p>
                      <p className="font-bold text-slate-700 mt-1">LNG: {point.lng?.toFixed(6)}</p>
                    </div>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${point.lat}, ${point.lng}`);
                      }}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs border"
                    >
                      Copiar Coordenadas
                    </button>
                  </div>
                );
              })()}

              {selectedDetail.type === 'user_location' && (() => {
                const pos = selectedDetail.data;
                return (
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-base">Sua Localização</h3>
                    <p className="text-xs text-slate-500 leading-normal">Coordenadas estimadas via seu receptor GPS.</p>
                    
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 font-mono text-xs">
                      <p className="font-bold text-slate-700">LAT: {pos.lat?.toFixed(6)}</p>
                      <p className="font-bold text-slate-700 mt-1">LNG: {pos.lng?.toFixed(6)}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
