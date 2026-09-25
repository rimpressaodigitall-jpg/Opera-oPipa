import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  collection, 
  query, 
  onSnapshot, 
  getDocs,
  addDoc, 
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Truck, 
  Delivery, 
  Sitio, 
  Resident, 
  Councilman, 
  DeliveryStatus, 
  TruckStatus,
  AdminConfig,
  Driver
} from '../types';
import MapContainer from './MapContainer';
import CouncilmanPerformanceSection from './CouncilmanPerformanceSection';
import { fetchRoadRoute, WATER_SUPPLY_POINT, isRoadRoute } from '../lib/routing';
import { 
  Truck as TruckIcon, 
  Droplet, 
  Plus, 
  MapPin, 
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Users,
  UserCheck,
  X,
  Navigation,
  Smartphone,
  Image as ImageIcon,
  Settings,
  Shield,
  Key,
  Save,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit2,
  Database,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Volume2,
  VolumeX,
  BellRing,
  Download,
  ShieldCheck,
  Zap,
  Send,
  Phone,
  Sparkles,
  Home,
  School,
  Baby
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { playDeliveryCompletedChime, playTestChime } from '../lib/audioNotification';
import { 
  checkFirebaseConnection, 
  downloadFirebaseJsonBackup, 
  FirebaseConnectionStatus 
} from '../lib/firebaseService';
import AndroidInstallBanner from './AndroidInstallBanner';

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth's radius in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AdminApp({ onTrocarAcesso }: { onTrocarAcesso?: () => void } = {}) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [sitios, setSitios] = useState<Sitio[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [councilmen, setCouncilmen] = useState<Councilman[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'deliveries' | 'sitios' | 'residents' | 'settings' | 'sync'>('map');
  const [deviceSyncStatuses, setDeviceSyncStatuses] = useState<any[]>([]);
  const [activeCadastroSubTab, setActiveCadastroSubTab] = useState<'resident' | 'truck' | 'driver' | 'councilman'>('resident');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showAddTruck, setShowAddTruck] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [showAddSitio, setShowAddSitio] = useState(false);
  const [editingSitio, setEditingSitio] = useState<Sitio | null>(null);
  const [showAddResident, setShowAddResident] = useState(false);
  const [showAddCouncilman, setShowAddCouncilman] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [selectedSitio, setSelectedSitio] = useState<Sitio | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][] | undefined>(undefined);
  const [adminToast, setAdminToast] = useState<{ show: boolean, message: string }>({ show: false, message: '' });
  const [activeDashboardModal, setActiveDashboardModal] = useState<'completed' | 'active_trucks' | 'pending' | null>(null);

  // Real-time calculated dashboard statistics for the map monitoring tab
  const todayStr = new Date().toLocaleDateString('en-CA');
  const deliveriesCompletedToday = deliveries.filter(d => {
    if (d.status !== 'DELIVERED' || !d.createdAt) return false;
    try {
      const dDateStr = new Date(d.createdAt).toLocaleDateString('en-CA');
      return dDateStr === todayStr;
    } catch (e) {
      return d.createdAt.startsWith(todayStr);
    }
  }).length;

  const totalCompletedDeliveries = deliveries.filter(d => d.status === 'DELIVERED').length;
  const trucksInRoute = trucks.filter(t => t.status === 'IN_ROUTE').length;
  const pendingDeliveries = deliveries.filter(d => d.status === 'PENDING').length;

  // New Item states
  const [newTruck, setNewTruck] = useState({ plate: '', driverName: '' });
  const [newDelivery, setNewDelivery] = useState<{ 
    truckId: string; 
    residentId?: string;
    residentName: string; 
    address: string; 
    neighborhood?: string;
    referencePoint: string; 
    phone?: string;
    councilman: string; 
    lat: number; 
    lng: number; 
  }>({ 
    truckId: '', 
    residentId: '',
    residentName: '', 
    address: '', 
    neighborhood: '',
    referencePoint: '', 
    phone: '',
    councilman: '', 
    lat: -9.2201, 
    lng: -36.3503 
  });
  const [selectedResidentObj, setSelectedResidentObj] = useState<Resident | null>(null);
  const [newSitio, setNewSitio] = useState({ 
    name: '', 
    description: '', 
    lat: -9.2201, 
    lng: -36.3503, 
    rawCoords: '-9.2201, -36.3503',
    type: 'RESIDENT' as 'RESIDENT' | 'SCHOOL' | 'DAYCARE' | 'WATER' | 'FUEL' | 'OTHER',
    fuelType: 'NONE' as 'DIESEL' | 'GASOLINE' | 'NONE'
  });
  const [newResident, setNewResident] = useState({ 
    name: '', 
    address: '', 
    neighborhood: '', 
    phone: '', 
    referencePoint: '',
    councilman: ''
  });
  const [isAddingCouncilmanInResident, setIsAddingCouncilmanInResident] = useState(false);
  const [inlineCouncilmanName, setInlineCouncilmanName] = useState('');
  const [newDriver, setNewDriver] = useState({ name: '', phone: '' });
  const [newCouncilman, setNewCouncilman] = useState({ name: '' });

  // Settings State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // Delete Delivery History Password Confirmation State
  const [actualAdminPassword, setActualAdminPassword] = useState('123456');
  const [showDeleteDeliveriesModal, setShowDeleteDeliveriesModal] = useState(false);
  const [deleteHistoryPassword, setDeleteHistoryPassword] = useState('');
  const [deleteHistoryError, setDeleteHistoryError] = useState('');

  // Finish Route Password Confirmation State
  const [showFinishRouteModal, setShowFinishRouteModal] = useState(false);
  const [routeToFinishTruck, setRouteToFinishTruck] = useState<Truck | null>(null);
  const [finishRoutePassword, setFinishRoutePassword] = useState('');
  const [finishRouteError, setFinishRouteError] = useState('');

  // Firebase State
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseConnectionStatus | null>(null);
  const [isCheckingFirebase, setIsCheckingFirebase] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  // Sound Notification State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('admin_delivery_sound');
    return saved !== 'false';
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('admin_delivery_sound', soundEnabled ? 'true' : 'false');
  }, [soundEnabled]);

  // Realtime Delivery Completed Alert Banner
  const [completedDeliveryAlert, setCompletedDeliveryAlert] = useState<{
    show: boolean;
    residentName: string;
    driverName?: string;
    plate?: string;
    timestamp: string;
  } | null>(null);

  const prevDeliveriesMapRef = useRef<Map<string, DeliveryStatus>>(new Map());
  const isInitialDeliveriesLoadRef = useRef(true);
  const trucksRef = useRef<Truck[]>([]);
  useEffect(() => {
    trucksRef.current = trucks;
  }, [trucks]);

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    if (nextVal) {
      playTestChime();
      setAdminToast({ show: true, message: 'Notificações sonoras ATIVADAS 🔊' });
    } else {
      setAdminToast({ show: true, message: 'Notificações sonoras DESATIVADAS 🔇' });
    }
    setTimeout(() => setAdminToast({ show: false, message: '' }), 2500);
  };

  const handleCheckFirebase = async () => {
    setIsCheckingFirebase(true);
    try {
      const res = await checkFirebaseConnection();
      setFirebaseStatus(res);
    } catch (e: any) {
      setFirebaseStatus({ 
        connected: false, 
        message: e?.message || 'Erro ao checar Firestore',
        projectId: 'ai-studio-dad26a59-43f1-4ca1-9d3e-846540128eb8',
        databaseId: '(default)',
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } finally {
      setIsCheckingFirebase(false);
    }
  };

  const handleExportFirebaseBackup = () => {
    setIsExportingBackup(true);
    try {
      downloadFirebaseJsonBackup({
        trucks,
        deliveries,
        sitios,
        residents,
        councilmen,
        drivers
      });
      setAdminToast({ show: true, message: 'Backup JSON das coleções do Firebase exportado com sucesso! 📥' });
    } catch (err: any) {
      setAdminToast({ show: true, message: 'Erro ao gerar backup: ' + (err?.message || err) });
    } finally {
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      setIsExportingBackup(false);
    }
  };

  useEffect(() => {
    handleCheckFirebase();
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
      setTrucks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Truck)));
    }, handleErr('trucks'));

    const qDeliveries = query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'));
    const unsubDeliveries = onSnapshot(qDeliveries, (snap) => {
      const currentDeliveries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Delivery));
      setDeliveries(currentDeliveries);

      if (isInitialDeliveriesLoadRef.current) {
        // Inicialização inicial: guarda o estado atual sem disparar som
        currentDeliveries.forEach(d => {
          prevDeliveriesMapRef.current.set(d.id, d.status);
        });
        isInitialDeliveriesLoadRef.current = false;
      } else {
        // Monitoramento em tempo real de novas conclusões feitas por motoristas
        currentDeliveries.forEach(d => {
          const prevStatus = prevDeliveriesMapRef.current.get(d.id);
          // Se a entrega não era concluída e agora passou a ser DELIVERED (Concluída)
          if (d.status === 'DELIVERED' && prevStatus && prevStatus !== 'DELIVERED') {
            const matchedTruck = trucksRef.current.find(t => t.id === d.truckId);
            
            // Dispara o alerta sonoro se estiver ativado
            if (soundEnabledRef.current) {
              playDeliveryCompletedChime();
            }

            // Exibe notificação visual em tempo real no topo
            const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            setCompletedDeliveryAlert({
              show: true,
              residentName: d.residentName,
              driverName: matchedTruck?.driverName,
              plate: matchedTruck?.plate,
              timestamp: timeStr
            });

            // Esconde após 7 segundos
            setTimeout(() => {
              setCompletedDeliveryAlert(prev => (prev?.residentName === d.residentName ? null : prev));
            }, 7000);
          }
          prevDeliveriesMapRef.current.set(d.id, d.status);
        });
      }
    }, handleErr('deliveries'));

    const qSitios = query(collection(db, 'sitios'));
    const unsubSitios = onSnapshot(qSitios, (snap) => {
      setSitios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sitio)));
    }, handleErr('sitios'));

    const qResidents = query(collection(db, 'residents'), orderBy('name', 'asc'));
    const unsubResidents = onSnapshot(qResidents, (snap) => {
      setResidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resident)));
    }, handleErr('residents'));

    const qCouncilmen = query(collection(db, 'councilmen'), orderBy('name', 'asc'));
    const unsubCouncilmen = onSnapshot(qCouncilmen, (snap) => {
      setCouncilmen(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Councilman)));
    }, handleErr('councilmen'));

    const qDrivers = query(collection(db, 'drivers'), orderBy('name', 'asc'));
    const unsubDrivers = onSnapshot(qDrivers, (snap) => {
      setDrivers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver)));
    }, handleErr('drivers'));

    const qDeviceSync = query(collection(db, 'device_sync_status'), orderBy('lastUpdate', 'desc'));
    const unsubDeviceSync = onSnapshot(qDeviceSync, (snap) => {
      setDeviceSyncStatuses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleErr('device_sync_status'));

    const unsubAdminConfig = onSnapshot(doc(db, 'config', 'admin'), (snap) => {
      if (snap.exists() && snap.data().password) {
        setActualAdminPassword(snap.data().password);
      } else {
        setActualAdminPassword('123456');
      }
    }, handleErr('config/admin'));

    return () => {
      unsubTrucks();
      unsubDeliveries();
      unsubSitios();
      unsubResidents();
      unsubCouncilmen();
      unsubDrivers();
      unsubDeviceSync();
      unsubAdminConfig();
    };
  }, []);

  const handleAddTruck = async () => {
    if (!newTruck.plate || !newTruck.driverName) return;
    try {
      await addDoc(collection(db, 'trucks'), {
        ...newTruck,
        status: 'IDLE' as TruckStatus,
        lastUpdate: new Date().toISOString()
      });
      setAdminToast({ show: true, message: 'Caminhão cadastrado com sucesso no Firebase!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      // Fallback local memory state to let them continue
      const tempId = 'temp-truck-' + Date.now();
      const tObj: Truck = { id: tempId, plate: newTruck.plate, driverName: newTruck.driverName, status: 'IDLE', lastUpdate: new Date().toISOString() };
      setTrucks(prev => [...prev, tObj]);
      setAdminToast({ show: true, message: 'Salvo localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setNewTruck({ plate: '', driverName: '' });
      setShowAddTruck(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyDeliveries = deliveries.filter(d => {
      const dDate = new Date(d.createdAt || '');
      return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear;
    });

    const tableColumn = ["Morador", "Endereço", "Indicação", "Status"];
    const tableRows = monthlyDeliveries.map(d => [
      d.residentName,
      d.address,
      d.councilman || '—',
      d.status === 'DELIVERED' ? 'ENTREGUE' : d.status === 'IN_ROUTE' ? 'EM ROTA' : 'PENDENTE'
    ]);

    doc.text(`Relatório de Entregas - ${now.toLocaleString('pt-BR', { month: 'long' })}/${currentYear}`, 14, 15);
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`relatorio-entregas-${currentMonth + 1}-${currentYear}.pdf`);
  };

  const handleSelectResident = (resident: Resident | null) => {
    if (!resident) {
      setSelectedResidentObj(null);
      setNewDelivery(prev => ({
        ...prev,
        residentId: '',
        residentName: '',
        address: '',
        neighborhood: '',
        referencePoint: '',
        phone: '',
        councilman: '',
        lat: -9.2201,
        lng: -36.3503
      }));
      return;
    }

    setSelectedResidentObj(resident);

    // Buscar histórico de entregas anteriores deste morador para obter dados complementares (ex: coordenadas verificadas ou indicação habitual)
    const prevDeliveries = deliveries.filter(d => 
      (d.residentId && d.residentId === resident.id) || 
      (d.residentName && d.residentName.trim().toLowerCase() === resident.name.trim().toLowerCase())
    );
    const lastDeliveryWithCouncilman = prevDeliveries.find(d => d.councilman && d.councilman.trim() !== '');
    const lastDeliveryWithCoords = prevDeliveries.find(d => d.lat && d.lng && (d.lat !== -9.2201 || d.lng !== -36.3503));

    // Montar endereço completo e legível: se o bairro/sítio não estiver no endereço, concatenar
    let fullAddress = (resident.address || '').trim();
    const neighborhood = (resident.neighborhood || '').trim();
    if (neighborhood && !fullAddress.toLowerCase().includes(neighborhood.toLowerCase())) {
      fullAddress = fullAddress ? `${fullAddress} - ${neighborhood}` : neighborhood;
    }

    // Coordenadas: prioridade cadastro do morador > última entrega realizada > centro de Inhapi
    const chosenLat = (resident.lat !== undefined && resident.lat !== 0)
      ? resident.lat
      : (lastDeliveryWithCoords?.lat || -9.2201);
    const chosenLng = (resident.lng !== undefined && resident.lng !== 0)
      ? resident.lng
      : (lastDeliveryWithCoords?.lng || -36.3503);

    const chosenCouncilman = resident.councilman || lastDeliveryWithCouncilman?.councilman || '';

    setNewDelivery(prev => ({
      ...prev,
      residentId: resident.id,
      residentName: resident.name,
      address: fullAddress,
      neighborhood: resident.neighborhood || '',
      referencePoint: resident.referencePoint || '',
      phone: resident.phone || '',
      councilman: chosenCouncilman || prev.councilman,
      lat: chosenLat,
      lng: chosenLng
    }));
  };

  const handleQuickDispatchForResident = (resident: Resident) => {
    handleSelectResident(resident);
    // Auto-selecionar o primeiro caminhão disponível caso nenhum esteja selecionado
    if (!newDelivery.truckId) {
      const availableTruck = trucks.find(t => t.status === 'IDLE') || trucks[0];
      if (availableTruck) {
        setNewDelivery(prev => ({ ...prev, truckId: availableTruck.id }));
      }
    }
    setShowAddDelivery(true);
  };

  const handleAddDelivery = async () => {
    if (!newDelivery.truckId || !newDelivery.residentName || !newDelivery.address) {
      setAdminToast({ show: true, message: 'Selecione um caminhão, morador e endereço.' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
      return;
    }

    const payload: any = {
      truckId: newDelivery.truckId,
      residentName: newDelivery.residentName,
      address: newDelivery.address,
      referencePoint: newDelivery.referencePoint || '',
      councilman: newDelivery.councilman || '',
      lat: Number(newDelivery.lat) || -9.2201,
      lng: Number(newDelivery.lng) || -36.3503,
      status: 'PENDING' as DeliveryStatus,
      createdAt: new Date().toISOString()
    };
    if (newDelivery.residentId) payload.residentId = newDelivery.residentId;
    if (newDelivery.neighborhood) payload.neighborhood = newDelivery.neighborhood;
    if (newDelivery.phone) payload.phone = newDelivery.phone;

    try {
      await addDoc(collection(db, 'deliveries'), payload);

      // Sincronizar e manter dados atualizados no cadastro do morador no banco
      if (newDelivery.residentId) {
        try {
          await updateDoc(doc(db, 'residents', newDelivery.residentId), {
            referencePoint: newDelivery.referencePoint || '',
            phone: newDelivery.phone || '',
            lat: Number(newDelivery.lat) || -9.2201,
            lng: Number(newDelivery.lng) || -36.3503,
            lastDeliveryAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Could not sync to resident document:", e);
        }
      }
      
      const truck = trucks.find(t => t.id === newDelivery.truckId);
      setAdminToast({ 
        show: true, 
        message: `Entrega despachada para ${newDelivery.residentName}! ${truck ? truck.driverName : 'O motorista'} foi notificado.` 
      });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      const tempId = 'temp-del-' + Date.now();
      const dObj: Delivery = { id: tempId, ...payload } as Delivery;
      setDeliveries(prev => [dObj, ...prev]);
      setAdminToast({ show: true, message: 'Despachado localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setSelectedResidentObj(null);
      setNewDelivery({ 
        truckId: '', 
        residentId: '',
        residentName: '', 
        address: '', 
        neighborhood: '',
        referencePoint: '', 
        phone: '',
        councilman: '', 
        lat: -9.2201, 
        lng: -36.3503 
      });
      setShowAddDelivery(false);
    }
  };

  const handleAddSitio = async () => {
    if (!newSitio.name || !newSitio.lat || !newSitio.lng) return;
    
    const payload = {
      ...newSitio,
      lat: Number(newSitio.lat),
      lng: Number(newSitio.lng),
      fuelType: newSitio.type === 'FUEL' ? newSitio.fuelType : 'NONE'
    };

    try {
      if (editingSitio) {
        await updateDoc(doc(db, 'sitios', editingSitio.id), payload);
        setAdminToast({ show: true, message: 'Ponto atualizado com sucesso no Firebase!' });
      } else {
        await addDoc(collection(db, 'sitios'), payload);
        setAdminToast({ show: true, message: 'Ponto cadastrado com sucesso no Firebase!' });
      }
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      const tempId = editingSitio ? editingSitio.id : 'temp-sitio-' + Date.now();
      const sObj = { id: tempId, ...payload } as Sitio;
      if (editingSitio) {
        setSitios(prev => prev.map(s => s.id === editingSitio.id ? sObj : s));
      } else {
        setSitios(prev => [...prev, sObj]);
      }
      setAdminToast({ show: true, message: 'Salvo localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4500);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setNewSitio({ 
        name: '', 
        description: '', 
        lat: -9.2201, 
        lng: -36.3503,
        rawCoords: '-9.2201, -36.3503',
        type: 'RESIDENT',
        fuelType: 'NONE'
      });
      setEditingSitio(null);
      setShowAddSitio(false);
    }
  };

  const handleQuickAddCouncilman = async (name: string): Promise<string> => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    try {
      const docRef = await addDoc(collection(db, 'councilmen'), { name: trimmed });
      const newObj: Councilman = { id: docRef.id, name: trimmed };
      setCouncilmen(prev => prev.some(c => c.name.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, newObj]);
      setAdminToast({ show: true, message: `Vereador "${trimmed}" cadastrado no Firebase!` });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
      return trimmed;
    } catch (err: any) {
      console.error("Failed to add councilman:", err);
      const tempId = 'temp-coun-' + Date.now();
      const newObj: Councilman = { id: tempId, name: trimmed };
      setCouncilmen(prev => [...prev, newObj]);
      setAdminToast({ show: true, message: `Vereador "${trimmed}" salvo localmente!` });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
      return trimmed;
    }
  };

  const handleAddResident = async () => {
    if (!newResident.name || !newResident.address) return;
    try {
      await addDoc(collection(db, 'residents'), newResident);
      setAdminToast({ show: true, message: 'Morador cadastrado com sucesso no Firebase!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      const tempId = 'temp-res-' + Date.now();
      const rObj = { id: tempId, ...newResident } as Resident;
      setResidents(prev => [...prev, rObj]);
      setAdminToast({ show: true, message: 'Salvo localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setNewResident({ name: '', address: '', neighborhood: '', phone: '', referencePoint: '', councilman: '' });
      setIsAddingCouncilmanInResident(false);
      setInlineCouncilmanName('');
      setShowAddResident(false);
    }
  };

  const handleAddCouncilman = async () => {
    if (!newCouncilman.name) return;
    try {
      await addDoc(collection(db, 'councilmen'), newCouncilman);
      setAdminToast({ show: true, message: 'Vereador cadastrado com sucesso no Firebase!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      const tempId = 'temp-coun-' + Date.now();
      const cObj = { id: tempId, ...newCouncilman } as Councilman;
      setCouncilmen(prev => [...prev, cObj]);
      setAdminToast({ show: true, message: 'Salvo localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setNewCouncilman({ name: '' });
      setShowAddCouncilman(false);
    }
  };

  const handleAddDriver = async () => {
    if (!newDriver.name || !newDriver.phone) return;
    try {
      await addDoc(collection(db, 'drivers'), newDriver);
      setAdminToast({ show: true, message: 'Motorista cadastrado com sucesso no Firebase!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      console.error("Firestore save failed:", err);
      const tempId = 'temp-drv-' + Date.now();
      const drvObj = { id: tempId, ...newDriver } as Driver;
      setDrivers(prev => [...prev, drvObj]);
      setAdminToast({ show: true, message: 'Salvo localmente (Operando em Contingência)' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
      if (err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('resource-exhausted')) {
        window.dispatchEvent(new CustomEvent('firebase-quota-exceeded'));
      }
    } finally {
      setNewDriver({ name: '', phone: '' });
      setShowAddDriver(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const handleDelete = (collectionName: string, id: string) => {
    setDeleteConfirm({
      show: true,
      title: 'Excluir Item',
      message: 'Tem certeza que deseja excluir este item permanentemente? Esta ação não poderá ser desfeita.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, collectionName, id));
          setAdminToast({ show: true, message: 'Item excluído com sucesso!' });
          setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
        } catch (e: any) {
          setAdminToast({ show: true, message: 'Erro ao excluir item: ' + e.message });
          setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
        }
      }
    });
  };

  const handleDeleteAll = (collectionName: string, items: any[]) => {
    if (!items || items.length === 0) {
      setAdminToast({ show: true, message: 'Não há itens para apagar.' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
      return;
    }
    
    const translateCol: Record<string, string> = {
      residents: 'moradores',
      trucks: 'caminhões',
      drivers: 'motoristas',
      councilmen: 'vereadores',
      deliveries: 'entregas',
      sitios: 'pontos de abastecimento'
    };
    const colLabel = translateCol[collectionName] || collectionName;

    setDeleteConfirm({
      show: true,
      title: 'Apagar Todos os Registros',
      message: `ATENÇÃO: Isso apagará permanentemente todos os ${items.length} itens de ${colLabel}. Deseja prosseguir com a exclusão em massa?`,
      onConfirm: async () => {
        const batch = writeBatch(db);
        items.forEach(item => {
          if (item && item.id) {
            batch.delete(doc(db, collectionName, item.id));
          }
        });

        try {
          await batch.commit();
          setAdminToast({ show: true, message: `Todos os itens de ${colLabel} foram apagados.` });                
          setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);                
        } catch (e: any) {
          setAdminToast({ show: true, message: 'Erro ao apagar todos: ' + e.message });
          setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);
        }
      }
    });
  };

  const DeleteConfirmationModal = () => {
    if (!deleteConfirm) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] p-6 max-w-sm w-full border border-slate-100 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center self-start">
            <Trash2 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">{deleteConfirm.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{deleteConfirm.message}</p>
          </div>
          <div className="flex gap-2.5 mt-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-slate-600 text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                deleteConfirm.onConfirm();
                setDeleteConfirm(null);
              }}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors"
            >
              Excluir
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleDeleteAllDeliveries = async () => {
    if (deleteHistoryPassword !== actualAdminPassword) {
      setDeleteHistoryError('Senha incorreta.');
      return;
    }

    if (deliveries.length === 0) {
      setDeleteHistoryError('Não há entregas para apagar.');
      return;
    }

    try {
      const batch = writeBatch(db);
      deliveries.forEach(delivery => {
        batch.delete(doc(db, 'deliveries', delivery.id));
      });
      await batch.commit();

      setAdminToast({ show: true, message: 'Histórico de entregas apagado com sucesso!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
      setShowDeleteDeliveriesModal(false);
      setDeleteHistoryPassword('');
      setDeleteHistoryError('');
    } catch (e: any) {
      setDeleteHistoryError('Erro ao apagar histórico: ' + e.message);
    }
  };

  const handleFinishRouteWithPassword = async () => {
    if (!routeToFinishTruck) return;
    if (finishRoutePassword !== actualAdminPassword) {
      setFinishRouteError('Senha de administrador incorreta.');
      return;
    }

    try {
      await updateDoc(doc(db, 'trucks', routeToFinishTruck.id), {
        status: 'IDLE',
        lastUpdate: new Date().toISOString()
      });

      const truckDeliveries = deliveries.filter(d => d.truckId === routeToFinishTruck.id && d.status === 'IN_ROUTE');
      for (const d of truckDeliveries) {
        await updateDoc(doc(db, 'deliveries', d.id), {
          status: 'DELIVERED',
          createdAt: d.createdAt || new Date().toISOString()
        });
      }

      setAdminToast({ show: true, message: `Rota do motorista ${routeToFinishTruck.driverName} finalizada com sucesso!` });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 4000);

      setShowFinishRouteModal(false);
      setRouteToFinishTruck(null);
      setFinishRoutePassword('');
      setFinishRouteError('');
    } catch (e: any) {
      setFinishRouteError('Erro ao finalizar rota: ' + (e?.message || e));
    }
  };

  const FinishRouteModal = () => {
    if (!showFinishRouteModal || !routeToFinishTruck) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] p-6 max-w-sm w-full border border-slate-100 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center self-start">
            <Lock size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Finalizar Rota</h3>
            <p className="text-sm text-slate-500 mt-1">
              Deseja finalizar a rota do motorista <strong>{routeToFinishTruck.driverName}</strong> ({routeToFinishTruck.plate})? Digite a senha administrativa para confirmar:
            </p>
          </div>
          
          <div className="flex flex-col gap-1">
            <input
              type="password"
              placeholder="Senha de Administrador"
              value={finishRoutePassword}
              onChange={e => {
                setFinishRoutePassword(e.target.value);
                setFinishRouteError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleFinishRouteWithPassword();
                }
              }}
              className="bg-slate-100 px-4 py-3 rounded-xl text-sm outline-none border border-transparent focus:border-red-500 focus:bg-white transition-all text-center font-mono tracking-widest"
              autoFocus
            />
            {finishRouteError && (
              <p className="text-red-500 text-xs font-bold px-1 mt-1 uppercase tracking-wider">
                ⚠️ {finishRouteError}
              </p>
            )}
          </div>

          <div className="flex gap-2.5 mt-2">
            <button
              onClick={() => {
                setShowFinishRouteModal(false);
                setRouteToFinishTruck(null);
                setFinishRoutePassword('');
                setFinishRouteError('');
              }}
              className="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-slate-600 text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleFinishRouteWithPassword}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const DeleteDeliveriesModal = () => {
    if (!showDeleteDeliveriesModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] p-6 max-w-sm w-full border border-slate-100 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center self-start">
            <Trash2 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 mt-1">
              Esta ação apagará <strong>permanentemente</strong> todas as {deliveries.length} entregas do histórico. Digite a senha administrativa do sistema para confirmar:
            </p>
          </div>
          
          <div className="flex flex-col gap-1">
            <input
              type="password"
              placeholder="Senha de Administrador"
              value={deleteHistoryPassword}
              onChange={e => {
                setDeleteHistoryPassword(e.target.value);
                setDeleteHistoryError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleDeleteAllDeliveries();
                }
              }}
              className="bg-slate-100 px-4 py-3 rounded-xl text-sm outline-none border border-transparent focus:border-red-500 focus:bg-white transition-all text-center font-mono tracking-widest"
              autoFocus
            />
            {deleteHistoryError && (
              <p className="text-red-500 text-xs font-bold px-1 mt-1 uppercase tracking-wider">
                ⚠️ {deleteHistoryError}
              </p>
            )}
          </div>

          <div className="flex gap-2.5 mt-2">
            <button
              onClick={() => {
                setShowDeleteDeliveriesModal(false);
                setDeleteHistoryPassword('');
                setDeleteHistoryError('');
              }}
              className="flex-1 bg-slate-100 py-3 rounded-xl font-bold text-slate-600 text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteAllDeliveries}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const [editItem, setEditItem] = useState<{ collectionName: string, item: any } | null>(null);
  const [residentSearch, setResidentSearch] = useState('');
  const [statusConfirmationModal, setStatusConfirmationModal] = useState<{ delivery: Delivery } | null>(null);
  
  const handleEdit = (collectionName: string, item: any) => {
    setEditItem({ collectionName, item });
  };

  const handleUpdate = async (collectionName: string, id: string, data: any) => {
    try {
      await updateDoc(doc(db, collectionName, id), data);
      setEditItem(null);
      setAdminToast({ show: true, message: 'Item atualizado!' });
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (e: any) {
      alert('Erro ao atualizar item: ' + e.message);
    }
  };

  const EditModal = () => {
    if (!editItem) return null;
    const { collectionName, item } = editItem;
    const [fields, setFields] = useState({ ...item });
    const [isAddingCouncilmanEdit, setIsAddingCouncilmanEdit] = useState(false);
    const [inlineCouncilmanEdit, setInlineCouncilmanEdit] = useState('');
    
    return (
      <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white p-6 md:p-8 rounded-[40px] w-full max-w-md shadow-2xl border-4 border-brand-dark/10 max-h-[92vh] overflow-y-auto custom-scrollbar">
          <h3 className="text-xl font-black mb-6 uppercase tracking-tight">
            Editar {
              collectionName === 'residents' ? 'Morador' :
              collectionName === 'trucks' ? 'Caminhão' :
              collectionName === 'drivers' ? 'Motorista' : 'Vereador'
            }
          </h3>
          
          <div className="space-y-4">
            {collectionName === 'residents' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Nome Completo</label>
                  <input 
                    type="text" 
                    value={fields.name || ''} 
                    onChange={e => setFields({ ...fields, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Endereço</label>
                  <input 
                    type="text" 
                    value={fields.address || ''} 
                    onChange={e => setFields({ ...fields, address: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Bairro / Sítio</label>
                  <input 
                    type="text" 
                    value={fields.neighborhood || ''} 
                    onChange={e => setFields({ ...fields, neighborhood: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Telefone</label>
                  <input 
                    type="text" 
                    value={fields.phone || ''} 
                    onChange={e => setFields({ ...fields, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Ponto de Referência</label>
                  <input 
                    type="text" 
                    value={fields.referencePoint || ''} 
                    onChange={e => setFields({ ...fields, referencePoint: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm font-sans"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Vereador / Indicação</label>
                    {!isAddingCouncilmanEdit && (
                      <button
                        type="button"
                        onClick={() => { setIsAddingCouncilmanEdit(true); setInlineCouncilmanEdit(''); }}
                        className="text-[10px] font-black text-purple-600 hover:text-purple-700 flex items-center gap-0.5 active:scale-95 transition-all"
                      >
                        <Plus size={10} /> Novo Vereador
                      </button>
                    )}
                  </div>
                  {!isAddingCouncilmanEdit ? (
                    <select 
                      value={fields.councilman || ''} 
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsAddingCouncilmanEdit(true);
                          setInlineCouncilmanEdit('');
                        } else {
                          setFields({ ...fields, councilman: e.target.value });
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                    >
                      <option value="">Nenhum / Não informado</option>
                      {councilmen.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      <option value="__ADD_NEW__" className="text-purple-600 font-bold">➕ Adicionar Novo Vereador...</option>
                    </select>
                  ) : (
                    <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider">Novo Vereador</span>
                        <button
                          type="button"
                          onClick={() => { setIsAddingCouncilmanEdit(false); setInlineCouncilmanEdit(''); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Nome do Vereador"
                          value={inlineCouncilmanEdit}
                          onChange={e => setInlineCouncilmanEdit(e.target.value)}
                          className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          disabled={!inlineCouncilmanEdit.trim()}
                          onClick={async () => {
                            if (inlineCouncilmanEdit.trim()) {
                              const saved = await handleQuickAddCouncilman(inlineCouncilmanEdit);
                              setFields({ ...fields, councilman: saved });
                              setIsAddingCouncilmanEdit(false);
                              setInlineCouncilmanEdit('');
                            }
                          }}
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold active:scale-95 transition-all"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {collectionName === 'trucks' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Placa</label>
                  <input 
                    type="text" 
                    value={fields.plate || ''} 
                    onChange={e => setFields({ ...fields, plate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Motorista</label>
                  <select 
                    value={fields.driverName || ''} 
                    onChange={e => setFields({ ...fields, driverName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  >
                    <option value="">Selecionar Motorista...</option>
                    {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {collectionName === 'drivers' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Nome do Motorista</label>
                  <input 
                    type="text" 
                    value={fields.name || ''} 
                    onChange={e => setFields({ ...fields, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Telefone</label>
                  <input 
                    type="text" 
                    value={fields.phone || ''} 
                    onChange={e => setFields({ ...fields, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm font-mono"
                  />
                </div>
              </>
            )}

            {collectionName === 'councilmen' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 font-mono">Nome do Vereador</label>
                  <input 
                    type="text" 
                    value={fields.name || ''} 
                    onChange={e => setFields({ ...fields, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-brand-primary outline-none rounded-xl px-4 py-3 text-sm"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-4 mt-8">
            <button 
              onClick={() => setEditItem(null)} 
              className="flex-1 py-3.5 rounded-xl border border-slate-200 text-xs font-bold uppercase transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                const { id, ...payload } = fields;
                handleUpdate(collectionName, item.id, payload);
              }} 
              className="flex-1 py-3.5 rounded-xl bg-brand-dark text-white text-xs font-black uppercase shadow-lg shadow-brand-dark/20 hover:scale-[1.02] transition-transform active:scale-95"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const StatusConfirmationModal = () => {
    if (!statusConfirmationModal) return null;
    const { delivery } = statusConfirmationModal;
    
    const getNextStatus = (currentStatus: string) => {
      if (currentStatus === 'PENDING') return 'IN_ROUTE';
      if (currentStatus === 'IN_ROUTE') return 'DELIVERED';
      return null;
    };

    const nextStatus = getNextStatus(delivery.status);
    
    const handleConfirm = async () => {
      if (!nextStatus) return;
      try {
        await updateDoc(doc(db, 'deliveries', delivery.id), { status: nextStatus });
        setAdminToast({ show: true, message: `Status alterado para ${nextStatus === 'IN_ROUTE' ? 'Em Rota' : 'Entregue'}!` });
        setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
        setStatusConfirmationModal(null);
      } catch (e: any) {
        alert('Erro ao atualizar status: ' + e.message);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-3xl w-full max-w-sm shadow-xl">
          <h3 className="text-xl font-black mb-4">Confirmar Alteração</h3>
          <p className="text-slate-500 mb-6">Deseja alterar o status da entrega de <span className="font-bold">{delivery.residentName}</span> para <span className="font-bold">{nextStatus === 'IN_ROUTE' ? 'Em Rota' : 'Entregue'}</span>?</p>
          <div className="flex gap-4">
            <button onClick={() => setStatusConfirmationModal(null)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold hover:bg-slate-200">Cancelar</button>
            <button onClick={handleConfirm} className="flex-1 bg-brand-dark text-white py-3 rounded-xl font-bold hover:bg-indigo-900">Confirmar</button>
          </div>
        </div>
      </div>
    );
  };


  const handleResetAppData = async () => {
    if (resetPasswordInput !== 'admin') {
      alert('Senha incorreta.');
      return;
    }
    
    if (!confirm('TEM CERTEZA? Isso apagará todos os dados de forma irreversível.')) return;

    try {
      const collectionsToReset = ['residents', 'trucks', 'drivers', 'councilmen', 'deliveries', 'sitios'];
      for (const colName of collectionsToReset) {
        const q = query(collection(db, colName));
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          await deleteDoc(doc(db, colName, docSnap.id));
        }
      }
      alert('Dados resetados com sucesso.');
      setResetPasswordInput('');
      setShowResetConfirmation(false);
    } catch (e: any) {
      alert('Erro ao resetar: ' + e.message);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      setSettingsError('A senha deve ter pelo menos 4 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSettingsError('As senhas não coincidem');
      return;
    }

    setSettingsLoading(true);
    setSettingsError('');
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        password: newPassword,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setSettingsSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (e) {
      setSettingsError('Erro ao salvar nova senha');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleResetAdminPasswordToDefault = async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        password: '123456',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setActualAdminPassword('123456');
      setSettingsSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setAdminToast({ show: true, message: 'Senha do administrador restaurada para 123456!' });
      setTimeout(() => setSettingsSuccess(false), 3000);
      setTimeout(() => setAdminToast({ show: false, message: '' }), 3000);
    } catch (e: any) {
      setSettingsError('Erro ao restaurar senha: ' + (e?.message || e));
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (!selectedTruck || !selectedTruck.lastLat || !selectedTruck.lastLng) return;

    const truckDeliveries = deliveries.filter(d => 
      d.truckId === selectedTruck.id && 
      (d.status === 'IN_ROUTE' || d.status === 'PENDING')
    );

    if (truckDeliveries.length === 0) {
      alert('Não há entregas para otimizar.');
      return;
    }

    // Simple Nearest Neighbor Algorithm starting from truck current position
    const unvisited = [...truckDeliveries];
    const optimizedSequence: Delivery[] = [];
    let currentPos: [number, number] = [selectedTruck.lastLat, selectedTruck.lastLng];

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
      optimizedSequence.push(nearest);
      currentPos = [nearest.lat, nearest.lng];
    }

    // Creating the waypoints: Current Position -> All Deliveries -> Water Supply Point
    const waypoints: [number, number][] = [
      [selectedTruck.lastLat, selectedTruck.lastLng],
      ...optimizedSequence.map(d => [d.lat, d.lng] as [number, number]),
      WATER_SUPPLY_POINT
    ];

    setSettingsLoading(true);
    const roadRoute = await fetchRoadRoute(waypoints);
    setSettingsLoading(false);

    if (roadRoute && isRoadRoute(roadRoute)) {
      setPlannedRoute(roadRoute);
      setActiveTab('map');
      setSelectedTruck(null);
    } else {
      alert('Não foi possível calcular o traçado real pelas vias no momento. Nenhuma rota em linha reta será traçada.');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <div 
        className="fixed inset-0 z-[-10] opacity-10 bg-center bg-cover" 
        style={{ backgroundImage: 'url(https://i.ibb.co/v4vWjP3B/caminhao-pipa-inhapi-OMZpj2.jpg)' }} 
      />
      <EditModal />
      <StatusConfirmationModal />
      <DeleteConfirmationModal />
      <DeleteDeliveriesModal />
      <FinishRouteModal />
      
      {/* Realtime Delivery Completed Audio Alert Banner */}
      <AnimatePresence>
        {completedDeliveryAlert && completedDeliveryAlert.show && (
          <motion.div
            initial={{ y: -100, scale: 0.9, opacity: 0 }}
            animate={{ y: 24, scale: 1, opacity: 1 }}
            exit={{ y: -100, scale: 0.9, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[2500] w-[92%] max-w-md bg-emerald-700 text-white p-4 rounded-3xl shadow-2xl border-2 border-emerald-400/40 flex items-center gap-3.5 backdrop-blur-md"
          >
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 animate-bounce">
              <BellRing size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/80 px-2 py-0.5 rounded-md">
                  Entrega Concluída 💧
                </span>
                <span className="text-[10px] text-emerald-200 font-mono ml-auto">
                  {completedDeliveryAlert.timestamp}
                </span>
              </div>
              <h4 className="font-black text-sm text-white truncate mt-0.5">
                {completedDeliveryAlert.residentName}
              </h4>
              <p className="text-[11px] text-emerald-100 font-medium truncate">
                {completedDeliveryAlert.driverName ? `Motorista: ${completedDeliveryAlert.driverName}` : 'Abastecimento registrado com sucesso'}
                {completedDeliveryAlert.plate ? ` (${completedDeliveryAlert.plate})` : ''}
              </p>
            </div>
            <button
              onClick={() => setCompletedDeliveryAlert(null)}
              className="p-1.5 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Toast */}
      <AnimatePresence>
        {adminToast.show && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[2000] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold whitespace-nowrap"
          >
            <CheckCircle2 size={20} />
            {adminToast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b border-slate-200 px-3 py-2.5 sm:p-4 flex items-center justify-between sticky top-0 z-[1001] shadow-sm safe-area-top">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 p-0.5 flex-shrink-0 shadow-sm">
            <img src="https://i.ibb.co/sdCcYPpy/logo-inhapi-NNPe-Z.webp" alt="Logo" className="w-full h-full object-contain" onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100?text=LOGO'} />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-xs sm:text-sm uppercase tracking-tight truncate">Administração</h1>
            <p className="text-[8px] sm:text-[9px] font-black text-brand-teal tracking-widest uppercase">Operação Pipa</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <AndroidInstallBanner variant="compact" />
          {onTrocarAcesso && (
            <button
              onClick={onTrocarAcesso}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[9px] uppercase tracking-wider px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
              title="Trocar para visão de motorista"
            >
              Trocar
            </button>
          )}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-xl transition-all active:scale-90 border ${
              soundEnabled 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
            title={soundEnabled ? 'Notificação Sonora Ativada' : 'Notificação Sonora Desativada'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button 
            onClick={() => auth.signOut()}
            className="p-2 bg-red-50 text-red-600 rounded-xl active:scale-90 transition-all border border-red-200"
            title="Sair da Conta"
          >
            <LogOut size={16} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 bg-slate-50 rounded-xl text-slate-600 active:scale-90 transition-all border border-slate-100"
            title="Abrir Menu"
          >
            <div className="flex flex-col gap-1 w-5 h-5 items-center justify-center">
              <div className="w-4 h-0.5 bg-brand-dark rounded-full" />
              <div className="w-4 h-0.5 bg-brand-dark rounded-full" />
              <div className="w-4 h-0.5 bg-brand-dark rounded-full" />
            </div>
          </button>
        </div>
      </header>

      {/* Sidebar / Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={() => setIsSidebarOpen(false)} 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1002] lg:hidden" 
          />
        )}
      </AnimatePresence>
      
      <aside 
        className={`
          fixed inset-y-0 left-0 w-72 bg-white z-[1003] shadow-2xl p-5 sm:p-6 flex flex-col gap-6 transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:z-0 lg:w-64 lg:shadow-none lg:border-r lg:border-slate-200/80
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shadow-sm border border-slate-200/60 p-1 shrink-0">
              <img src="https://i.ibb.co/sdCcYPpy/logo-inhapi-NNPe-Z.webp" alt="Logo Inhapi" className="w-full h-full object-contain" onError={(e) => e.currentTarget.src = 'https://placehold.co/100x100?text=LOGO'} />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm tracking-tight text-slate-900 truncate">Operação Pipa</h1>
              <p className="text-[11px] font-medium text-slate-400 truncate">Prefeitura de Inhapi / AL</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {[
            { id: 'map', icon: LayoutDashboard, label: 'Painel de Controle' },
            { id: 'deliveries', icon: ClipboardList, label: 'Relatórios & Histórico' },
            { id: 'sitios', icon: MapPin, label: 'Abastecimentos' },
            { id: 'residents', icon: Users, label: 'Cadastros' },
            { id: 'sync', icon: Database, label: 'Sincronização' },
            { id: 'settings', icon: Settings, label: 'Ajustes' },
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsSidebarOpen(false);
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 shadow-xs border border-blue-100' 
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <item.icon size={17} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="truncate">{item.label}</span>
                </div>
                
                {item.id === 'deliveries' && pendingDeliveries > 0 && (
                  <span className="flex items-center justify-center bg-rose-500 text-white font-mono text-[10px] min-w-[20px] h-5 px-1.5 rounded-full shadow-xs tabular-nums">
                    {pendingDeliveries}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 pt-4 border-t border-slate-100">
          {/* Audio Notification Quick Toggle in Sidebar */}
          <button
            onClick={handleToggleSound}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title="Ativar/desativar aviso sonoro de entregas"
          >
            <span className="flex items-center gap-2 text-xs">
              {soundEnabled ? <Volume2 size={15} className="text-emerald-600" /> : <VolumeX size={15} className="text-slate-400" />}
              Som de Entregas
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${soundEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
              {soundEnabled ? 'Ativo' : 'Mudo'}
            </span>
          </button>

          <div className="pt-0.5">
            <AndroidInstallBanner variant="button" className="w-full justify-center" />
          </div>

          <button 
            onClick={() => auth.signOut()}
            className="flex items-center gap-2.5 px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl w-full transition-all text-xs font-semibold cursor-pointer"
          >
            <LogOut size={16} /> Sair da Conta
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col pb-0">
        {activeTab === 'map' && (
          <div className="p-3 sm:p-5 lg:p-6 h-full flex flex-col gap-3 sm:gap-4 lg:gap-5">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                    Monitoramento Operacional
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Tempo Real
                  </span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">
                  Acompanhamento da frota de caminhões-pipa e rotas ativas em Inhapi.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <AndroidInstallBanner variant="compact" />
                <button
                  onClick={handleToggleSound}
                  className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                    soundEnabled
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title={soundEnabled ? 'Notificações sonoras ativas (Clique para silenciar)' : 'Notificações sonoras desativadas (Clique para ativar)'}
                >
                  {soundEnabled ? <Volume2 size={15} className="text-emerald-600" /> : <VolumeX size={15} />}
                  <span>{soundEnabled ? 'Som Ativo' : 'Som Mudo'}</span>
                </button>
                <button 
                  onClick={() => setShowAddDelivery(true)}
                  className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Plus size={16} /> Nova Entrega
                </button>
                <button 
                  onClick={() => auth.signOut()}
                  className="bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-200 hover:border-red-200 transition-all active:scale-95 cursor-pointer shadow-xs"
                  title="Sair da Conta"
                >
                  <LogOut size={14} /> Sair
                </button>
              </div>
            </header>

            {/* Dashboard Consolidado do Dia - Design Clean, Informativo e Interativo */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {/* Card 1: Entregas Concluídas */}
              <button
                onClick={() => setActiveDashboardModal('completed')}
                className="bg-white hover:bg-emerald-50/30 border border-slate-200/80 hover:border-emerald-300 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 flex items-center justify-between shadow-xs hover:shadow-md transition-all active:scale-[0.98] text-left group cursor-pointer"
              >
                <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-emerald-700 transition-colors truncate block">
                    Entregas Concluídas
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums tracking-tight">
                      {deliveriesCompletedToday}
                    </span>
                    <span className="text-xs text-emerald-600 font-semibold">Hoje</span>
                  </div>
                  <p className="hidden md:block text-[11px] text-slate-400 font-normal">
                    {totalCompletedDeliveries} acumuladas no total
                  </p>
                </div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center shrink-0 ml-1 group-hover:scale-105 transition-transform">
                  <CheckCircle2 size={20} className="stroke-[2.2]" />
                </div>
              </button>

              {/* Card 2: Caminhões em Rota */}
              <button
                onClick={() => setActiveDashboardModal('active_trucks')}
                className="bg-white hover:bg-blue-50/30 border border-slate-200/80 hover:border-blue-300 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 flex items-center justify-between shadow-xs hover:shadow-md transition-all active:scale-[0.98] text-left group cursor-pointer"
              >
                <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-blue-700 transition-colors truncate block">
                    Caminhões em Rota
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums tracking-tight">
                      {trucksInRoute}
                    </span>
                    <span className="text-xs text-blue-600 font-semibold">Ativos</span>
                  </div>
                  <p className="hidden md:block text-[11px] text-slate-400 font-normal">
                    De {trucks.length} cadastrados na frota
                  </p>
                </div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center shrink-0 ml-1 group-hover:scale-105 transition-transform">
                  <TruckIcon size={20} className="stroke-[2.2]" />
                </div>
              </button>

              {/* Card 3: Águas Pendentes */}
              <button
                onClick={() => setActiveDashboardModal('pending')}
                className="bg-white hover:bg-amber-50/30 border border-slate-200/80 hover:border-amber-300 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 flex items-center justify-between shadow-xs hover:shadow-md transition-all active:scale-[0.98] text-left group cursor-pointer"
              >
                <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-slate-500 group-hover:text-amber-700 transition-colors truncate block">
                    Entregas Pendentes
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums tracking-tight">
                      {pendingDeliveries}
                    </span>
                    <span className="text-xs text-amber-600 font-semibold">Na Fila</span>
                  </div>
                  <p className="hidden md:block text-[11px] text-slate-400 font-normal">
                    Aguardando liberação de rota
                  </p>
                </div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0 ml-1 group-hover:scale-105 transition-transform">
                  <Clock size={20} className="stroke-[2.2]" />
                </div>
              </button>
            </div>

            <div className="flex-1 min-h-[480px] sm:min-h-[550px] lg:min-h-0 bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-slate-200/90 relative z-0">
              <MapContainer 
                trucks={trucks} 
                deliveries={deliveries} 
                sitios={sitios}
                route={plannedRoute}
                selectedTruckId={selectedTruck?.id}
                newPoint={
                  showAddSitio && newSitio.lat !== 0 ? [newSitio.lat, newSitio.lng] : 
                  showAddDelivery && newDelivery.lat !== 0 ? [newDelivery.lat, newDelivery.lng] : null
                }
                onSitioClick={(sitio) => setSelectedSitio(sitio)}
                onMapClick={(lat, lng) => {
                  setNewDelivery(prev => ({ ...prev, lat, lng }));
                  setNewSitio(prev => ({ ...prev, lat, lng, rawCoords: `${lat}, ${lng}` }));
                  // If on map tab and sitting modal open, update coordinates
                  if (showAddSitio || showAddDelivery) {
                    setAdminToast({ show: true, message: 'Coordenadas capturadas do mapa!' });
                    setTimeout(() => setAdminToast({ show: false, message: '' }), 2000);
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'trucks' && (
          <div className="p-4 lg:p-8 max-w-5xl mx-auto w-full">
             <header className="flex justify-between items-center mb-6 lg:mb-8">
              <div>
                <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tight">Frota</h2>
              </div>
              <button 
                onClick={() => setShowAddTruck(true)}
                className="bg-brand-dark text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-wider text-xs flex items-center gap-2 shadow-lg shadow-brand-dark/20"
              >
                <Plus size={18} /> Adicionar
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {trucks.map(truck => (
                <div 
                  key={truck.id} 
                  onClick={() => setSelectedTruck(truck)}
                  className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-200 cursor-pointer hover:border-brand-dark hover:shadow-xl transition-all active:scale-95 group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 group-hover:bg-brand-dark group-hover:text-white transition-colors">
                      <TruckIcon size={24} />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter ${
                      truck.status === 'IN_ROUTE' ? 'bg-amber-100 text-amber-600' : 
                      truck.status === 'ARRIVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {truck.status === 'IN_ROUTE' ? 'EM ROTA' : truck.status === 'ARRIVED' ? 'NO LOCAL' : 'DISPONÍVEL'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-1">{truck.driverName}</h3>
                  <p className="text-slate-500 font-mono text-sm mb-3">{truck.plate}</p>

                  {truck.status === 'IN_ROUTE' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRouteToFinishTruck(truck);
                        setFinishRoutePassword('');
                        setFinishRouteError('');
                        setShowFinishRouteModal(true);
                      }}
                      className="w-full mb-3 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-wider py-2 px-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Lock size={13} /> Finalizar Rota (Senha)
                    </button>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock size={14} /> {new Date(truck.lastUpdate || '').toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'deliveries' && (
          <div className="p-4 lg:p-8 max-w-5xl mx-auto w-full">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 lg:mb-8">
              <div>
                <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-brand-dark">Histórico de Entregas</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Histórico e relatórios de abastecimento de moradias</p>
              </div>
              <div className="flex gap-2.5 w-full sm:w-auto">
                <button 
                  onClick={() => {
                    setDeleteHistoryPassword('');
                    setDeleteHistoryError('');
                    setShowDeleteDeliveriesModal(true);
                  }}
                  className="flex-1 sm:flex-initial bg-red-50 text-red-600 hover:bg-red-100 border border-red-200/50 px-5 py-2.5 rounded-xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 size={16} /> Apagar Histórico
                </button>
                <button 
                  onClick={handleExportPDF}
                  className="flex-1 sm:flex-initial bg-brand-teal text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-teal/20 hover:bg-brand-teal/80 transition-colors"
                >
                  Exportar PDF
                </button>
              </div>
            </header>
            
            {/* Gráfico Comparativo e Desempenho por Indicação (Vereadores) com Filtro Mensal */}
            <CouncilmanPerformanceSection 
              deliveries={deliveries}
              councilmen={councilmen}
              residents={residents}
              onViewPhoto={setSelectedPhoto}
            />

            {/* Gráfico Diário dos Últimos 7 Dias */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Volume Diário de Entregas (Últimos 7 Dias)
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Frequência diária geral de abastecimentos realizados
                  </p>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const data = [];
                    for (let i = 6; i >= 0; i--) {
                      const date = new Date();
                      date.setDate(date.getDate() - i);
                      const dateString = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                      data.push({
                        date: dateString,
                        count: deliveries.filter(d => {
                          const dDate = new Date(d.createdAt || '');
                          return dDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) === dateString;
                        }).length
                      });
                    }
                    return data;
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 700 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Desktop Table */}
            <div className="hidden lg:block bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-brand-dark uppercase tracking-tight text-lg">
                    Relação Geral de Entregas Cadastradas
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    {deliveries.length} registros no histórico completo
                  </p>
                </div>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Morador</th>
                    <th className="px-6 py-4">Endereço</th>
                    <th className="px-6 py-4">Indicação (Vereador)</th>
                    <th className="px-6 py-4 text-center">Foto</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-400">Nenhuma entrega registrada.</td></tr>
                  ) : (
                    deliveries.map(delivery => (
                      <tr key={delivery.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-5 font-black text-brand-dark uppercase tracking-tight">{delivery.residentName}</td>
                        <td className="px-6 py-5 text-sm text-slate-600">{delivery.address}</td>
                        <td className="px-6 py-5 text-sm">
                          {delivery.councilman ? (
                            <span className="font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg text-xs border border-purple-200/60 inline-flex items-center gap-1">
                              🏛️ {delivery.councilman}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic font-medium">Sem indicação</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          {delivery.photo ? (
                            <button 
                              onClick={() => setSelectedPhoto(delivery.photo!)}
                              className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all active:scale-90"
                              title="Ver Comprovante"
                            >
                              <ImageIcon size={20} />
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                           <button onClick={() => setStatusConfirmationModal({ delivery })} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            delivery.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-600 border-emerald-200' :
                            delivery.status === 'IN_ROUTE' ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {delivery.status === 'DELIVERED' ? 'ENTREGUE' : delivery.status === 'IN_ROUTE' ? 'EM ROTA' : 'PENDENTE'}
                          </button>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <button 
                            onClick={() => handleDelete('deliveries', delivery.id)}
                            className="p-2 bg-slate-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {deliveries.map(delivery => (
                <div key={delivery.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-black text-brand-dark uppercase tracking-tight leading-tight">{delivery.residentName}</h3>
                      {delivery.councilman && (
                        <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full inline-block mt-1 border border-purple-200/50">
                          🏛️ Indicação: {delivery.councilman}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setStatusConfirmationModal({ delivery })} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                      delivery.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-600' :
                      delivery.status === 'IN_ROUTE' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {delivery.status === 'DELIVERED' ? 'ENTREGUE' : delivery.status === 'IN_ROUTE' ? 'EM ROTA' : 'PENDENTE'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 font-bold mb-3">{delivery.address}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <Clock size={12} /> {new Date(delivery.createdAt || '').toLocaleDateString()} • {new Date(delivery.createdAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {delivery.photo && (
                      <button 
                        onClick={() => setSelectedPhoto(delivery.photo!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-tight active:scale-95 transition-all"
                      >
                        <ImageIcon size={14} /> Foto
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sitios' && (
          <div className="p-4 lg:p-8 max-w-5xl mx-auto w-full">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 lg:mb-8">
              <div>
                <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-slate-900">Abastecimentos</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Pontos de coleta de água e abastecimento de frota</p>
              </div>
              <button 
                onClick={() => {
                  setNewSitio({ 
                    name: '', 
                    description: '', 
                    lat: -9.2201, 
                    lng: -36.3503, 
                    rawCoords: '-9.2201, -36.3503',
                    type: 'WATER' as 'WATER' | 'FUEL' | 'OTHER',
                    fuelType: 'NONE' as 'DIESEL' | 'GASOLINE' | 'NONE'
                  });
                  setEditingSitio(null);
                  setShowAddSitio(true);
                }}
                className="w-full sm:w-auto bg-brand-teal text-white px-5 py-3 lg:py-2.5 rounded-2xl lg:rounded-xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-teal/20 hover:bg-brand-teal/80 transition-all active:scale-95"
              >
                <Plus size={18} /> Novo Abastecimento
              </button>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sitios.map(sitio => (
                <div key={sitio.id} className="bg-white p-6 rounded-3xl border border-slate-200 relative group">
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingSitio(sitio);
                        setNewSitio({
                          name: sitio.name || '',
                          description: sitio.description || '',
                          lat: sitio.lat || 0,
                          lng: sitio.lng || 0,
                          rawCoords: `${sitio.lat || 0}, ${sitio.lng || 0}`,
                          type: sitio.type || 'WATER',
                          fuelType: sitio.fuelType || 'NONE'
                        });
                        setShowAddSitio(true);
                      }}
                      className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-brand-primary hover:text-white transition-colors"
                    >
                      <Settings size={16} /> 
                    </button>
                    <button 
                      onClick={() => handleDelete('sitios', sitio.id)}
                      className="p-2 bg-slate-100 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="font-bold text-xl mb-1">{sitio.name}</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${sitio.type === 'WATER' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                      {sitio.type === 'WATER' ? "Água" : "Combustível"}
                    </span>
                    {sitio.type === 'FUEL' && sitio.fuelType && (
                       <span className={`text-[10px] items-center gap-2 font-black uppercase tracking-widest px-2 py-1 rounded-md ${sitio.fuelType === 'DIESEL' ? 'bg-amber-700/10 text-amber-800' : 'bg-red-100 text-red-700'}`}>
                         {sitio.fuelType}
                       </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm mb-2">{sitio.description}</p>
                  <p className="text-xs text-slate-400 font-mono">{sitio.lat}, {sitio.lng}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'residents' && (
          <div className="p-4 lg:p-8 max-w-6xl mx-auto w-full">
            <header className="mb-6 lg:mb-8">
              <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-slate-900">Cadastros</h2>
            </header>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 lg:mb-8">
              {[
                {id: 'resident', label: 'Moradores'},
                {id: 'truck', label: 'Caminhões'},
                {id: 'driver', label: 'Motoristas'},
                {id: 'councilman', label: 'Vereadores'}
              ].map((tab) => (
                 <button 
                   key={tab.id}
                   onClick={() => setActiveCadastroSubTab(tab.id as any)}
                   className={`px-2 py-2.5 md:p-4 rounded-xl border uppercase font-black text-[9px] min-[370px]:text-[10px] lg:text-xs tracking-wider md:tracking-widest transition-all ${
                     activeCadastroSubTab === tab.id 
                       ? 'bg-brand-dark text-white border-brand-dark' 
                       : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                   }`}
                 >
                   {tab.label}
                 </button>
              ))}
            </div>
            
            <div className="bg-white p-4 md:p-6 rounded-[24px] md:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                {activeCadastroSubTab === 'resident' && (
                  <div className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <h3 className="font-bold text-lg">Moradores</h3>
                      <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2">
                        <input 
                          type="text" 
                          placeholder="Buscar por nome ou endereço..." 
                          value={residentSearch} 
                          onChange={(e) => setResidentSearch(e.target.value)} 
                          className="bg-slate-100 px-4 py-2.5 rounded-xl text-sm w-full sm:w-[220px] outline-none" 
                        />
                        <div className="flex gap-2 justify-end w-full sm:w-auto">
                          <button onClick={() => handleDeleteAll('residents', residents)} className="flex-1 sm:flex-initial bg-red-100 text-red-600 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">Apagar Todos</button>
                          <button onClick={() => setShowAddResident(true)} className="flex-1 sm:flex-initial bg-brand-dark text-white px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">+ Novo</button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Desktop Table */}
                    <div className="overflow-x-auto w-full custom-scrollbar hidden sm:block">
                      <table className="w-full text-left min-w-[700px]">
                          <thead className="bg-slate-50 border-bottom border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <tr>
                              <th className="px-6 py-4">Nome</th>
                              <th className="px-6 py-4">Endereço</th>
                              <th className="px-6 py-4">Bairro/Sítio</th>
                              <th className="px-6 py-4">Telefone</th>
                              <th className="px-6 py-4">Ref.</th>
                              <th className="px-6 py-4 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {residents.filter(r => r.name.toLowerCase().includes(residentSearch.toLowerCase()) || r.address.toLowerCase().includes(residentSearch.toLowerCase())).map(resident => (
                              <tr key={resident.id}>
                                <td className="px-6 py-5 font-black text-brand-dark uppercase tracking-tight">
                                  {resident.name}
                                  {resident.councilman && (
                                    <span className="block mt-1 text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md w-fit">
                                      🏛️ {resident.councilman}
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-5 text-sm font-medium text-slate-600">{resident.address}</td>
                                <td className="px-6 py-5 text-sm text-slate-500 font-bold uppercase tracking-wider">{resident.neighborhood}</td>
                                <td className="px-6 py-5 text-sm font-mono">{resident.phone || '-'}</td>
                                <td className="px-6 py-5 text-sm text-slate-500 font-medium">{resident.referencePoint || '-'}</td>
                                <td className="px-6 py-5 text-center flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => handleQuickDispatchForResident(resident)} 
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                                    title="Despachar entrega para este morador"
                                  >
                                    <TruckIcon size={14}/> Despachar
                                  </button>
                                  <button onClick={() => handleEdit('residents', resident)} className="p-2 bg-slate-100 text-slate-500 hover:bg-brand-primary hover:text-white rounded-lg transition-colors" title="Editar"><Edit2 size={16}/></button>
                                  <button onClick={() => handleDelete('residents', resident.id)} className="p-2 bg-slate-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors" title="Excluir"><Trash2 size={16}/></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                      </table>
                    </div>

                    {/* Mobile cards for Residents */}
                    <div className="sm:hidden space-y-3">
                      {residents
                        .filter(r => r.name.toLowerCase().includes(residentSearch.toLowerCase()) || r.address.toLowerCase().includes(residentSearch.toLowerCase()))
                        .map(resident => (
                          <div key={resident.id} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-black text-brand-dark uppercase tracking-tight leading-tight">{resident.name}</h4>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="inline-block text-[8px] font-black uppercase tracking-widest bg-brand-primary/10 text-brand-dark px-2 py-0.5 rounded-full">
                                    {resident.neighborhood || 'Não Informado'}
                                  </span>
                                  {resident.councilman && (
                                    <span className="inline-block text-[8px] font-black uppercase tracking-widest bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                                      🏛️ {resident.councilman}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button 
                                  onClick={() => handleEdit('residents', resident)} 
                                  className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:bg-brand-primary hover:text-white rounded-xl active:scale-95 transition-all shadow-sm"
                                  title="Editar"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDelete('residents', resident.id)} 
                                  className="p-2.5 bg-white border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl active:scale-95 transition-all shadow-sm"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            
                            <div className="text-xs space-y-1 border-t border-slate-100 pt-2.5">
                              <p className="text-slate-600 flex items-center gap-1.5 font-medium">
                                <MapPin size={12} className="text-slate-400" />
                                <span>{resident.address}</span>
                              </p>
                              {resident.phone && (
                                <p className="text-slate-500 flex items-center gap-1.5 font-mono">
                                  <Smartphone size={12} className="text-slate-400" />
                                  <a href={`tel:${resident.phone}`} className="hover:underline">{resident.phone}</a>
                                </p>
                              )}
                              {resident.referencePoint && (
                                <p className="text-slate-600 flex items-center gap-1.5 font-sans text-xs bg-slate-100/60 p-1.5 rounded-lg border border-slate-200/50">
                                  <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400">Ref:</span>
                                  <span>{resident.referencePoint}</span>
                                </p>
                              )}

                              <button 
                                onClick={() => handleQuickDispatchForResident(resident)} 
                                className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-blue-500/20 transition-all"
                              >
                                <TruckIcon size={14} /> Despachar Água
                              </button>
                            </div>
                          </div>
                      ))}
                      {residents.filter(r => r.name.toLowerCase().includes(residentSearch.toLowerCase()) || r.address.toLowerCase().includes(residentSearch.toLowerCase())).length === 0 && (
                        <p className="text-center py-6 text-slate-400 text-xs">Nenhum morador encontrado.</p>
                      )}
                    </div>
                  </div>
                )}
                
                {activeCadastroSubTab === 'truck' && (
                  <div className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <h3 className="font-bold text-lg">Caminhões</h3>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                         <button onClick={() => handleDeleteAll('trucks', trucks)} className="flex-1 sm:flex-initial bg-red-100 text-red-600 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">Apagar Todos</button>
                         <button onClick={() => setShowAddTruck(true)} className="flex-1 sm:flex-initial bg-brand-dark text-white px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">+ Novo</button>
                      </div>
                    </div>
                    
                    {/* Desktop Table */}
                    <div className="overflow-x-auto w-full custom-scrollbar hidden sm:block">
                      <table className="w-full text-left min-w-[500px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Placa</th>
                            <th className="px-6 py-4">Motorista</th>
                            <th className="px-6 py-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {trucks.map(truck => (
                            <tr key={truck.id}>
                              <td className="px-6 py-5 font-black">{truck.plate}</td>
                              <td className="px-6 py-5">{truck.driverName}</td>
                              <td className="px-6 py-5 text-center flex items-center justify-center gap-2">
                                  <button onClick={() => handleEdit('trucks', truck)} className="p-2 bg-slate-100 text-slate-500 hover:bg-brand-primary hover:text-white rounded-lg transition-colors"><Edit2 size={16}/></button>
                                  <button onClick={() => handleDelete('trucks', truck.id)} className="p-2 bg-slate-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"><Trash2 size={16}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards for Trucks */}
                    <div className="sm:hidden space-y-3">
                      {trucks.map(truck => (
                        <div key={truck.id} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Caminhão</span>
                            <h4 className="font-black text-slate-800 text-base leading-tight uppercase">{truck.driverName}</h4>
                            <p className="font-mono text-xs text-brand-dark/70 font-bold mt-1 bg-slate-100 border border-slate-200 inline-block px-2.5 py-0.5 rounded-lg">{truck.plate}</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => handleEdit('trucks', truck)} 
                              className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl active:scale-95 transition-all shadow-sm"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete('trucks', truck.id)} 
                              className="p-2.5 bg-white border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl active:scale-95 transition-all shadow-sm"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {trucks.length === 0 && (
                        <p className="text-center py-6 text-slate-400 text-xs">Nenhum caminhão cadastrado.</p>
                      )}
                    </div>
                  </div>
                )}
                
                {activeCadastroSubTab === 'driver' && (
                  <div className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <h3 className="font-bold text-lg">Motoristas</h3>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <button onClick={() => handleDeleteAll('drivers', drivers)} className="flex-1 sm:flex-initial bg-red-100 text-red-600 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">Apagar Todos</button>
                        <button onClick={() => setShowAddDriver(true)} className="flex-1 sm:flex-initial bg-brand-dark text-white px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">+ Novo</button>
                      </div>
                    </div>
                    
                    {/* Desktop Table */}
                    <div className="overflow-x-auto w-full custom-scrollbar hidden sm:block">
                      <table className="w-full text-left min-w-[500px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Nome</th>
                            <th className="px-6 py-4">Telefone</th>
                            <th className="px-6 py-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {drivers.map(driver => (
                            <tr key={driver.id}>
                              <td className="px-6 py-5 font-black">{driver.name}</td>
                              <td className="px-6 py-5 font-mono">{driver.phone}</td>
                              <td className="px-6 py-5 text-center flex items-center justify-center gap-2">
                                  <button onClick={() => handleEdit('drivers', driver)} className="p-2 bg-slate-100 text-slate-500 hover:bg-brand-primary hover:text-white rounded-lg transition-colors"><Edit2 size={16}/></button>
                                  <button onClick={() => handleDelete('drivers', driver.id)} className="p-2 bg-slate-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"><Trash2 size={16}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards for Drivers */}
                    <div className="sm:hidden space-y-3">
                      {drivers.map(driver => (
                        <div key={driver.id} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Motorista</span>
                              <h4 className="font-black text-brand-dark uppercase tracking-tight leading-tight">{driver.name}</h4>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button 
                                onClick={() => handleEdit('drivers', driver)} 
                                className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:bg-brand-primary hover:text-white rounded-xl active:scale-95 transition-all shadow-sm"
                                title="Editar"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDelete('drivers', driver.id)} 
                                className="p-2.5 bg-white border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl active:scale-95 transition-all shadow-sm"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {driver.phone && (
                            <div className="text-xs border-t border-slate-100 pt-2 flex items-center gap-1.5 font-mono text-slate-600">
                              <Smartphone size={12} className="text-slate-400" />
                              <a href={`tel:${driver.phone}`} className="hover:underline font-bold text-slate-700">{driver.phone}</a>
                            </div>
                          )}
                        </div>
                      ))}
                      {drivers.length === 0 && (
                        <p className="text-center py-6 text-slate-400 text-xs">Nenhum motorista cadastrado.</p>
                      )}
                    </div>
                  </div>
                )}
                
                {activeCadastroSubTab === 'councilman' && (
                  <div className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <h3 className="font-bold text-lg">Vereadores</h3>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                          <button onClick={() => handleDeleteAll('councilmen', councilmen)} className="flex-1 sm:flex-initial bg-red-100 text-red-600 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">Apagar Todos</button>
                          <button onClick={() => setShowAddCouncilman(true)} className="flex-1 sm:flex-initial bg-brand-dark text-white px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">+ Novo</button>
                      </div>
                    </div>
                    
                    {/* Desktop Table */}
                    <div className="overflow-x-auto w-full custom-scrollbar hidden sm:block">
                      <table className="w-full text-left min-w-[400px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Nome</th>
                            <th className="px-6 py-4 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {councilmen.map(councilman => (
                            <tr key={councilman.id}>
                              <td className="px-6 py-5 font-black">{councilman.name}</td>
                              <td className="px-6 py-5 text-center flex items-center justify-center gap-2">
                                  <button onClick={() => handleEdit('councilmen', councilman)} className="p-2 bg-slate-100 text-slate-500 hover:bg-brand-primary hover:text-white rounded-lg transition-colors"><Edit2 size={16}/></button>
                                  <button onClick={() => handleDelete('councilmen', councilman.id)} className="p-2 bg-slate-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"><Trash2 size={16}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards for Councilmen */}
                    <div className="sm:hidden space-y-3">
                      {councilmen.map(councilman => (
                        <div key={councilman.id} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Vereador / Indicação</span>
                            <h4 className="font-black text-slate-800 text-base leading-tight uppercase">{councilman.name}</h4>
                          </div>
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => handleEdit('councilmen', councilman)} 
                              className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl active:scale-95 transition-all shadow-sm"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete('councilmen', councilman.id)} 
                              className="p-2.5 bg-white border border-slate-200 text-red-500 hover:bg-red-50 rounded-xl active:scale-95 transition-all shadow-sm"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {councilmen.length === 0 && (
                        <p className="text-center py-6 text-slate-400 text-xs">Nenhum vereador cadastrado.</p>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {activeTab === 'councilmen' && (
          <div className="p-8 max-w-5xl mx-auto w-full">
            <header className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">Vereadores</h2>
              <button 
                onClick={() => setShowAddCouncilman(true)}
                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95"
              >
                <Plus size={18} /> Novo Vereador
              </button>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {councilmen.map(councilman => (
                <div key={councilman.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                    <UserCheck size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{councilman.name}</h3>
                    <p className="text-slate-400 text-xs uppercase font-bold tracking-widest">Inhapi • AL</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 lg:p-8 max-w-2xl mx-auto w-full">
            <header className="mb-6 lg:mb-10">
               <h2 className="text-2xl lg:text-3xl font-black flex items-center gap-3 uppercase tracking-tight">
                 <Shield className="text-brand-dark" size={28} /> Configurações
               </h2>
               <p className="text-slate-500 mt-1 uppercase font-bold text-[10px] lg:text-xs tracking-widest">Segurança e acessos administrativos.</p>
            </header>

            <div className="bg-white rounded-[40px] p-6 lg:p-10 shadow-xl border-4 border-brand-dark/10">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Key size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg lg:text-xl uppercase tracking-tight">Senha ADM</h3>
                    <p className="text-slate-400 text-xs font-bold leading-tight uppercase tracking-wider">Protege o acesso ao Painel Administrativo.</p>
                  </div>
               </div>

               <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nova Senha</label>
                    <input 
                      type="password"
                      placeholder="Mínimo 4 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-brand-dark outline-none rounded-2xl py-4 px-6 font-bold transition-all text-sm"
                    />
                 </div>

                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Repetir Senha</label>
                    <input 
                      type="password"
                      placeholder="Confirmação"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-brand-dark outline-none rounded-2xl py-4 px-6 font-bold transition-all text-sm"
                    />
                 </div>

                 {settingsError && (
                   <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border border-red-100">
                     <AlertCircle size={16} /> {settingsError}
                   </div>
                 )}

                 {settingsSuccess && (
                   <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border border-emerald-100">
                     <CheckCircle2 size={16} /> Senha atualizada!
                   </div>
                 )}

                 <div className="flex flex-col sm:flex-row gap-3">
                   <button 
                    disabled={settingsLoading}
                    onClick={handleChangePassword}
                    className="flex-1 bg-brand-dark text-white font-black py-4 rounded-3xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-brand-dark/20 disabled:opacity-50 uppercase tracking-widest text-xs sm:text-sm"
                   >
                     {settingsLoading ? 'Salvando...' : (
                       <>
                         <Save size={18} /> Salvar Nova Senha
                       </>
                     )}
                   </button>
                   <button 
                    type="button"
                    disabled={settingsLoading}
                    onClick={handleResetAdminPasswordToDefault}
                    className="py-4 px-6 bg-slate-100 hover:bg-amber-50 hover:text-amber-800 text-slate-700 font-black rounded-3xl transition-all active:scale-95 text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200"
                    title="Redefinir para a senha padrão 123456"
                   >
                     <span>Redefinir para 123456</span>
                   </button>
                 </div>

                 <div className="mt-12 pt-10 border-t border-slate-100">
                    <h3 className="font-black text-lg uppercase tracking-tight text-red-500 mb-2">Perigo</h3>
                    <p className="text-slate-400 text-xs font-bold leading-tight uppercase tracking-wider mb-6">Apagar todos os dados do aplicativo.</p>
                    {showResetConfirmation ? (
                      <div className="space-y-4">
                        <input 
                          type="password"
                          placeholder="Senha de ADMIN para confirmar"
                          value={resetPasswordInput}
                          onChange={e => setResetPasswordInput(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 outline-none rounded-2xl py-4 px-6 font-bold transition-all text-sm"
                        />
                        <div className="flex gap-4">
                          <button onClick={() => setShowResetConfirmation(false)} className="flex-1 py-3 sm:py-4 bg-slate-100 rounded-2xl font-black uppercase text-[10px] sm:text-xs">Cancelar</button>
                          <button onClick={handleResetAppData} className="flex-1 py-3 sm:py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] sm:text-xs">Resetar Agora</button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowResetConfirmation(true)}
                        className="w-full bg-red-50 text-red-600 font-black py-3 sm:py-4 rounded-[20px] sm:rounded-3xl flex items-center justify-center gap-3 hover:bg-red-100 transition-all active:scale-95 uppercase tracking-widest text-[11px] sm:text-xs"
                      >
                        <Trash2 size={20} /> Resetar Aplicativo
                      </button>
                    )}

                 </div>
               </div>
            </div>

            {/* Sound Notification Alert Settings Card */}
            <div className="bg-white rounded-[40px] p-6 lg:p-10 shadow-xl border-4 border-indigo-500/10 mt-8">
               <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      soundEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
                    </div>
                    <div>
                      <h3 className="font-black text-lg lg:text-xl uppercase tracking-tight">Notificações Sonoras</h3>
                      <p className="text-slate-400 text-xs font-bold leading-tight uppercase tracking-wider">Avisos sonoros de conclusão de entrega.</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      playTestChime();
                      setAdminToast({ show: true, message: 'Tocando teste de som...' });
                      setTimeout(() => setAdminToast({ show: false, message: '' }), 2000);
                    }}
                    className="p-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
                    title="Testar sinal sonoro"
                  >
                    <BellRing size={14} />
                    <span className="hidden sm:inline">Testar Som</span>
                  </button>
               </div>

               <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-black text-sm text-slate-800 uppercase tracking-wide flex items-center gap-2">
                        <span>Sinal Sonoro de Entregas Concluídas</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                          soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {soundEnabled ? 'Ativado' : 'Silenciado'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                        Toca automaticamente um sinal melódico no alto-falante/fone do administrador no exato momento em que um motorista conclui uma entrega no campo.
                      </p>
                    </div>

                    <button
                      onClick={handleToggleSound}
                      className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shrink-0 shadow-md ${
                        soundEnabled 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20' 
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      }`}
                    >
                      {soundEnabled ? 'Desativar Som' : 'Ativar Som'}
                    </button>
                  </div>
               </div>
            </div>

            {/* Firebase Firestore Database Management Card */}
            <div className="bg-white rounded-[40px] p-6 lg:p-10 shadow-xl border-4 border-amber-500/20 mt-8">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                      <Database size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-lg lg:text-xl uppercase tracking-tight">Banco de Dados Firebase Firestore</h3>
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                          Oficial
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs font-bold leading-tight uppercase tracking-wider">Armazenamento em nuvem 100% Google Firebase em tempo real.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleCheckFirebase}
                    disabled={isCheckingFirebase}
                    className="p-2.5 bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold self-start sm:self-auto"
                    title="Testar Conexão com Firebase"
                  >
                    <RefreshCw size={14} className={isCheckingFirebase ? 'animate-spin' : ''} />
                    <span>Testar Conexão</span>
                  </button>
               </div>

               <div className="space-y-5">
                  {/* Status Indicator */}
                  <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    firebaseStatus?.connected
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}>
                    <div className="mt-0.5">
                      {firebaseStatus?.connected ? (
                        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                      )}
                    </div>
                    <div className="text-xs flex-1">
                      <div className="font-black uppercase tracking-wider flex items-center gap-2">
                        <span>{firebaseStatus?.connected ? 'Firebase Firestore Conectado' : 'Conectando ao Firebase...'}</span>
                        {firebaseStatus?.latencyMs && (
                          <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                            {firebaseStatus.latencyMs} ms
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-medium opacity-90 mt-0.5">
                        {firebaseStatus?.message || 'Verificando conexão com o Google Cloud Firestore...'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Projeto: <strong>{firebaseStatus?.projectId || 'ai-studio-dad26a59-43f1-4ca1-9d3e-846540128eb8'}</strong></span>
                        <span>Banco: <strong>{firebaseStatus?.databaseId || '(default)'}</strong></span>
                        {firebaseStatus?.timestamp && <span>Última checagem: <strong>{firebaseStatus.timestamp}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {/* Collections Document Count Cards */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2.5">
                      Coleções Ativas no Firebase Firestore
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Caminhões</span>
                        <span className="text-xl font-black text-slate-800">{trucks.length}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Entregas</span>
                        <span className="text-xl font-black text-blue-600">{deliveries.length}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Moradores</span>
                        <span className="text-xl font-black text-emerald-600">{residents.length}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Sítios/Fontes</span>
                        <span className="text-xl font-black text-cyan-600">{sitios.length}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Motoristas</span>
                        <span className="text-xl font-black text-indigo-600">{drivers.length}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Vereadores</span>
                        <span className="text-xl font-black text-purple-600">{councilmen.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Backup */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={handleExportFirebaseBackup}
                      disabled={isExportingBackup}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-50"
                    >
                      <Download size={16} className={isExportingBackup ? 'animate-bounce' : ''} />
                      {isExportingBackup ? 'Gerando Backup...' : 'Exportar Backup JSON (Firebase)'}
                    </button>
                    <button
                      onClick={handleCheckFirebase}
                      disabled={isCheckingFirebase}
                      className="py-3.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={14} className={isCheckingFirebase ? 'animate-spin' : ''} />
                      <span>Atualizar Status</span>
                    </button>
                  </div>

                  {/* Security & Architecture Badges */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 items-center text-[10px] font-bold text-slate-400">
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                      <ShieldCheck size={12} className="text-emerald-600" />
                      Regras de Segurança Ativas (firestore.rules)
                    </span>
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                      <Zap size={12} className="text-amber-500" />
                      Sincronização em Tempo Real (WebSockets / WebChannel)
                    </span>
                    <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                      <CheckCircle2 size={12} className="text-blue-600" />
                      Cache Offline Habilitado (IndexedDB)
                    </span>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="p-4 lg:p-8 max-w-5xl mx-auto w-full flex-1 flex flex-col gap-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl lg:text-3xl font-black flex items-center gap-3 uppercase tracking-tight">
                  <Database className="text-brand-dark" size={28} /> Sincronia de Aparelhos
                </h2>
                <p className="text-slate-500 mt-1 uppercase font-bold text-[10px] lg:text-xs tracking-widest">Acompanhamento de dados pendentes em IndexedDB de campo.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckFirebase}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
                >
                  <RefreshCw size={14} className={isCheckingFirebase ? 'animate-spin' : ''} />
                  <span>Atualizar Status</span>
                </button>
              </div>
            </header>

            {/* Informational Hero Card */}
            <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200/60 text-slate-600 text-xs leading-relaxed">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={14} className="text-brand-dark" /> Como funciona a Sincronização?
              </p>
              Os motoristas utilizam o banco de dados local <strong className="text-brand-dark">IndexedDB</strong> nos celulares quando perdem o sinal de internet (3G/4G). Todas as fotos de entregas, coordenadas e novos moradores são guardadas com segurança no aparelho e enviadas automaticamente ao Firebase assim que o sinal for restabelecido. Este painel permite que você saiba exatamente o que ainda está retido localmente nos aparelhos de campo.
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Aparelhos Monitorados</span>
                <span className="text-3xl font-black text-slate-800">{deviceSyncStatuses.length}</span>
                <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Celulares ativos em campo</span>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total de Ações Pendentes</span>
                <span className={`text-3xl font-black ${deviceSyncStatuses.reduce((acc, curr) => acc + (curr.pendingCount || 0), 0) > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {deviceSyncStatuses.reduce((acc, curr) => acc + (curr.pendingCount || 0), 0)}
                </span>
                <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Aguardando reestabelecimento de rede</span>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Status Geral da Operação</span>
                <div className="mt-1">
                  {deviceSyncStatuses.reduce((acc, curr) => acc + (curr.pendingCount || 0), 0) === 0 ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                      <CheckCircle2 size={12} /> 100% Sincronizado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                      <Clock size={12} /> Dados em Fila
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 mt-2.5 font-bold uppercase">Atualizado em tempo real</span>
              </div>
            </div>

            {/* Devices List Table/Grid */}
            <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-xs uppercase tracking-wider text-slate-500">Status por Veículo/Aparelho</h3>
                <span className="text-[10px] font-bold bg-slate-200 px-2.5 py-1 rounded-full text-slate-600">
                  {deviceSyncStatuses.length} Cadastrados
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {deviceSyncStatuses.map((device) => {
                  const hasPending = (device.pendingCount || 0) > 0;
                  const lastUpdateDate = device.lastUpdate ? new Date(device.lastUpdate) : null;
                  const isOnlineRecently = lastUpdateDate ? (Date.now() - lastUpdateDate.getTime() < 10 * 60 * 1000) : false;

                  return (
                    <div key={device.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${hasPending ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          <Smartphone size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-slate-800 text-sm sm:text-base uppercase tracking-tight">
                              {device.driverName || 'Motorista Sem Nome'}
                            </h4>
                            <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-500 uppercase font-bold">
                              {device.plate || 'Sem Placa'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] font-medium text-slate-400">
                            <span>Sinal:</span>
                            {isOnlineRecently ? (
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ativo Agora
                              </span>
                            ) : (
                              <span>
                                {device.lastUpdate ? `Último sinal há ${Math.round((Date.now() - lastUpdateDate!.getTime()) / 60000)} min` : 'Sem contato'}
                              </span>
                            )}
                            <span>•</span>
                            <span className="font-mono">{device.lastUpdate ? new Date(device.lastUpdate).toLocaleString('pt-BR') : '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações em Cache</p>
                          <p className={`text-base font-black ${hasPending ? 'text-amber-500' : 'text-slate-700'}`}>
                            {device.pendingCount || 0} pendentes
                          </p>
                        </div>
                        
                        <div className={`px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                          hasPending 
                            ? 'bg-amber-50 border-amber-200 text-amber-800' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}>
                          {hasPending ? (
                            <>
                              <AlertCircle size={14} className="text-amber-600" />
                              <span>{device.pendingCount} Retidos</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={14} className="text-emerald-600" />
                              <span>Sincronizado</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {deviceSyncStatuses.length === 0 && (
                  <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                    <Database size={40} className="text-slate-300 stroke-[1.5]" />
                    <p className="text-sm font-bold uppercase tracking-wider">Nenhum aparelho registrado</p>
                    <p className="text-xs text-slate-400 max-w-sm">Os aparelhos dos motoristas reportarão seu status de sincronia automaticamente assim que realizarem qualquer ação no campo.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {activeDashboardModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2010] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl my-auto border-2 sm:border-4 border-brand-dark/10 max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start pb-4 border-b border-slate-100 flex-shrink-0">
                <div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    activeDashboardModal === 'completed' ? 'text-emerald-600' :
                    activeDashboardModal === 'active_trucks' ? 'text-blue-600' : 'text-amber-600'
                  }`}>
                    {activeDashboardModal === 'completed' ? 'Histórico de Entregas' :
                     activeDashboardModal === 'active_trucks' ? 'Operações Ativas' : 'Solicitações'}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {activeDashboardModal === 'completed' ? 'Entregas Concluídas Hoje' :
                     activeDashboardModal === 'active_trucks' ? 'Caminhões em Rota' : 'Águas Pendentes'}
                  </h3>
                </div>
                <button 
                  onClick={() => setActiveDashboardModal(null)} 
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable list content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                {activeDashboardModal === 'completed' && (() => {
                  const completedList = deliveries.filter(d => {
                    if (d.status !== 'DELIVERED' || !d.createdAt) return false;
                    try {
                      return new Date(d.createdAt).toLocaleDateString('en-CA') === todayStr;
                    } catch (e) {
                      return d.createdAt.startsWith(todayStr);
                    }
                  });

                  if (completedList.length === 0) {
                    return (
                      <div className="text-center py-10 space-y-2">
                        <CheckCircle2 size={40} className="text-slate-300 mx-auto" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Nenhuma entrega realizada hoje ainda.</p>
                      </div>
                    );
                  }

                  return completedList.map(d => (
                    <div key={d.id} className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 uppercase truncate">{d.residentName}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{d.address}</p>
                        <p className="text-[9px] text-slate-400 font-medium mt-1">
                          Concluído às {new Date(d.createdAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {d.proofPhoto && (
                        <button
                          onClick={() => {
                            setSelectedPhoto(d.proofPhoto!);
                            setActiveDashboardModal(null);
                          }}
                          className="bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-md hover:bg-emerald-700 transition-all active:scale-95 flex-shrink-0"
                        >
                          Ver Comprovante
                        </button>
                      )}
                    </div>
                  ));
                })()}

                {activeDashboardModal === 'active_trucks' && (() => {
                  const activeTrucksList = trucks.filter(t => t.status === 'IN_ROUTE');

                  if (activeTrucksList.length === 0) {
                    return (
                      <div className="text-center py-10 space-y-2">
                        <TruckIcon size={40} className="text-slate-300 mx-auto animate-bounce" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Nenhum caminhão em rota no momento.</p>
                      </div>
                    );
                  }

                  return activeTrucksList.map(t => {
                    const activeDelivery = deliveries.find(d => d.truckId === t.id && d.status === 'IN_ROUTE');
                    return (
                      <div key={t.id} className="p-3 bg-blue-50/40 border border-blue-100 rounded-2xl flex justify-between items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 uppercase truncate">{t.driverName}</h4>
                          <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest truncate mt-0.5">Placa: {t.plate}</p>
                          {activeDelivery ? (
                            <p className="text-[9px] text-slate-500 mt-1 truncate">
                              <span className="font-bold">Destino:</span> {activeDelivery.residentName} ({activeDelivery.address})
                            </p>
                          ) : (
                            <p className="text-[9px] text-slate-400 mt-1 italic">Sem destino definido</p>
                          )}
                        </div>
                        {t.lastLat && t.lastLng && (
                          <button
                            onClick={() => {
                              setSelectedTruck(t);
                              setActiveDashboardModal(null);
                            }}
                            className="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-md hover:bg-blue-700 transition-all active:scale-95 flex-shrink-0"
                          >
                            Rastrear
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}

                {activeDashboardModal === 'pending' && (() => {
                  const pendingList = deliveries.filter(d => d.status === 'PENDING');

                  if (pendingList.length === 0) {
                    return (
                      <div className="text-center py-10 space-y-2">
                        <Clock size={40} className="text-slate-300 mx-auto" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Nenhum abastecimento pendente na fila.</p>
                      </div>
                    );
                  }

                  return pendingList.map(d => (
                    <div key={d.id} className="p-3 bg-amber-50/40 border border-amber-100 rounded-2xl flex justify-between items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 uppercase truncate">{d.residentName}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{d.address}</p>
                        <p className="text-[9px] text-slate-400 font-medium mt-1">
                          Cadastrado em: {new Date(d.createdAt || '').toLocaleDateString()} às {new Date(d.createdAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setActiveDashboardModal(null);
                        }}
                        className="bg-amber-500 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shadow-md hover:bg-amber-600 transition-all active:scale-95 flex-shrink-0"
                      >
                        Fechar
                      </button>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-100 pt-3 flex justify-end flex-shrink-0">
                <button
                  onClick={() => setActiveDashboardModal(null)}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddTruck && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-5 sm:p-8 max-w-md w-full shadow-2xl border-2 sm:border-4 border-brand-dark/10 max-h-[92dvh] overflow-y-auto my-auto">
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mb-4 sm:mb-6">Novo Caminhão</h3>
              <div className="space-y-4">
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Placa"
                  value={newTruck.plate}
                  onChange={e => setNewTruck(prev => ({ ...prev, plate: e.target.value }))}
                />
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  value={newTruck.driverName}
                  onChange={e => setNewTruck(prev => ({ ...prev, driverName: e.target.value }))}
                >
                  <option value="">Selecionar Motorista...</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <p className="text-red-500 text-xs font-semibold px-1">
                    ⚠️ Nenhum motorista cadastrado. Cadastre motoristas na aba de Cadastros primeiro.
                  </p>
                )}
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowAddTruck(false)} className="flex-1 py-3 rounded-xl border border-slate-200">Cancelar</button>
                <button onClick={handleAddTruck} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold">Salvar</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddDelivery && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-4 sm:p-6 lg:p-8 max-w-2xl w-full shadow-2xl my-auto border-2 sm:border-4 border-brand-dark/10 max-h-[92dvh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Despacho para Motorista</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">Nova Entrega de Água</h3>
                  <p className="text-slate-500 text-xs mt-0.5">Selecione o morador cadastrado e o sistema preenche tudo automaticamente.</p>
                </div>
                <button 
                  onClick={() => setShowAddDelivery(false)} 
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Seletor de Caminhão / Motorista */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <TruckIcon size={12} className="text-blue-600" />
                      1. Caminhão / Motorista *
                    </label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                      value={newDelivery.truckId}
                      onChange={e => setNewDelivery(prev => ({ ...prev, truckId: e.target.value }))}
                    >
                      <option value="">Selecionar Caminhão...</option>
                      {trucks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.driverName} ({t.plate}) - {t.status === 'IDLE' ? 'Disponível' : 'Em Rota'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Seletor do Morador Salvo */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Users size={12} className="text-emerald-600" />
                      2. Morador do Banco de Dados *
                    </label>
                    <select 
                      className="w-full bg-emerald-50/50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                      value={newDelivery.residentId || (residents.find(r => r.name === newDelivery.residentName)?.id || '')}
                      onChange={e => {
                        const sel = residents.find(r => r.id === e.target.value);
                        handleSelectResident(sel || null);
                      }}
                    >
                      <option value="">Escolha um Morador Cadastrado...</option>
                      {[...residents].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} — {r.neighborhood || r.address || 'Inhapi'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Card com os dados que foram preenchidos automaticamente do banco */}
                  {selectedResidentObj ? (
                    <div className="md:col-span-2 bg-gradient-to-br from-emerald-50 to-teal-50/40 border-2 border-emerald-200 rounded-2xl p-4 text-slate-800 shadow-sm animate-in fade-in duration-200">
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-emerald-200/70">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <CheckCircle2 size={14} />
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-950 block">
                              Morador Localizado no Banco de Dados
                            </span>
                            <span className="text-[10px] text-emerald-700 font-semibold">
                              Informações carregadas e preenchidas automaticamente
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold bg-emerald-100/90 text-emerald-800 px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200 shrink-0">
                          <Sparkles size={11} className="text-emerald-600" /> Automático
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="font-bold text-emerald-700 text-[9px] uppercase tracking-wider block">Nome do Morador:</span>
                          <p className="font-black text-slate-900 text-sm mt-0.5">{selectedResidentObj.name}</p>
                        </div>
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="font-bold text-emerald-700 text-[9px] uppercase tracking-wider block">Bairro / Sítio:</span>
                          <p className="font-bold text-slate-800 mt-0.5">{selectedResidentObj.neighborhood || 'Inhapi (Centro)'}</p>
                        </div>
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="font-bold text-emerald-700 text-[9px] uppercase tracking-wider block">Ponto de Referência Cadastrado:</span>
                          <p className="font-semibold text-slate-700 mt-0.5">{selectedResidentObj.referencePoint || 'Nenhum ponto registrado'}</p>
                        </div>
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="font-bold text-emerald-700 text-[9px] uppercase tracking-wider block">Telefone de Contato:</span>
                          <p className="font-mono font-bold text-slate-800 mt-0.5">{selectedResidentObj.phone || 'Sem telefone registrado'}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="md:col-span-2 bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4 text-center text-xs text-slate-500">
                      💡 Selecione o morador acima: o endereço, ponto de referência, telefone e histórico serão preenchidos automaticamente.
                    </div>
                  )}

                  {/* Campos do Formulário para Revisão ou Edição */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <MapPin size={12} className="text-blue-600" />
                      Endereço Completo para Entrega *
                    </label>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm" 
                      placeholder="Ex: Rua São Vicente, 120 - Centro"
                      value={newDelivery.address}
                      onChange={e => setNewDelivery(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Ponto de Referência
                    </label>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" 
                      placeholder="Ex: Próximo à caixa d'água / em frente ao mercadinho"
                      value={newDelivery.referencePoint}
                      onChange={e => setNewDelivery(prev => ({ ...prev, referencePoint: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Telefone do Morador
                    </label>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-slate-800 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" 
                      placeholder="(82) 99999-9999"
                      value={newDelivery.phone || ''}
                      onChange={e => setNewDelivery(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Indicação (Vereador)
                    </label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                      value={newDelivery.councilman}
                      onChange={e => setNewDelivery(prev => ({ ...prev, councilman: e.target.value }))}
                    >
                      <option value="">Sem indicação específica...</option>
                      {councilmen.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Bairro / Sítio
                    </label>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" 
                      placeholder="Ex: Sítio Chã / Centro"
                      value={newDelivery.neighborhood || ''}
                      onChange={e => setNewDelivery(prev => ({ ...prev, neighborhood: e.target.value }))}
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5 font-bold">
                      <MapPin size={14} className="text-emerald-600" />
                      Coordenadas GPS da Entrega:
                    </span>
                    <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                      {newDelivery.lat.toFixed(4)}, {newDelivery.lng.toFixed(4)}
                    </span>
                  </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => setShowAddDelivery(false)} 
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleAddDelivery} 
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
                >
                  <Send size={16} /> Enviar para Motorista
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddSitio && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-5 sm:p-8 max-w-md w-full shadow-2xl border-2 sm:border-4 border-brand-dark/10 overflow-y-auto max-h-[92dvh] my-auto">
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mb-4 sm:mb-6">{editingSitio ? 'Editar Local' : 'Novo Local'}</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo de Local</label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* 1º Esquerda: Morador */}
                    <button 
                      type="button"
                      onClick={() => setNewSitio(prev => ({ ...prev, type: 'RESIDENT', fuelType: 'NONE' }))}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitio.type === 'RESIDENT' ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <Home size={13} />
                      Morador
                    </button>

                    {/* 2º Meio: Escola */}
                    <button 
                      type="button"
                      onClick={() => setNewSitio(prev => ({ ...prev, type: 'SCHOOL', fuelType: 'NONE' }))}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitio.type === 'SCHOOL' ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <School size={13} />
                      Escola
                    </button>

                    {/* 3º Direita: Creche */}
                    <button 
                      type="button"
                      onClick={() => setNewSitio(prev => ({ ...prev, type: 'DAYCARE', fuelType: 'NONE' }))}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all border flex items-center justify-center gap-1.5 ${newSitio.type === 'DAYCARE' ? 'bg-pink-500 border-pink-400 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <Baby size={13} />
                      Creche
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coordenadas Manuais (Copiar e Colar)</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono" 
                    placeholder="Ex: -9.2201, -36.3503"
                    value={newSitio.rawCoords}
                    onChange={e => {
                      const val = e.target.value;
                      const match = val.match(/([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)/);
                      if (match) {
                        setNewSitio(prev => ({ ...prev, rawCoords: val, lat: parseFloat(match[1]), lng: parseFloat(match[2]) }));
                      } else {
                        setNewSitio(prev => ({ ...prev, rawCoords: val }));
                      }
                    }}
                  />
                  <div className="flex gap-2 text-xs text-slate-500 font-mono mt-1 px-1">
                    <span>Lat: {newSitio.lat}</span>
                    <span>|</span>
                    <span>Lng: {newSitio.lng}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold ml-1 uppercase italic">* Clique no mapa para capturar coordenadas automaticamente</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identificação</label>
                  <input 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                    placeholder={
                      newSitio.type === 'RESIDENT' ? 'Nome do Morador ou Sítio' :
                      newSitio.type === 'SCHOOL' ? 'Nome da Escola' :
                      'Nome da Creche'
                    }
                    value={newSitio.name}
                    onChange={e => setNewSitio(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-h-[80px]" 
                    placeholder="Descrição opcional..."
                    value={newSitio.description}
                    onChange={e => setNewSitio(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => { setShowAddSitio(false); setEditingSitio(null); }} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold uppercase text-[10px] tracking-widest">Cancelar</button>
                <button onClick={handleAddSitio} className="flex-1 py-3 rounded-xl bg-brand-dark text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-brand-dark/20">Salvar Local</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddResident && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-5 sm:p-8 max-w-md w-full shadow-2xl border-2 sm:border-4 border-brand-dark/10 overflow-y-auto max-h-[92dvh] my-auto">
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mb-4 sm:mb-6">Novo Morador</h3>
              <div className="space-y-4">
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Nome Completo"
                  value={newResident.name}
                  onChange={e => setNewResident(prev => ({ ...prev, name: e.target.value }))}
                />
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Endereço"
                  value={newResident.address}
                  onChange={e => setNewResident(prev => ({ ...prev, address: e.target.value }))}
                />
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Bairro / Sítio"
                  value={newResident.neighborhood}
                  onChange={e => setNewResident(prev => ({ ...prev, neighborhood: e.target.value }))}
                />
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Telefone (opcional)"
                  value={newResident.phone}
                  onChange={e => setNewResident(prev => ({ ...prev, phone: e.target.value }))}
                />
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Ponto de Referência"
                  value={newResident.referencePoint || ''}
                  onChange={e => setNewResident(prev => ({ ...prev, referencePoint: e.target.value }))}
                />

                {/* Seleção de Vereador cadastrado ou Adicionar Novo */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                      Vereador / Indicação
                    </label>
                    {!isAddingCouncilmanInResident && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCouncilmanInResident(true);
                          setInlineCouncilmanName('');
                        }}
                        className="text-[11px] font-black text-purple-600 hover:text-purple-700 flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Plus size={12} /> Novo Vereador
                      </button>
                    )}
                  </div>

                  {!isAddingCouncilmanInResident ? (
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:border-brand-primary outline-none"
                      value={newResident.councilman || ''}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsAddingCouncilmanInResident(true);
                          setInlineCouncilmanName('');
                        } else {
                          setNewResident(prev => ({ ...prev, councilman: e.target.value }));
                        }
                      }}
                    >
                      <option value="">Selecione o Vereador (Opcional)...</option>
                      {councilmen.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      <option value="__ADD_NEW__" className="text-purple-600 font-bold">
                        ➕ Adicionar Novo Vereador...
                      </option>
                    </select>
                  ) : (
                    <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider">Novo Vereador no Banco de Dados</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingCouncilmanInResident(false);
                            setInlineCouncilmanName('');
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Nome do Vereador"
                          value={inlineCouncilmanName}
                          onChange={e => setInlineCouncilmanName(e.target.value)}
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (inlineCouncilmanName.trim()) {
                                const saved = await handleQuickAddCouncilman(inlineCouncilmanName);
                                setNewResident(prev => ({ ...prev, councilman: saved }));
                                setIsAddingCouncilmanInResident(false);
                                setInlineCouncilmanName('');
                              }
                            }
                          }}
                          className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          disabled={!inlineCouncilmanName.trim()}
                          onClick={async () => {
                            if (inlineCouncilmanName.trim()) {
                              const saved = await handleQuickAddCouncilman(inlineCouncilmanName);
                              setNewResident(prev => ({ ...prev, councilman: saved }));
                              setIsAddingCouncilmanInResident(false);
                              setInlineCouncilmanName('');
                            }
                          }}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold active:scale-95 transition-all shadow-sm"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}
                  {newResident.councilman && !isAddingCouncilmanInResident && (
                    <div className="flex items-center justify-between px-1 text-[11px] text-purple-700 font-medium">
                      <span>Vereador selecionado: <strong className="uppercase">{newResident.councilman}</strong></span>
                      <button
                        type="button"
                        onClick={() => setNewResident(prev => ({ ...prev, councilman: '' }))}
                        className="text-slate-400 hover:text-red-500 text-[10px] underline ml-2"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={() => {
                    setShowAddResident(false);
                    setIsAddingCouncilmanInResident(false);
                    setInlineCouncilmanName('');
                  }} 
                  className="flex-1 py-3 rounded-xl border border-slate-200"
                >
                  Cancelar
                </button>
                <button onClick={handleAddResident} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold">Salvar</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddCouncilman && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-5 sm:p-8 max-w-md w-full shadow-2xl border-2 sm:border-4 border-brand-dark/10 overflow-y-auto max-h-[92dvh] my-auto">
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mb-4 sm:mb-6">Novo Vereador</h3>
              <div className="space-y-4">
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Nome do Vereador"
                  value={newCouncilman.name}
                  onChange={e => setNewCouncilman(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowAddCouncilman(false)} className="flex-1 py-3 rounded-xl border border-slate-200">Cancelar</button>
                <button onClick={handleAddCouncilman} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold">Salvar</button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddDriver && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl sm:rounded-[36px] p-5 sm:p-8 max-w-md w-full shadow-2xl border-2 sm:border-4 border-brand-dark/10 overflow-y-auto max-h-[92dvh] my-auto">
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mb-4 sm:mb-6">Novo Motorista</h3>
              <div className="space-y-4">
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" 
                  placeholder="Nome do Motorista"
                  value={newDriver.name}
                  onChange={e => setNewDriver(prev => ({ ...prev, name: e.target.value }))}
                />
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono" 
                  placeholder="Telefone / Contato"
                  value={newDriver.phone}
                  onChange={e => setNewDriver(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowAddDriver(false)} className="flex-1 py-3 rounded-xl border border-slate-200">Cancelar</button>
                <button onClick={handleAddDriver} className="flex-1 py-3 rounded-xl bg-brand-dark text-white font-semibold">Salvar</button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedTruck && (
          <div className="fixed inset-0 z-[2000] flex justify-end">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               onClick={() => setSelectedTruck(null)}
               className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
             />
             <motion.div 
               initial={{ x: '100%' }} 
               animate={{ x: 0 }} 
               exit={{ x: '100%' }} 
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="relative w-full max-w-full sm:max-w-md bg-white backdrop-blur-xl h-full shadow-2xl flex flex-col p-5 sm:p-6 lg:p-8 overflow-y-auto border-l border-white/30 pb-24 lg:pb-8 transition-all duration-300"
             >
               <div className="flex justify-between items-start mb-6 sm:mb-8">
                 <div>
                    <span className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1 block">Detalhes do Veículo</span>
                    <h2 className="text-2xl sm:text-3xl font-black">{selectedTruck.driverName}</h2>
                    <p className="text-slate-400 font-mono text-sm">{selectedTruck.plate}</p>
                 </div>
                 <button 
                   onClick={() => {
                     setSelectedTruck(null);
                     setPlannedRoute(undefined);
                   }}
                   className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                 >
                   <X size={24} />
                 </button>
               </div>

               <div className="flex gap-4 mb-8">
                  <div className="flex-1 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Status Atual</p>
                    <span className={`text-sm font-bold ${
                      selectedTruck.status === 'IN_ROUTE' ? 'text-amber-600' : 
                      selectedTruck.status === 'ARRIVED' ? 'text-emerald-600' : 'text-slate-500'
                    }`}>
                      {selectedTruck.status === 'IN_ROUTE' ? 'Em Rota' : selectedTruck.status === 'ARRIVED' ? 'No Local' : 'Disponível'}
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Último Sinal</p>
                    <span className="text-sm font-bold text-slate-700">
                      {new Date(selectedTruck.lastUpdate || '').toLocaleTimeString()}
                    </span>
                  </div>
               </div>

               <div className="flex-1">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-bold flex items-center gap-2">
                     <ClipboardList className="text-blue-500" size={20} /> Histórico de Entregas
                   </h3>
                   <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wider text-slate-500">
                     {deliveries.filter(d => d.truckId === selectedTruck.id).length} Total
                   </span>
                 </div>

                 <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] uppercase font-bold text-emerald-400 mb-0.5">Concluídas</p>
                      <p className="text-lg font-black text-emerald-600">
                        {deliveries.filter(d => d.truckId === selectedTruck.id && d.status === 'DELIVERED').length}
                      </p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                      <p className="text-[9px] uppercase font-bold text-amber-400 mb-0.5">Pendentes</p>
                      <p className="text-lg font-black text-amber-600">
                        {deliveries.filter(d => d.truckId === selectedTruck.id && d.status !== 'DELIVERED').length}
                      </p>
                    </div>
                 </div>

                 <div className="space-y-3">
                   {deliveries
                     .filter(d => d.truckId === selectedTruck.id)
                     .length === 0 ? (
                       <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                          <p className="text-slate-400 text-sm">Sem histórico recente.</p>
                       </div>
                     ) : (
                       deliveries
                        .filter(d => d.truckId === selectedTruck.id)
                        .map(delivery => (
                          <div key={delivery.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <div className="flex justify-between items-start mb-1">
                              <h4 className="font-bold text-slate-800">{delivery.residentName}</h4>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                delivery.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                              }`}>
                                {delivery.status === 'DELIVERED' ? 'CONCLUÍDA' : 'EM ROTA'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{delivery.address}</p>
                            
                            {delivery.photo && (
                              <button 
                                onClick={() => setSelectedPhoto(delivery.photo!)}
                                className="mt-3 flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                              >
                                <ImageIcon size={12} /> Ver Comprovante
                              </button>
                            )}

                            <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock size={10} /> {new Date(delivery.createdAt || '').toLocaleDateString()}
                            </div>
                          </div>
                        ))
                     )
                   }
                 </div>
               </div>

                <div className="mt-8 space-y-3">
                  {(() => {
                    const activeDel = deliveries.find(d => d.truckId === selectedTruck.id && d.status === 'IN_ROUTE');
                    if (!activeDel || !selectedTruck.lastLat || !selectedTruck.lastLng) return null;
                    return (
                      <button 
                        onClick={async () => {
                          setSettingsLoading(true);
                          const roadRoute = await fetchRoadRoute([
                            [selectedTruck.lastLat!, selectedTruck.lastLng!],
                            [activeDel.lat, activeDel.lng]
                          ]);
                          setSettingsLoading(false);
                          if (roadRoute && isRoadRoute(roadRoute)) {
                            setPlannedRoute(roadRoute);
                            setActiveTab('map');
                            setSelectedTruck(null);
                          } else {
                            alert('Não foi possível traçar a rota pelas vias no momento.');
                          }
                        }}
                        className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                      >
                        <Navigation size={18} /> Traçar Rota até Entrega Atual (Pelas Estradas)
                      </button>
                    );
                  })()}

                  <button 
                   onClick={handleOptimizeRoute}
                   className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    <Navigation size={18} /> Otimizar e Traçar Rota pelas Estradas
                  </button>

                 <button 
                  onClick={() => {
                    setNewDelivery(prev => ({ ...prev, truckId: selectedTruck.id }));
                    setActiveTab('map');
                    setSelectedTruck(null);
                  }}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                 >
                   <Plus size={18} /> Designar Nova Entrega
                 </button>
               </div>
             </motion.div>
          </div>
        )}
        {selectedSitio && (
          <div className="fixed inset-0 z-[2000] flex justify-end">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               onClick={() => setSelectedSitio(null)}
               className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
             />
             <motion.div 
               initial={{ x: '100%' }} 
               animate={{ x: 0 }} 
               exit={{ x: '100%' }} 
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="relative w-full max-w-full sm:max-w-md bg-white backdrop-blur-xl h-full shadow-2xl flex flex-col p-5 sm:p-6 lg:p-8 overflow-y-auto border-l border-white/30 pb-24 lg:pb-8 transition-all duration-300"
             >
               <div className="flex justify-between items-start mb-6 sm:mb-8">
                 <div>
                    <span className="text-xs font-black text-purple-600 uppercase tracking-widest mb-1 block">Local Registrado</span>
                    <h2 className="text-2xl sm:text-3xl font-black">{selectedSitio.name}</h2>
                    <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-2">
                       <MapPin size={14} /> {selectedSitio.lat.toFixed(6)}, {selectedSitio.lng.toFixed(6)}
                    </div>
                 </div>
                 <button 
                   onClick={() => setSelectedSitio(null)}
                   className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                 >
                   <X size={24} />
                 </button>
               </div>

               <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                 <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Descrição</h3>
                 <p className="text-slate-700 leading-relaxed">
                   {selectedSitio.description || 'Nenhuma descrição fornecida.'}
                 </p>
               </div>

               <div className="mt-auto">
                 <button 
                  onClick={() => {
                    setNewDelivery(prev => ({ 
                      ...prev, 
                      lat: selectedSitio.lat, 
                      lng: selectedSitio.lng,
                      address: selectedSitio.name 
                    }));
                    setShowAddDelivery(true);
                    setSelectedSitio(null);
                  }}
                  className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-purple-100 hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                 >
                   <Plus size={18} /> Criar Entrega Neste Local
                 </button>
                 <button 
                  onClick={() => {
                    handleDelete('sitios', selectedSitio.id);
                    setSelectedSitio(null);
                  }}
                  className="w-full bg-red-50 hover:bg-red-100/80 active:bg-red-100 text-red-600 font-bold py-4 rounded-2xl border border-red-200/60 transition-all flex items-center justify-center gap-2 font-black uppercase tracking-wider text-xs mt-3"
                 >
                   <Trash2 size={16} /> Excluir Ponto do Mapa
                 </button>
               </div>
             </motion.div>
          </div>
        )}

        {selectedPhoto && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[3000] flex items-center justify-center p-6" onClick={() => setSelectedPhoto(null)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              className="relative max-w-4xl w-full max-h-full flex items-center justify-center"
            >
              <img src={selectedPhoto} alt="Comprovante" className="max-w-full max-h-[85vh] object-contain rounded-3xl shadow-2xl border-4 border-white/10" />
              <button 
                onClick={() => setSelectedPhoto(null)}
                className="absolute -top-12 right-0 text-white bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <X size={32} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
