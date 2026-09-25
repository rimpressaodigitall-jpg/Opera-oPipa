import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  updateDoc, 
  doc, 
  orderBy,
  addDoc,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Truck, Delivery, DeliveryStatus, TruckStatus, Sitio, Councilman } from '../types';
import MapContainer from './MapContainer';
import { 
  Navigation, 
  LogOut, 
  MapPin, 
  CheckCircle2,
  PlusCircle,
  X,
  Camera,
  Upload,
  Trash2,
  Bell,
  WifiOff,
  CloudLightning,
  RefreshCw,
  Truck as TruckIcon,
  Phone,
  ChevronUp,
  ChevronDown,
  Home,
  Landmark,
  School,
  Baby,
  ArrowLeft,
  User
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { offlineDb } from '../lib/offlineDb';
import { fetchRoadRoute, WATER_SUPPLY_POINT, isRoadRoute } from '../lib/routing';
import AndroidInstallBanner from './AndroidInstallBanner';

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function DriverApp({ onTrocarAcesso }: { onTrocarAcesso?: () => void } = {}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [sitios, setSitios] = useState<Sitio[]>([]);
  const [assignedTruck, setAssignedTruck] = useState<Truck | null>(null);
  const [allTrucks, setAllTrucks] = useState<Truck[]>([]);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('pipa_selected_truck_id') : null;
  });
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [showAddSitio, setShowAddSitio] = useState(false);
  const [newSitioName, setNewSitioName] = useState('');
  const [newSitioType, setNewSitioType] = useState<'RESIDENT' | 'SCHOOL' | 'DAYCARE'>('RESIDENT');
  const [newSitioReferencePoint, setNewSitioReferencePoint] = useState('');
  const [newResidentSitio, setNewResidentSitio] = useState('');
  const [newResidentCouncilman, setNewResidentCouncilman] = useState('');
  const [isCustomCouncilman, setIsCustomCouncilman] = useState(false);
  const [councilmen, setCouncilmen] = useState<Councilman[]>([]);
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);
  
  const lastDbUpdateRef = useRef<{ lat: number, lng: number, time: number } | null>(null);
  
  const [deliveryToComplete, setDeliveryToComplete] = useState<Delivery | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // New States for Driver-Resident registration
  const [completedResidentName, setCompletedResidentName] = useState('');
  const [completedAddress, setCompletedAddress] = useState('');
  const [saveToResidentsRegister, setSaveToResidentsRegister] = useState(true);

  const handleSelectTruck = (truckId: string) => {
    localStorage.setItem('pipa_selected_truck_id', truckId);
    setSelectedTruckId(truckId);
    const found = allTrucks.find(t => t.id === truckId);
    if (found) {
      setAssignedTruck(found);
    }
  };

  useEffect(() => {
    if (deliveryToComplete) {
      setCompletedResidentName(deliveryToComplete.residentName || '');
      setCompletedAddress(deliveryToComplete.address || '');
      setSaveToResidentsRegister(true);
    }
  }, [deliveryToComplete]);

  const [lastProcessedDeliveryId, setLastProcessedDeliveryId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('last_delivery_id') : null
  });
  const [showNotificationToast, setShowNotificationToast] = useState<{ show: boolean, title: string, body: string }>({ show: false, title: '', body: '' });
  
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: number, fail: number } | null>(null);
  const [lastSyncFailureTime, setLastSyncFailureTime] = useState<number | null>(null);
  const [syncDelay, setSyncDelay] = useState(3000);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][] | undefined>(undefined);

  const handleOptimizeMyRoute = async () => {
    if (!location) return;

    const pendingDeliveries = myDeliveries.filter(d => 
      d.status === 'IN_ROUTE' || d.status === 'PENDING'
    );

    if (pendingDeliveries.length === 0) {
      alert('Não há entregas para otimizar.');
      return;
    }

    // Nearest Neighbor optimization from current location
    const unvisited = [...pendingDeliveries];
    const optimized: Delivery[] = [];
    let currentPos: [number, number] = [location.lat, location.lng];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const d = unvisited[i];
        const dist = Math.sqrt(Math.pow(d.lat - currentPos[0], 2) + Math.pow(d.lng - currentPos[1], 2));
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nearest = unvisited.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentPos = [nearest.lat, nearest.lng];
    }

    const waypoints: [number, number][] = [
      [location.lat, location.lng],
      ...optimized.map(d => [d.lat, d.lng] as [number, number]),
      WATER_SUPPLY_POINT
    ];

    const roadRoute = await fetchRoadRoute(waypoints);
    if (roadRoute && isRoadRoute(roadRoute)) {
      setPlannedRoute(roadRoute);
      setShowNotificationToast({
        show: true,
        title: "Traçado pelas Vias",
        body: "Rota calculada seguindo rigorosamente as estradas."
      });
      setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 4000);
    } else {
      setShowNotificationToast({
        show: true,
        title: "Aviso de Rota",
        body: "Buscando rotas nas vias. Nenhuma linha reta será exibida."
      });
      setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 4000);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkPending = async () => {
      const actions = await offlineDb.getAllActions();
      setPendingSyncCount(actions.length);
    };
    checkPending();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync Logic
  const performSync = async () => {
    if (!isOnline || isSyncing) return;
    
    const actions = await offlineDb.getAllActions();
    if (actions.length === 0) return;

    setIsSyncing(true);
    let success = 0;
    let fail = 0;

    for (const action of actions) {
      try {
        if (action.type === 'delivery_complete') {
          const { deliveryId, status, truckStatus, photo, truckId, lat, lng, residentName, address } = action.data;
          const deliveryUpdatePayload: any = { 
            status,
            completedAt: status === 'DELIVERED' ? new Date().toISOString() : null,
            photo: photo || null
          };
          if (lat !== undefined) deliveryUpdatePayload.lat = lat;
          if (lng !== undefined) deliveryUpdatePayload.lng = lng;
          if (residentName !== undefined) deliveryUpdatePayload.residentName = residentName;
          if (address !== undefined) deliveryUpdatePayload.address = address;

          await updateDoc(doc(db, 'deliveries', deliveryId), deliveryUpdatePayload);

          if (truckId) {
            await updateDoc(doc(db, 'trucks', truckId), { 
              status: truckStatus,
              lastUpdate: new Date().toISOString()
            });
          }
        } else if (action.type === 'sitio_add') {
          await addDoc(collection(db, 'sitios'), action.data);
        } else if (action.type === 'resident_add') {
          const { id, name, address, lat, lng, referencePoint, neighborhood, councilman, category } = action.data;
          let updated = false;
          if (id) {
            try {
              const resDocRef = doc(db, 'residents', id);
              await updateDoc(resDocRef, {
                address,
                lat,
                lng
              });
              updated = true;
            } catch (idErr) {
              console.warn("Direct resident update by ID failed, falling back to name lookup:", idErr);
            }
          }
          if (!updated) {
            const qRes = query(collection(db, 'residents'), where('name', '==', name));
            const querySnap = await getDocs(qRes);
            if (!querySnap.empty) {
              const existingDoc = querySnap.docs[0];
              const updatePayload: any = {
                address,
                lat,
                lng
              };
              if (referencePoint !== undefined) {
                updatePayload.referencePoint = referencePoint;
              }
              if (neighborhood !== undefined) {
                updatePayload.neighborhood = neighborhood;
              }
              if (councilman !== undefined) {
                updatePayload.councilman = councilman;
              }
              if (category !== undefined) {
                updatePayload.category = category;
              }
              await updateDoc(doc(db, 'residents', existingDoc.id), updatePayload);
            } else {
              const { id: _, ...cleanedData } = action.data;
              await addDoc(collection(db, 'residents'), cleanedData);
            }
          }
        } else if (action.type === 'truck_location') {
          const { truckId, lat, lng } = action.data;
          try {
            await updateDoc(doc(db, 'trucks', truckId), { 
              lastLat: lat,
              lastLng: lng,
              lastUpdate: new Date().toISOString()
            });
          } catch (locErr) {
            console.error("Transient location report failed, discarding stale coordinates from queue anyway:", locErr);
          }
        }
        
        if (action.id) await offlineDb.deleteAction(action.id);
        success++;
      } catch (e) {
        console.error("Sync failed for action", action, e);
        // If it is an outdated transient location update, we discard it anyway to avoid clogging
        if (action.type === 'truck_location' && action.id) {
          await offlineDb.deleteAction(action.id);
        } else {
          fail++;
        }
      }
    }
    
    const remaining = await offlineDb.getAllActions();
    setPendingSyncCount(remaining.length);
    setSyncStatus({ success, fail });
    setIsSyncing(false);

    if (fail > 0) {
      setLastSyncFailureTime(Date.now());
      setSyncDelay(prev => Math.min(prev * 2, 300000)); // double delay up to 5 min
    } else {
      setLastSyncFailureTime(null);
      setSyncDelay(3000); // reset delay on success
    }
    
    // Clear status after 5 seconds
    setTimeout(() => setSyncStatus(null), 5000);
  };

  useEffect(() => {
    if (isOnline && pendingSyncCount > 0 && !isSyncing) {
      const timeSinceFailure = lastSyncFailureTime ? (Date.now() - lastSyncFailureTime) : Infinity;
      const currentDelay = timeSinceFailure < syncDelay ? (syncDelay - timeSinceFailure) : 0;
      
      const timer = setTimeout(performSync, Math.max(3000, currentDelay));
      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingSyncCount, lastSyncFailureTime, syncDelay, isSyncing]);

  useEffect(() => {
    // Request permission for notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Android Screen Wake Lock - Keeps screen active while driver is operating
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // Ignore wakeLock errors silently
      }
    };
    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const handleErr = (name: string) => (err: any) => {
      console.warn(`Firestore onSnapshot error for ${name}:`, err);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted') || err?.message?.toLowerCase().includes('exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    };

    const qTrucks = query(collection(db, 'trucks'));
    const unsubTrucks = onSnapshot(qTrucks, (snap) => {
      const trucksData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Truck));
      setAllTrucks(trucksData);
      
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('pipa_selected_truck_id') : null;
      if (storedId) {
        const found = trucksData.find(t => t.id === storedId);
        if (found) {
          setAssignedTruck(found);
          return;
        }
      }
      setAssignedTruck(null);
    }, handleErr('trucks'));

    const qSitios = query(collection(db, 'sitios'));
    const unsubSitios = onSnapshot(qSitios, (snap) => {
      setSitios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sitio)));
    }, handleErr('sitios'));

    const qCouncilmen = query(collection(db, 'councilmen'), orderBy('name', 'asc'));
    const unsubCouncilmen = onSnapshot(qCouncilmen, (snap) => {
      setCouncilmen(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Councilman)));
    }, handleErr('councilmen'));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => {
      unsubTrucks();
      unsubSitios();
      unsubCouncilmen();
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!assignedTruck) return;

    const qDeliveries = query(
      collection(db, 'deliveries'), 
      orderBy('createdAt', 'desc')
    );

    const unsubDeliveries = onSnapshot(qDeliveries, (snap) => {
      setDeliveries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Delivery)));
    }, (error) => {
      console.warn("Firestore onSnapshot Error in deliveries:", error);
      if (error?.message?.toLowerCase().includes('quota') || error?.message?.toLowerCase().includes('resource-exhausted') || error?.message?.toLowerCase().includes('exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    });

    return () => unsubDeliveries();
  }, [assignedTruck?.id]);

  // Synchronize local IndexedDB queue status to Firestore so administrators can monitor sync health remotely
  useEffect(() => {
    if (!assignedTruck) return;

    const reportSyncStatus = async () => {
      try {
        await setDoc(doc(db, 'device_sync_status', assignedTruck.id), {
          deviceId: assignedTruck.id,
          driverName: assignedTruck.driverName,
          plate: assignedTruck.plate,
          pendingCount: pendingSyncCount,
          lastUpdate: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Falha ao reportar status de sincronia local:", err);
      }
    };

    reportSyncStatus();
  }, [pendingSyncCount, assignedTruck?.id, assignedTruck?.driverName, assignedTruck?.plate]);

  // Notification Detection Logic
  useEffect(() => {
    if (!assignedTruck || deliveries.length === 0) return;

    // With the filtered query, we just take the first one (newest)
    const newestDelivery = deliveries[0];
    
    // If it's a new delivery and it's PENDING
    if (newestDelivery && newestDelivery.id !== lastProcessedDeliveryId && newestDelivery.status === 'PENDING') {
      // Only notify if this isn't the first time we're loading (to avoid old delivery notifications on login)
      // or if we have a stored ID and this one is definitely newer
      if (lastProcessedDeliveryId) {
        const title = "Nova Entrega Atribuída! 🚚";
        const body = `${newestDelivery.residentName} - ${newestDelivery.address}`;

        // 1. Play Alert Sound (using a public URL for a truck/alert sound)
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(e => console.warn("Audio play blocked by browser policy", e));
        } catch (e) {
          console.warn("Audio not supported or failed to load", e);
        }

        // 2. Browser Push Notification (works if tab is open/active)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, { 
              body, 
              icon: '/logo.png',
              tag: 'new-delivery',
              silent: false,
              requireInteraction: true
            });
          } catch (e) {
            console.warn("Could not show browser notification", e);
          }
        }

        // 3. In-App Toast
        setShowNotificationToast({ show: true, title, body });
        setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 12000);
      }
      
      setLastProcessedDeliveryId(newestDelivery.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('last_delivery_id', newestDelivery.id);
      }
    }
  }, [deliveries, assignedTruck?.id, lastProcessedDeliveryId]);

  // Função para forçar atualização da localização GPS do motorista e sincronizar no Firestore
  const forceUpdateGPS = useCallback(async (isManual = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (isManual) {
        setIsRefreshingGps(false);
      }
      return;
    }

    if (isManual) setIsRefreshingGps(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        if (assignedTruck) {
          try {
            if (isOnline) {
              await updateDoc(doc(db, 'trucks', assignedTruck.id), {
                lastLat: lat,
                lastLng: lng,
                lastUpdate: new Date().toISOString()
              });
              lastDbUpdateRef.current = { lat, lng, time: Date.now() };
            } else {
              await offlineDb.addAction('truck_location', {
                truckId: assignedTruck.id,
                lat,
                lng,
                time: Date.now()
              });
            }
          } catch (err) {
            console.error("GPS timer: Falha ao atualizar caminhão:", err);
          }
        }

        if (isManual) {
          setIsRefreshingGps(false);
          setShowNotificationToast({
            show: true,
            title: "GPS Atualizado",
            body: "Sua localização foi sincronizada com sucesso!"
          });
          setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 3000);
        }
      },
      (err) => {
        console.warn("GPS timer error:", err);
        if (isManual) {
          setIsRefreshingGps(false);
          setShowNotificationToast({
            show: true,
            title: "Aviso de GPS",
            body: "Não foi possível obter sinal de satélite no momento."
          });
          setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 3500);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [assignedTruck, isOnline]);

  // Timer automático para forçar atualização da localização GPS do motorista a cada 60 segundos
  useEffect(() => {
    if (!assignedTruck) return;

    // Força uma atualização inicial
    forceUpdateGPS(false);

    // Timer de 60 segundos garantindo que o rastreamento em tempo real do administrador seja sempre preciso
    const gpsTimerId = setInterval(() => {
      forceUpdateGPS(false);
    }, 60000);

    return () => clearInterval(gpsTimerId);
  }, [assignedTruck?.id, forceUpdateGPS]);

  useEffect(() => {
    if (location && assignedTruck) {
      const now = Date.now();
      const lastUpdate = lastDbUpdateRef.current;

      if (lastUpdate) {
        const timePassedMs = now - lastUpdate.time;
        const dist = getDistanceInMeters(location.lat, location.lng, lastUpdate.lat, lastUpdate.lng);

        // Condições para salvar escrita no Firestore:
        // 1. Se menos de 15 segundos se passaram, evita sobrecarga de escrita consecutiva
        if (timePassedMs < 15000) {
          return;
        }
        // 2. Se moveu menos de 10 metros e menos de 60 segundos se passaram, aguarda o timer de 60s
        if (dist < 10 && timePassedMs < 60000) {
          return;
        }
      }

      // Update the reference with current coordinates and time BEFORE writing
      lastDbUpdateRef.current = {
        lat: location.lat,
        lng: location.lng,
        time: now
      };

      if (isOnline) {
        updateDoc(doc(db, 'trucks', assignedTruck.id), {
          lastLat: location.lat,
          lastLng: location.lng,
          lastUpdate: new Date().toISOString()
        }).catch((err) => {
          console.error("Failed to update location online, skipping transient update:", err);
        });
      }
    }
  }, [location, assignedTruck, isOnline]);

  const handleFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setPhotoBase64(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateDeliveryStatus = async (
    deliveryId: string, 
    status: DeliveryStatus, 
    truckStatus: TruckStatus, 
    photo?: string,
    exactLat?: number,
    exactLng?: number,
    updatedName?: string,
    updatedAddr?: string,
    isRegisterResident?: boolean
  ) => {
    setIsUploading(true);
    
    let finalTruckStatus = truckStatus;
    if (assignedTruck && status === 'DELIVERED') {
      const remainingDeliveries = myDeliveries.filter(d => 
        d.id !== deliveryId && (d.status === 'PENDING' || d.status === 'IN_ROUTE')
      );
      if (remainingDeliveries.length === 0) {
        finalTruckStatus = 'IDLE';
      }
    }

    const payload = {
      deliveryId,
      status,
      truckStatus: finalTruckStatus,
      photo: photo || null,
      truckId: assignedTruck?.id,
      lat: exactLat,
      lng: exactLng,
      residentName: updatedName,
      address: updatedAddr
    };

    try {
      if (isOnline) {
        const dUpdate: any = { 
          status,
          completedAt: status === 'DELIVERED' ? new Date().toISOString() : null,
          photo: photo || null
        };
        if (exactLat !== undefined) dUpdate.lat = exactLat;
        if (exactLng !== undefined) dUpdate.lng = exactLng;
        if (updatedName !== undefined) dUpdate.residentName = updatedName;
        if (updatedAddr !== undefined) dUpdate.address = updatedAddr;

        await updateDoc(doc(db, 'deliveries', deliveryId), dUpdate);

        if (assignedTruck) {
          await updateDoc(doc(db, 'trucks', assignedTruck.id), { 
            status: finalTruckStatus,
            lastUpdate: new Date().toISOString()
          });
        }

        // Adiciona ou atualiza no cadastro do administrador se solicitado
        if (isRegisterResident && updatedName && updatedAddr) {
          const latVal = exactLat || (location?.lat ?? -9.2201);
          const lngVal = exactLng || (location?.lng ?? -36.3503);
          try {
            let updated = false;
            if (deliveryToComplete?.residentId) {
              try {
                await updateDoc(doc(db, 'residents', deliveryToComplete.residentId), {
                  name: updatedName,
                  address: updatedAddr,
                  lat: latVal,
                  lng: lngVal
                });
                updated = true;
              } catch (idErr) {
                console.warn("Direct resident update by ID failed during delivery completion, trying name lookup:", idErr);
              }
            }
            if (!updated) {
              const qRes = query(collection(db, 'residents'), where('name', '==', updatedName));
              const querySnap = await getDocs(qRes);
              
              if (!querySnap.empty) {
                const existingDoc = querySnap.docs[0];
                await updateDoc(doc(db, 'residents', existingDoc.id), {
                  address: updatedAddr,
                  lat: latVal,
                  lng: lngVal
                });
              } else {
                const residentPayload = {
                  name: updatedName,
                  address: updatedAddr,
                  neighborhood: 'Zona Rural',
                  phone: '',
                  lat: latVal,
                  lng: lngVal
                };
                await addDoc(collection(db, 'residents'), residentPayload);
              }
            }
          } catch (e) {
            console.error("Erro ao registrar ou atualizar morador:", e);
          }
        }
      } else {
        await offlineDb.addAction('delivery_complete', payload);

        if (isRegisterResident && updatedName && updatedAddr) {
          const residentPayload = {
            id: deliveryToComplete?.residentId || null,
            name: updatedName,
            address: updatedAddr,
            neighborhood: 'Zona Rural',
            phone: '',
            lat: exactLat || (location?.lat ?? -9.2201),
            lng: exactLng || (location?.lng ?? -36.3503)
          };
          await offlineDb.addAction('resident_add', residentPayload);
        }

        const actions = await offlineDb.getAllActions();
        setPendingSyncCount(actions.length);
        setShowNotificationToast({ 
          show: true, 
          title: "Salvo com Sucesso (Offline)", 
          body: "Entrega e local salvos com sucesso no celular! Assim que a internet for reestabelecida, serão atualizados no banco de dados para o administrador ter acesso." 
        });
        setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 5000);
      }
      
      setDeliveryToComplete(null);
      setPhotoBase64(null);
      setPlannedRoute(undefined);
    } catch (error) {
      console.error("Error updating delivery:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Fallback to offline if request fails
      await offlineDb.addAction('delivery_complete', payload);
      const actions = await offlineDb.getAllActions();
      setPendingSyncCount(actions.length);
      setShowNotificationToast({ 
        show: true, 
        title: "Salvo com Sucesso (Offline)", 
        body: "Salvo com sucesso no celular devido à instabilidade de rede! Assim que a internet retornar, será atualizado no banco de dados para o administrador ter acesso." 
      });
      setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 10000);
      
      setDeliveryToComplete(null);
      setPhotoBase64(null);
      setPlannedRoute(undefined);
    } finally {
      setIsUploading(false);
    }
  };

  const refreshGPS = () => {
    forceUpdateGPS(true);
  };

  const resetSitioModal = () => {
    setShowAddSitio(false);
    setNewSitioName('');
    setNewSitioReferencePoint('');
    setNewResidentSitio('');
    setNewResidentCouncilman('');
    setIsCustomCouncilman(false);
    setNewSitioType('RESIDENT');
  };

  const handleRegisterCurrentLocation = async () => {
    if (!location || !newSitioName.trim()) return;

    const sitioTrimmed = newResidentSitio.trim();
    const councilmanTrimmed = newResidentCouncilman.trim();
    const nameTrimmed = newSitioName.trim();

    const typeLabels = {
      RESIDENT: 'Morador',
      SCHOOL: 'Escola',
      DAYCARE: 'Creche'
    };
    const titleLabel = typeLabels[newSitioType] || 'Local';

    const residentPayload: any = {
      name: nameTrimmed,
      address: sitioTrimmed ? `Sítio ${sitioTrimmed}` : 'Adicionado C/ Localização',
      neighborhood: sitioTrimmed || 'Não Informado',
      phone: '',
      lat: location.lat,
      lng: location.lng,
      referencePoint: newSitioReferencePoint.trim(),
      councilman: councilmanTrimmed,
      category: newSitioType
    };

    const sitioPayload: any = {
      name: nameTrimmed,
      description: `${titleLabel} registrada(o) por ${assignedTruck?.driverName || 'Motorista'}${sitioTrimmed ? ` - Sítio ${sitioTrimmed}` : ''}`,
      lat: location.lat,
      lng: location.lng,
      type: newSitioType,
      fuelType: 'NONE',
      referencePoint: newSitioReferencePoint.trim()
    };

    try {
      if (isOnline) {
        // Cadastra como destinatário para entregas de água
        await addDoc(collection(db, 'residents'), residentPayload);

        // Se for Escola ou Creche, cadastra também em sítios/locais para marcação fixa no mapa
        if (newSitioType === 'SCHOOL' || newSitioType === 'DAYCARE') {
          await addDoc(collection(db, 'sitios'), sitioPayload);
        }

        setShowNotificationToast({ 
          show: true, 
          title: "Sucesso", 
          body: `${titleLabel} registrado(a) com sucesso!${councilmanTrimmed ? ` (Indicação: ${councilmanTrimmed})` : ''}` 
        });
      } else {
        await offlineDb.addAction('resident_add', residentPayload);
        if (newSitioType === 'SCHOOL' || newSitioType === 'DAYCARE') {
          await offlineDb.addAction('sitio_add', sitioPayload);
        }
        const actions = await offlineDb.getAllActions();
        setPendingSyncCount(actions.length);
        setShowNotificationToast({ 
          show: true, 
          title: "Salvo com Sucesso (Offline)", 
          body: `${titleLabel} salvo com sucesso no celular! Assim que a internet for reestabelecida, será atualizado no banco de dados para o administrador ter acesso.` 
        });
      }
    } catch (e) {
      await offlineDb.addAction('resident_add', residentPayload);
      if (newSitioType === 'SCHOOL' || newSitioType === 'DAYCARE') {
        await offlineDb.addAction('sitio_add', sitioPayload);
      }
      const actions = await offlineDb.getAllActions();
      setPendingSyncCount(actions.length);
      setShowNotificationToast({ 
        show: true, 
        title: "Salvo com Sucesso (Offline)", 
        body: `${titleLabel} salvo com sucesso no celular (modo offline)! Assim que a internet for reestabelecida, será atualizado no banco de dados para o administrador ter acesso.` 
      });
    }

    setTimeout(() => setShowNotificationToast({ show: false, title: '', body: '' }), 4000);
    resetSitioModal();
  };

  const openInMaps = (lat: number, lng: number) => {
    // Protocolo específico do OsmAnd para navegação direta
    const osmandUrl = `osmand://go?lat=${lat}&lon=${lng}&z=16&en-route=true`;
    // Protocolo genérico Geo (abre apps de mapas offline no Android/iOS)
    const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}(Destino)`;
    
    // Tenta abrir o OsmAnd primeiro
    window.location.href = osmandUrl;
    
    // Fallback: Se o OsmAnd não interceptar a chamada em 500ms, tenta o protocolo GEO genérico
    setTimeout(() => {
      window.location.href = geoUrl;
    }, 500);
  };

  const handleStartDelivery = async (delivery: Delivery) => {
    await updateDeliveryStatus(delivery.id, 'IN_ROUTE', 'IN_ROUTE');
    if (location) {
      const roadRoute = await fetchRoadRoute([[location.lat, location.lng], [delivery.lat, delivery.lng]]);
      if (roadRoute && isRoadRoute(roadRoute)) {
        setPlannedRoute(roadRoute);
      }
    }
    openInMaps(delivery.lat, delivery.lng);
  };

  const myDeliveries = deliveries.filter(d => d.truckId === assignedTruck?.id);
  const activeDelivery = myDeliveries.find(d => d.status === 'IN_ROUTE');
  const pendingDeliveries = myDeliveries.filter(d => d.status === 'PENDING');
  const hasDeliveries = !!activeDelivery || pendingDeliveries.length > 0;

  // Se não houver entregas, o rodapé fica recuado para baixo por padrão, liberando o mapa e o restante da tela
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(true);

  // Expande automaticamente se houver entrega ativa; caso contrário, se não houver entregas, recua para baixo
  useEffect(() => {
    if (activeDelivery) {
      setIsFooterCollapsed(false);
    } else if (pendingDeliveries.length === 0) {
      setIsFooterCollapsed(true);
    }
  }, [activeDelivery?.id, pendingDeliveries.length]);

  // Auto-cálculo e atualização contínua da rota real pelas estradas para a entrega em andamento
  const lastCalculatedRoutePosRef = useRef<{ lat: number; lng: number; deliveryId: string } | null>(null);

  useEffect(() => {
    if (!activeDelivery || !location) {
      if (!activeDelivery && plannedRoute) {
        setPlannedRoute(undefined);
        lastCalculatedRoutePosRef.current = null;
      }
      return;
    }

    if (
      lastCalculatedRoutePosRef.current &&
      lastCalculatedRoutePosRef.current.deliveryId === activeDelivery.id &&
      plannedRoute &&
      plannedRoute.length > 2
    ) {
      const dist = getDistanceInMeters(
        location.lat,
        location.lng,
        lastCalculatedRoutePosRef.current.lat,
        lastCalculatedRoutePosRef.current.lng
      );
      if (dist < 70) return; // Não recalcula se o caminhão deslocou menos de 70 metros
    }

    let isMounted = true;
    fetchRoadRoute([[location.lat, location.lng], [activeDelivery.lat, activeDelivery.lng]]).then((roadRoute) => {
      if (isMounted && roadRoute && isRoadRoute(roadRoute)) {
        setPlannedRoute(roadRoute);
        lastCalculatedRoutePosRef.current = {
          lat: location.lat,
          lng: location.lng,
          deliveryId: activeDelivery.id
        };
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeDelivery?.id, activeDelivery?.lat, activeDelivery?.lng, location?.lat, location?.lng]);

  const dragControls = useDragControls();

  if (!assignedTruck) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 text-slate-800 font-sans flex flex-col justify-between p-6 relative">
        <div 
          className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none bg-center bg-cover" 
          style={{ backgroundImage: 'url(https://i.ibb.co/v4vWjP3B/caminhao-pipa-inhapi-OMZpj2.jpg)' }} 
        />
        
        <header className="w-full max-w-lg mx-auto text-center pt-4 z-10">
          <div className="w-12 h-12 bg-white rounded-xl mx-auto flex items-center justify-center shadow-md p-0.5 border border-slate-100">
            <img 
              src="https://i.ibb.co/sdCcYPpy/logo-inhapi-NNPe-Z.webp" 
              alt="Logo Inhapi" 
              className="w-full h-full object-contain" 
              onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100?text=LOGO'}
            />
          </div>
          <h1 className="text-lg font-black text-brand-dark tracking-tight uppercase mt-2.5">
            Operação Pipa
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
            Prefeitura Municipal de Inhapi - AL
          </p>
        </header>

        <main className="w-full max-w-lg mx-auto flex-1 flex flex-col justify-center py-4 z-10">
          <div className="bg-white rounded-2xl p-4 shadow-lg shadow-slate-100 border border-slate-200/60 space-y-3.5">
            <div className="text-center">
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">
                Quem está operando hoje?
              </h2>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Selecione o seu nome na lista abaixo para acessar suas rotas e entregas de água:
              </p>
            </div>

            {allTrucks.length === 0 ? (
              <div className="py-6 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Carregando operadores...</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                {allTrucks.map((truck) => (
                  <button
                    key={truck.id}
                    onClick={() => handleSelectTruck(truck.id)}
                    className="w-full bg-slate-50 hover:bg-brand-primary/5 border border-slate-150 hover:border-brand-primary/30 rounded-xl p-2.5 flex items-center gap-3 transition-all text-left active:scale-[0.99]"
                  >
                    <div className="w-7 h-7 bg-brand-primary/10 text-brand-primary rounded-lg flex items-center justify-center shrink-0">
                      <TruckIcon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-xs uppercase tracking-tight text-slate-800 truncate">
                        {truck.driverName}
                      </p>
                      <p className="text-[8px] text-slate-400 font-black tracking-widest mt-0.5 uppercase">
                        Placa: {truck.plate}
                      </p>
                    </div>
                    <div className="px-2 py-0.5 bg-slate-200/60 hover:bg-brand-primary hover:text-white rounded text-[8px] font-black uppercase tracking-wider text-slate-500 shrink-0 transition-colors">
                      Acessar
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>

        <footer className="w-full max-w-lg mx-auto text-center pb-4 z-10">
          <button
            onClick={onTrocarAcesso}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-600 font-black uppercase tracking-wider text-xs transition-colors"
          >
            <ArrowLeft size={14} /> Voltar para seleção de acesso
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-brand-dark text-white font-sans flex flex-col overflow-hidden">
      <div 
        className="fixed inset-0 z-[-10] opacity-10 bg-center bg-cover" 
        style={{ backgroundImage: 'url(https://i.ibb.co/v4vWjP3B/caminhao-pipa-inhapi-OMZpj2.jpg)' }} 
      />
      <AnimatePresence>
        {showNotificationToast.show && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-6 right-6 z-[1000] bg-brand-primary text-white p-6 rounded-[40px] shadow-2xl flex items-center gap-4 border-2 border-white/20"
          >
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Bell className="text-white animate-bounce" size={28} />
            </div>
            <div className="flex-1">
              <p className="font-black text-xs uppercase tracking-wider">{showNotificationToast.title}</p>
              <p className="text-[10px] text-white/80 leading-tight font-medium">{showNotificationToast.body}</p>
            </div>
            <button 
              onClick={() => setShowNotificationToast({ show: false, title: '', body: '' })}
              className="p-2 hover:bg-white/10 rounded-full"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Overlay */}
      <header className="absolute top-0 left-0 right-0 z-[401] p-2 sm:p-3 flex justify-between items-center pointer-events-none safe-area-top">
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 bg-slate-900/90 backdrop-blur-xl p-1.5 rounded-2xl border border-slate-700/60 shadow-xl min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white rounded-xl flex items-center justify-center p-0.5 flex-shrink-0 shadow-xs">
               <img src="https://i.ibb.co/sdCcYPpy/logo-inhapi-NNPe-Z.webp" alt="Logo" className="w-full h-full object-contain" onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100?text=LOGO'} />
            </div>
            <div className="min-w-0 pr-1.5">
              <span className="text-[10px] font-semibold text-slate-400 leading-none block">Motorista</span>
              <p className="text-white text-xs sm:text-sm font-bold leading-tight mt-0.5 truncate max-w-[130px] min-[360px]:max-w-[170px] sm:max-w-none">
                {assignedTruck?.driverName || 'Inhapi - AL'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto flex-shrink-0">
          {!isOnline && (
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/95 text-white rounded-xl text-xs font-semibold border border-rose-400/50 shadow-md backdrop-blur-md"
              title="Modo Offline Ativo: Os dados de entregas estão salvos localmente e operando normalmente!"
            >
              <WifiOff size={13} className="shrink-0 animate-bounce" />
              <span>Offline</span>
            </div>
          )}
          <button 
            onClick={() => {
              localStorage.removeItem('pipa_selected_truck_id');
              setSelectedTruckId(null);
              setAssignedTruck(null);
            }} 
            className="h-9 px-3 bg-slate-900/90 hover:bg-slate-800 text-slate-200 rounded-xl shadow-md font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5 border border-slate-700/60 backdrop-blur-md cursor-pointer"
            title="Trocar Operador / Motorista"
          >
            <User size={14} className="text-cyan-400" />
            <span className="hidden sm:inline">Trocar</span>
          </button>
          <button 
            onClick={() => auth.signOut()} 
            className="w-9 h-9 bg-slate-900/90 text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-slate-700/60 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center backdrop-blur-md cursor-pointer"
            title="Sair da Conta"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Top Half: Map */}
      <div className="flex-1 relative z-0">
        <MapContainer 
          trucks={assignedTruck ? [assignedTruck] : []} 
          deliveries={myDeliveries.filter(d => d.status !== 'DELIVERED')} 
          sitios={sitios}
          route={plannedRoute}
          selectedTruckId={assignedTruck?.id}
          newPoint={showAddSitio && location ? [location.lat, location.lng] : null}
          isDriver={true}
        />

        {/* GPS Tracking Badge - 60s auto-refresh indicator */}
        <div className="absolute top-16 sm:top-20 left-3 z-[400] pointer-events-auto">
          <div className="bg-brand-dark/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/15 shadow-xl flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider leading-none">
                GPS Automático
              </span>
              <span className="text-[7px] text-white/50 font-bold uppercase tracking-widest mt-0.5 leading-none">
                Atualiza a cada 60s
              </span>
            </div>
            <button
              onClick={() => forceUpdateGPS(true)}
              disabled={isRefreshingGps}
              className="text-white/60 hover:text-white p-1 ml-1 hover:bg-white/10 rounded-lg active:scale-90 transition-all"
              title="Forçar atualização manual do GPS agora"
            >
              <RefreshCw size={11} className={isRefreshingGps ? 'animate-spin text-cyan-300' : ''} />
            </button>
          </div>
        </div>
        
        {/* Floating Quick Action Button */}
        <div className={`absolute ${isFooterCollapsed ? 'bottom-14 sm:bottom-16' : 'bottom-16 sm:bottom-20'} right-4 sm:right-6 z-[390] pointer-events-auto transition-all`}>
          <button 
            onClick={() => {
              setNewSitioName('');
              setNewSitioReferencePoint('');
              setNewResidentSitio('');
              setNewResidentCouncilman('');
              setIsCustomCouncilman(false);
              setShowAddSitio(true);
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-brand-primary text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-brand-primary/40 active:scale-90 transition-all border-2 border-white/20"
            title="Registrar Local"
          >
            <PlusCircle size={26} className="sm:w-7 sm:h-7" />
          </button>
        </div>

        {/* Sync Status Overlay */}
        {(pendingSyncCount > 0 || syncStatus) && (
          <div className={`absolute ${isFooterCollapsed ? 'bottom-14 sm:bottom-16' : 'bottom-16 sm:bottom-20'} left-3 z-[390] flex flex-col gap-2 scale-90 origin-bottom-left pointer-events-auto transition-all`}>
            {syncStatus && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border shadow-xl ${
                  syncStatus.fail === 0 ? 'bg-emerald-500 border-emerald-400 text-emerald-950' : 'bg-red-500 border-red-400 text-white'
                }`}
              >
                {syncStatus.fail === 0 ? <CheckCircle2 size={12} /> : <X size={12} />}
                {syncStatus.fail === 0 ? `Sincronia OK: ${syncStatus.success}` : `Erro: ${syncStatus.fail} falhas`}
              </motion.div>
            )}
            
            {pendingSyncCount > 0 && (
              <button 
                onClick={performSync}
                disabled={!isOnline || isSyncing}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black uppercase text-[8px] tracking-widest shadow-2xl border transition-all active:scale-95 ${
                  isSyncing ? 'bg-blue-600 border-blue-400' : 'bg-amber-500 border-amber-300 text-amber-950 hover:bg-amber-400'
                } disabled:grayscale disabled:opacity-50`}
              >
                {isSyncing ? <RefreshCw className="animate-spin" size={10} /> : <CloudLightning size={10} />}
                {isSyncing ? 'Sincronizando...' : `${pendingSyncCount} Pendente${pendingSyncCount > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rodapé Inteligente e Compacto (Recuado para baixo quando sem entregas) */}
      <motion.div 
        layout
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800/90 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] z-20 transition-all flex flex-col ${
          isFooterCollapsed 
            ? 'rounded-t-2xl py-2 sm:py-2.5 px-3 sm:px-4' 
            : 'rounded-t-[28px] max-h-[50vh] sm:max-h-[46vh] p-3 sm:p-4'
        }`}
      >
        {isFooterCollapsed ? (
          /* Visual Recuado / Compacto: Fica no rodapé ocupando espaço mínimo e liberando o mapa */
          <div 
            onClick={() => setIsFooterCollapsed(false)}
            className="w-full flex items-center justify-between cursor-pointer active:opacity-90 select-none py-0.5"
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  activeDelivery ? 'bg-amber-400' : 'bg-emerald-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  activeDelivery ? 'bg-amber-500' : 'bg-emerald-500'
                }`}></span>
              </span>

              <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center shrink-0 text-white/90">
                <TruckIcon size={14} />
              </div>

              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="font-black text-xs uppercase tracking-tight text-white shrink-0">
                  {activeDelivery 
                    ? 'Em Rota' 
                    : `Caminhão ${assignedTruck?.status === 'IDLE' ? 'Disponível' : 'Pronto'}`}
                </span>
                <span className="text-white/30 text-xs shrink-0">•</span>
                <span className="text-white/60 font-medium text-[11px] truncate">
                  {activeDelivery 
                    ? activeDelivery.residentName 
                    : (pendingDeliveries.length > 0 
                        ? `${pendingDeliveries.length} entrega${pendingDeliveries.length > 1 ? 's' : ''} pendente${pendingDeliveries.length > 1 ? 's' : ''}` 
                        : 'Sem entregas • Mapa livre')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendingDeliveries.length > 0 && !activeDelivery && (
                <span className="bg-brand-primary/20 border border-brand-primary/30 text-brand-primary text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                  {pendingDeliveries.length} na fila
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFooterCollapsed(false);
                }}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-colors flex items-center justify-center active:scale-90"
                title="Expandir detalhes"
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* Visual Expandido: Bem mais compacto que antes, com botão fácil para recuar */
          <>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 shrink-0">
              <div 
                onClick={() => setIsFooterCollapsed(true)}
                className="flex items-center gap-2 cursor-pointer group select-none"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    activeDelivery ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    activeDelivery ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}></span>
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  {activeDelivery 
                    ? 'Entrega em Andamento' 
                    : `Caminhão ${assignedTruck?.status === 'IDLE' ? 'Disponível' : 'Pronto'}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsFooterCollapsed(true)}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white/90 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg transition-colors active:scale-95"
                  title="Recuar painel para liberar o mapa"
                >
                  <ChevronDown size={14} /> Recuar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-1">
              {activeDelivery ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2 bg-white/5 p-3 rounded-2xl border border-white/10">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Em Rota de Entrega</span>
                      </div>
                      <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-white truncate">{activeDelivery.residentName}</h2>
                      <p className="text-brand-light/70 text-[11px] font-bold mt-0.5 uppercase tracking-tight truncate">{activeDelivery.address}</p>
                      {activeDelivery.referencePoint && (
                        <p className="text-amber-300 text-[10px] font-medium mt-1 flex items-center gap-1.5">
                          <MapPin size={11} className="text-amber-400 shrink-0" />
                          <span className="truncate">Ref: {activeDelivery.referencePoint}</span>
                        </p>
                      )}
                      {activeDelivery.phone && (
                        <div className="mt-1.5">
                          <a 
                            href={`tel:${activeDelivery.phone}`} 
                            className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg hover:bg-emerald-500/30 transition-all active:scale-95"
                          >
                            <Phone size={10} /> {activeDelivery.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => openInMaps(activeDelivery.lat, activeDelivery.lng)}
                      className="bg-white/10 hover:bg-white/15 border border-white/15 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-white"
                    >
                      <Navigation size={16} className="text-cyan-400" />
                      <span className="font-black text-[10px] uppercase tracking-wider">Navegar</span>
                    </button>
                    <button 
                      onClick={() => setDeliveryToComplete(activeDelivery)}
                      className="bg-emerald-500 hover:bg-emerald-400 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-emerald-950 font-black shadow-lg shadow-emerald-500/30"
                    >
                      <CheckCircle2 size={16} />
                      <span className="text-[10px] uppercase tracking-wider">Concluir</span>
                    </button>
                  </div>

                  {/* Próximas na Fila */}
                  {pendingDeliveries.length > 0 && (
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Próximas na Fila ({pendingDeliveries.length})</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                        {pendingDeliveries.map(d => (
                          <div key={d.id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 bg-brand-light/10 text-brand-light rounded-lg flex items-center justify-center shrink-0">
                                <MapPin size={11} />
                              </div>
                              <div className="truncate">
                                <p className="text-[10px] font-black uppercase tracking-tight truncate">{d.residentName}</p>
                                <p className="text-[8px] text-white/40 uppercase font-bold truncate">{d.address}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingDeliveries.length > 0 ? (
                    <>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-black text-brand-light uppercase tracking-wider">
                          Entregas Pendentes ({pendingDeliveries.length})
                        </span>
                        <button 
                          onClick={handleOptimizeMyRoute}
                          className="bg-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center gap-1 border border-brand-primary/30"
                        >
                          <Navigation size={10} /> Otimizar Rota
                        </button>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {pendingDeliveries.map(delivery => (
                          <div key={delivery.id} className="bg-white/5 p-2.5 rounded-xl border border-white/10 flex items-center justify-between gap-2 group active:scale-[0.99] transition-all">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-black text-xs uppercase tracking-tight truncate text-white">{delivery.residentName}</h4>
                              <p className="text-[9px] text-white/50 uppercase font-bold truncate">{delivery.address}</p>
                              {delivery.referencePoint && (
                                <p className="text-[8px] text-amber-300/80 font-bold uppercase truncate mt-0.5">Ref: {delivery.referencePoint}</p>
                              )}
                            </div>
                            <button 
                              onClick={() => handleStartDelivery(delivery)}
                              className="px-3 py-1.5 bg-brand-light text-brand-dark rounded-lg flex items-center gap-1.5 shadow-md font-black text-[10px] uppercase tracking-wider active:scale-90 transition-all shrink-0 hover:bg-white"
                            >
                              <Navigation size={12} /> Iniciar
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    /* Sem entregas: Card compacto com opção direta de recuar */
                    <div className="py-3 px-4 bg-white/5 rounded-2xl border border-white/5 text-center flex flex-col items-center">
                      <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-white/50 mb-1.5">
                        <TruckIcon size={18} />
                      </div>
                      <h3 className="text-xs font-black uppercase tracking-tight text-white">Caminhão {assignedTruck?.status === 'IDLE' ? 'Disponível' : 'Pronto'}</h3>
                      <p className="text-[9px] text-white/40 uppercase font-bold tracking-wider mt-0.5">Nenhuma entrega em rota ou pendente no momento</p>
                      <button
                        onClick={() => setIsFooterCollapsed(true)}
                        className="mt-2 text-[9px] font-black uppercase tracking-wider text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1 rounded-lg active:scale-95 transition-all"
                      >
                        Recuar painel para liberar tela do mapa
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* Proof of Delivery Modal */}
      <AnimatePresence>
        {deliveryToComplete && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[101] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 p-4 sm:p-7 rounded-2xl sm:rounded-[36px] w-full max-w-sm shadow-2xl border border-slate-700 max-h-[92dvh] overflow-y-auto my-auto"
            >
              <h3 className="text-lg sm:text-xl font-bold mb-1.5 flex items-center gap-2">
                <Camera className="text-emerald-400" /> Confirmar Entrega
              </h3>
              <p className="text-slate-400 text-xs mb-4">Tire uma foto do local ou do morador para confirmar.</p>

              <div className="h-44 sm:h-52 w-full bg-slate-900 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center relative overflow-hidden mb-4">
                {photoBase64 ? (
                  <>
                    <img src={photoBase64} alt="Proof" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setPhotoBase64(null)}
                      className="absolute top-3 right-3 bg-red-500 p-2 rounded-full shadow-lg"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <Camera size={40} className="text-slate-700 mb-3" />
                    <label className="bg-blue-600 px-5 py-2.5 rounded-xl font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-2 text-xs">
                      <Upload size={16} /> Tirar Foto
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={handleFileChange} 
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Seção para salvar coordenadas exatas do GPS da Entrega */}
              <div className="space-y-3 mb-6 bg-slate-900/60 p-4 rounded-3xl border border-slate-700/50 shadow-inner">
                <p className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <MapPin size={12} className="text-emerald-500 animate-pulse" /> 
                  <span>Localização GPS da Entrega</span>
                </p>
                <div className="flex items-start gap-2.5">
                  <input 
                    type="checkbox"
                    id="saveToResidents"
                    checked={saveToResidentsRegister}
                    onChange={(e) => setSaveToResidentsRegister(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-800 text-brand-primary focus:ring-brand-primary"
                  />
                  <label htmlFor="saveToResidents" className="text-[11px] font-bold text-slate-200 cursor-pointer select-none leading-relaxed">
                    Salvar localização atual do GPS como ponto fixo deste morador
                  </label>
                </div>
                
                <p className="text-[9px] text-slate-400 font-medium pl-6 leading-normal">
                  Esta posição exata será gravada no cadastro. Quando o administrador enviar uma entrega futura para este morador, o novo motorista poderá iniciar a navegação por GPS diretamente até esta casa.
                </p>

                {saveToResidentsRegister && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 pt-2 border-t border-slate-800/80 mt-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold uppercase text-slate-400 tracking-widest pl-1">Nome do Morador</label>
                      <input 
                        type="text"
                        value={completedResidentName}
                        onChange={(e) => setCompletedResidentName(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-primary"
                        placeholder="Nome do morador"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold uppercase text-slate-400 tracking-widest pl-1">Endereço</label>
                      <input 
                        type="text"
                        value={completedAddress}
                        onChange={(e) => setCompletedAddress(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-primary"
                        placeholder="Endereço da entrega"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-mono pl-1 pt-1 bg-slate-900/50 p-2 rounded-xl border border-slate-800/60">
                      <MapPin size={11} className="text-emerald-500 animate-pulse shrink-0" />
                      <span className="truncate">GPS exato: {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Obtendo sinal GPS atual...'}</span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    setDeliveryToComplete(null);
                    setPhotoBase64(null);
                  }}
                  className="py-3 bg-slate-700 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  disabled={isUploading}
                  onClick={() => updateDeliveryStatus(
                    deliveryToComplete.id, 
                    'DELIVERED', 
                    'ARRIVED', 
                    photoBase64 || '',
                    location?.lat || deliveryToComplete.lat,
                    location?.lng || deliveryToComplete.lng,
                    completedResidentName,
                    completedAddress,
                    saveToResidentsRegister
                  )}
                  className="py-3 bg-emerald-500 text-emerald-950 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                     <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                       <Camera size={18} />
                     </motion.div>
                  ) : 'Finalizar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddSitio && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-brand-dark border border-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-[32px] w-full max-w-sm shadow-2xl max-h-[92dvh] overflow-y-auto my-auto"
            >
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <MapPin className="text-brand-primary" size={18} /> Registrar Local
                </h3>
                <button onClick={resetSitioModal} className="text-white/50 hover:text-white p-1 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              <div className="bg-white/5 p-3 rounded-2xl mb-4 border border-white/5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[8px] font-black text-white/30 uppercase mb-0.5 tracking-widest">Coordenadas Atuais</p>
                  <p className="font-mono text-xs text-brand-primary">
                    {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Aguardando GPS...'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshGPS}
                  disabled={isRefreshingGps}
                  className="bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 hover:text-white px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1 text-[8px] uppercase font-black tracking-widest transition-all select-none pointer-events-auto"
                >
                  <RefreshCw size={10} className={isRefreshingGps ? 'animate-spin' : ''} />
                  Atualizar GPS
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-white/30 block ml-1 uppercase tracking-widest">Tipo de Local</label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* 1º Esquerda: Morador */}
                    <button 
                      type="button"
                      onClick={() => setNewSitioType('RESIDENT')}
                      className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitioType === 'RESIDENT' ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/40 hover:text-white/70'}`}
                    >
                      <Home size={12} />
                      Morador
                    </button>

                    {/* 2º Meio: Escola */}
                    <button 
                      type="button"
                      onClick={() => setNewSitioType('SCHOOL')}
                      className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitioType === 'SCHOOL' ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/40 hover:text-white/70'}`}
                    >
                      <School size={12} />
                      Escola
                    </button>

                    {/* 3º Direita: Creche */}
                    <button 
                      type="button"
                      onClick={() => setNewSitioType('DAYCARE')}
                      className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitioType === 'DAYCARE' ? 'bg-pink-500 border-pink-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/40 hover:text-white/70'}`}
                    >
                      <Baby size={12} />
                      Creche
                    </button>
                  </div>
                </div>

                {/* Nome do Local / Morador / Escola / Creche */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-white/40 block ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    {newSitioType === 'RESIDENT' ? (
                      <>
                        <MapPin size={11} className="text-emerald-400" /> Nome do Morador <span className="text-red-400">*</span>
                      </>
                    ) : newSitioType === 'SCHOOL' ? (
                      <>
                        <School size={11} className="text-indigo-400" /> Nome da Escola <span className="text-red-400">*</span>
                      </>
                    ) : (
                      <>
                        <Baby size={11} className="text-pink-400" /> Nome da Creche <span className="text-red-400">*</span>
                      </>
                    )}
                  </label>
                  <input 
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none transition-all placeholder:text-white/20"
                    placeholder={
                      newSitioType === 'RESIDENT' ? 'Ex: Seu Raimundo ou Dona Maria' :
                      newSitioType === 'SCHOOL' ? 'Ex: Escola Municipal São José' :
                      'Ex: Creche Municipal Tia Maria'
                    }
                    value={newSitioName}
                    onChange={e => setNewSitioName(e.target.value)}
                  />
                </div>

                {/* Nome do Sítio */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-white/40 block ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    <Home size={11} className="text-sky-400" /> Nome do Sítio / Localidade
                  </label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none transition-all placeholder:text-white/20"
                    placeholder="Ex: Sítio Remanso, Sítio Serrote, etc."
                    value={newResidentSitio}
                    onChange={e => setNewResidentSitio(e.target.value)}
                  />
                </div>

                {/* Vereador que enviou a água */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-white/40 block ml-1 uppercase tracking-widest flex items-center gap-1.5">
                      <Landmark size={11} className="text-purple-400" /> Vereador que enviou a água
                    </label>
                    {newResidentCouncilman && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewResidentCouncilman('');
                          setIsCustomCouncilman(false);
                        }}
                        className="text-[9px] text-amber-400 hover:text-amber-300 font-black uppercase tracking-wider transition-all"
                      >
                        Deixar em branco
                      </button>
                    )}
                  </div>

                  {!isCustomCouncilman ? (
                    <select
                      value={councilmen.some(c => c.name === newResidentCouncilman) ? newResidentCouncilman : (newResidentCouncilman ? '__CUSTOM__' : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          setIsCustomCouncilman(true);
                        } else {
                          setNewResidentCouncilman(val);
                        }
                      }}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none transition-all cursor-pointer"
                    >
                      <option value="" className="text-white/50">
                        — Deixar em branco (Sem vereador) —
                      </option>
                      {councilmen.map((c) => (
                        <option key={c.id} value={c.name} className="text-white">
                          🏛️ {c.name}
                        </option>
                      ))}
                      <option value="__CUSTOM__" className="text-purple-400 font-bold">
                        ➕ Digitar outro vereador...
                      </option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        className="w-full bg-white/5 border border-purple-500/50 rounded-xl px-4 py-3 text-sm text-white focus:border-purple-400 outline-none transition-all placeholder:text-white/30"
                        placeholder="Nome do vereador (ou deixe vazio)"
                        value={newResidentCouncilman}
                        onChange={(e) => setNewResidentCouncilman(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCouncilman(false);
                          setNewResidentCouncilman('');
                        }}
                        className="p-3 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white rounded-xl transition-all"
                        title="Voltar para lista e deixar em branco"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <p className="text-[9px] text-white/30 px-1 font-medium">
                    Caso não tenha indicação de vereador, deixe em branco.
                  </p>
                </div>

                {/* Ponto de Referência */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-white/40 block ml-1 uppercase tracking-widest">
                    Ponto de Referência <span className="text-white/20 font-normal lowercase">(opcional)</span>
                  </label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none transition-all placeholder:text-white/20"
                    placeholder="Ex: Próximo à igrejinha, portão azul"
                    value={newSitioReferencePoint}
                    onChange={e => setNewSitioReferencePoint(e.target.value)}
                  />
                </div>
              </div>

              <button 
                disabled={!location || !newSitioName.trim()}
                onClick={handleRegisterCurrentLocation}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 disabled:grayscale transition-all text-white font-black uppercase text-[10px] tracking-widest py-3.5 rounded-xl mt-6 flex items-center justify-center gap-2 shadow-xl shadow-brand-primary/20"
              >
                <PlusCircle size={16} /> Enviar Localização
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
