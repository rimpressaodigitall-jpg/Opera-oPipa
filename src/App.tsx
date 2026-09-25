import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import AdminApp from './components/AdminApp';
import DriverApp from './components/DriverApp';
import AndroidInstallBanner from './components/AndroidInstallBanner';
import { 
  Droplet, 
  LayoutDashboard,
  Lock,
  ChevronRight,
  Shield,
  AlertCircle,
  Truck,
  ArrowLeft,
  Smartphone,
  Eye,
  EyeOff,
  CheckCircle2,
  Navigation,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Specific role persistence: if they entered as driver, stays driver; if admin, stays admin
  const [selectedAccess, setSelectedAccess] = useState<'admin' | 'driver' | null>(() => {
    return (localStorage.getItem('pipa_access_role') as 'admin' | 'driver') || null;
  });

  const [appRole, setAppRole] = useState<'admin' | 'driver' | null>(() => {
    const role = (localStorage.getItem('pipa_access_role') as 'admin' | 'driver') || null;
    const adminAuth = localStorage.getItem('pipa_admin_auth') === 'true';
    if (role === 'driver') return 'driver';
    if (role === 'admin' && adminAuth) return 'admin';
    return null;
  });
  
  // Admin Password States
  const [adminPassword, setAdminPassword] = useState('');
  const [showPlainPassword, setShowPlainPassword] = useState(false);
  const [storedAdminPassword, setStoredAdminPassword] = useState<string | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('pipa_admin_auth') === 'true';
  });
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [authError, setAuthError] = useState<{ code: string; message: string; hostname: string } | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQuotaExceeded = () => setQuotaExceeded(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('firebase-quota-exceeded', handleQuotaExceeded);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('firebase-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        // Logged out: reset roles and clear persistence
        setAppRole(null);
        setSelectedAccess(null);
        setIsAdminAuthenticated(false);
        setShowPasswordPrompt(false);
        localStorage.removeItem('pipa_access_role');
        localStorage.removeItem('pipa_admin_auth');
      } else {
        const savedRole = localStorage.getItem('pipa_access_role') as 'admin' | 'driver' | null;
        const savedAdminAuth = localStorage.getItem('pipa_admin_auth') === 'true';
        if (savedRole === 'driver') {
          setAppRole('driver');
          setSelectedAccess('driver');
        } else if (savedRole === 'admin') {
          setSelectedAccess('admin');
          if (savedAdminAuth) {
            setAppRole('admin');
            setIsAdminAuthenticated(true);
          }
        }
      }
      setLoading(false);
    });
  }, []);

  const fetchAdminConfig = async () => {
    setFirebaseError(null);
    try {
      const adminDoc = await getDoc(doc(db, 'config', 'admin'));
      if (adminDoc.exists()) {
        const currentPass = adminDoc.data()?.password;
        if (currentPass === '1234' || !currentPass) {
          try {
            await setDoc(doc(db, 'config', 'admin'), {
              password: '123456',
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (e) {
            console.warn("Could not update doc:", e);
          }
          setStoredAdminPassword('123456');
        } else {
          setStoredAdminPassword(currentPass);
        }
      } else {
        try {
          await setDoc(doc(db, 'config', 'admin'), {
            password: '123456',
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.warn("Could not create admin doc:", e);
        }
        setStoredAdminPassword('123456');
      }
    } catch (error) {
      console.error("Error fetching admin config:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('offline') || (error as any)?.code === 'unavailable' || errorMessage.includes('unavailable')) {
        setFirebaseError("Sistema operando em modo offline. Algumas funções podem estar limitadas.");
      } else if (errorMessage.includes('permission')) {
        handleFirestoreError(error, OperationType.GET, 'config/admin');
      } else {
        setFirebaseError("Erro ao conectar com o servidor. Usando configurações padrão.");
      }
      
      setStoredAdminPassword('123456');
    }
  };

  const handleChooseAccess = async (choice: 'admin' | 'driver') => {
    setSelectedAccess(choice);
    if (choice === 'driver') {
      if (user) {
        localStorage.setItem('pipa_access_role', 'driver');
        setAppRole('driver');
      }
      // If !user, the Google login screen will be rendered specifically for Motorista
    } else if (choice === 'admin') {
      if (user) {
        // Already logged into Google, check password
        setIsCheckingPassword(true);
        await fetchAdminConfig();
        setIsCheckingPassword(false);
        setShowPasswordPrompt(true);
      }
      // If !user, the Google login screen will be rendered specifically for Administração
    }
  };

  const loginWithGoogle = async (targetRole?: 'admin' | 'driver') => {
    const role = targetRole || selectedAccess;
    setIsLoggingInGoogle(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        if (role === 'driver') {
          localStorage.setItem('pipa_access_role', 'driver');
          setAppRole('driver');
          setSelectedAccess('driver');
        } else if (role === 'admin') {
          setSelectedAccess('admin');
          setIsCheckingPassword(true);
          await fetchAdminConfig();
          setIsCheckingPassword(false);
          setShowPasswordPrompt(true);
        }
      }
    } catch (error: any) {
      console.error("Erro ao autenticar com Google:", error);
      const code = error?.code || 'auth/unknown';
      const message = error?.message || String(error);
      setAuthError({
        code,
        message,
        hostname: typeof window !== 'undefined' ? window.location.hostname : ''
      });
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleResetToDefaultPassword = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), {
        password: '123456',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save to firestore:", e);
    }
    setStoredAdminPassword('123456');
    setAdminPassword('123456');
    setPasswordError('');
  };

  const verifyPassword = async () => {
    const effectivePassword = storedAdminPassword || '123456';

    if (adminPassword === '123456' || adminPassword === effectivePassword) {
      if (effectivePassword !== '123456' && adminPassword === '123456') {
        try {
          await setDoc(doc(db, 'config', 'admin'), {
            password: '123456',
            updatedAt: new Date().toISOString()
          }, { merge: true });
          setStoredAdminPassword('123456');
        } catch (e) {
          console.warn("Could not update admin password in firestore:", e);
        }
      }
      localStorage.setItem('pipa_access_role', 'admin');
      localStorage.setItem('pipa_admin_auth', 'true');
      setIsAdminAuthenticated(true);
      setAppRole('admin');
      setShowPasswordPrompt(false);
      setPasswordError('');
    } else {
      setPasswordError('Senha incorreta');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-primary/10">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="text-brand-dark">
          <Droplet size={48} />
        </motion.div>
      </div>
    );
  }

  // Active View: Motorista (Locked role, no role switching)
  if (user && appRole === 'driver') {
    return (
      <div className="h-screen flex flex-col relative">
        {quotaExceeded && (
          <div className="bg-amber-500 text-amber-950 font-semibold text-xs sm:text-sm py-3 px-4 text-center justify-center flex flex-col sm:flex-row items-center gap-2 select-none shadow-md z-[1000] border-b border-amber-600/30">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={16} className="shrink-0 stroke-[2.5]" />
              <strong className="uppercase tracking-wide text-[10px] bg-amber-600/30 px-1.5 py-0.5 rounded">Cota do Firebase Excedida</strong>
            </div>
            <span>Operando de forma estável no <strong>Modo de Contingência Local</strong>. Suas ações e entregas serão salvas no aparelho!</span>
          </div>
        )}
        <DriverApp />
      </div>
    );
  }

  // Active View: Administração (Locked role, no role switching)
  if (user && appRole === 'admin' && isAdminAuthenticated) {
    return (
      <div className="h-screen flex flex-col relative">
        {quotaExceeded && (
          <div className="bg-amber-500 text-amber-950 font-semibold text-xs sm:text-sm py-3 px-4 text-center justify-center flex flex-col sm:flex-row items-center gap-2 select-none shadow-md z-[1000] border-b border-amber-600/30">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={16} className="shrink-0 stroke-[2.5]" />
              <strong className="uppercase tracking-wide text-[10px] bg-amber-600/30 px-1.5 py-0.5 rounded">Cota do Firebase Excedida</strong>
            </div>
            <span>Operando de forma estável no <strong>Modo de Contingência Local</strong>. Suas ações e entregas serão salvas no aparelho!</span>
          </div>
        )}
        <AdminApp />
      </div>
    );
  }

  // Flow Step 2: User selected an access role first, and now the Google Login appears for that specific access
  if (selectedAccess && !user) {
    const isAdmin = selectedAccess === 'admin';
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.25),rgba(255,255,255,0))] p-4 sm:p-6 overflow-y-auto">
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900/90 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-800 text-center relative overflow-hidden my-auto"
        >
          {/* Subtle top ambient indicator */}
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${isAdmin ? 'from-blue-600 to-indigo-500' : 'from-cyan-500 to-emerald-500'}`} />

          {/* Role badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide mb-6 bg-slate-800/80 text-slate-300 border border-slate-700/60">
            {isAdmin ? <Shield size={14} className="text-blue-400" /> : <Truck size={14} className="text-cyan-400" />}
            <span>Acesso: {isAdmin ? 'Painel Administrativo' : 'Aplicativo do Motorista'}</span>
          </div>

          <div className={`w-20 h-20 ${isAdmin ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30' : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'} rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner`}>
            {isAdmin ? (
              <LayoutDashboard size={36} className="stroke-[2]" />
            ) : (
              <Truck size={36} className="stroke-[2]" />
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-bold mb-2 tracking-tight text-white">
            {isAdmin ? 'Login da Administração' : 'Login do Motorista'}
          </h2>
          <p className="text-slate-400 mb-8 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
            {isAdmin 
              ? 'Conecte sua conta autorizada para monitorar frotas, gerenciar rotas e emitir relatórios.' 
              : 'Conecte sua conta para iniciar turnos de entrega, registrar fotos e navegar pelas vias.'}
          </p>

          <button 
            disabled={isLoggingInGoogle}
            onClick={() => loginWithGoogle(selectedAccess)}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-black/20 text-sm disabled:opacity-50 cursor-pointer"
          >
            {isLoggingInGoogle ? (
              <Droplet className="animate-spin text-blue-600" size={18} />
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
            )}
            Continuar com o Google
          </button>

          {authError && (
            <div className="mt-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-left text-slate-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>Erro de Autenticação</span>
              </div>
              
              {authError.code === 'auth/unauthorized-domain' ? (
                <div className="space-y-2 leading-relaxed text-slate-300">
                  <p className="font-medium text-red-300">
                    O domínio atual não está autorizado nas configurações do seu Firebase.
                  </p>
                  <p className="text-slate-400">
                    Para permitir o login no domínio publicado, siga estes passos simples:
                  </p>
                  <ol className="list-decimal pl-4 text-slate-300 space-y-1 font-medium">
                    <li>Acesse o <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-semibold">Console do Firebase</a>.</li>
                    <li>Vá em <strong>Authentication</strong> &rarr; aba <strong>Settings</strong> &rarr; seção <strong>Authorized domains</strong>.</li>
                    <li>Clique em <strong>Add domain</strong> e cole: <code className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 font-mono text-cyan-300 select-all font-semibold">{authError.hostname}</code></li>
                    <li>Clique em <strong>Save</strong> e atualize esta página.</li>
                  </ol>
                </div>
              ) : authError.code === 'auth/popup-closed-by-user' ? (
                <p className="text-slate-400">
                  A janela de login do Google foi fechada antes da confirmação. Por favor, tente novamente clicando no botão acima.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-slate-400">
                    Ocorreu um erro ao conectar com o Google:
                  </p>
                  <code className="block bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[11px] text-red-400 break-all select-all">
                    [{authError.code}] {authError.message}
                  </code>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 pt-5 border-t border-slate-800">
            <button
              onClick={() => {
                setSelectedAccess(null);
                setShowPasswordPrompt(false);
              }}
              className="text-slate-400 hover:text-white font-medium text-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} /> Voltar à seleção de acesso
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Flow Step 1: User chooses access option FIRST (Administração ou Motorista)
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.2),rgba(255,255,255,0))] p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-3xl w-full my-auto py-6 sm:py-10">
        
        {/* Header Branding */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-1.5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl mb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-xl flex items-center justify-center p-1 shadow-sm">
              <img 
                src="https://i.ibb.co/sdCcYPpy/logo-inhapi-NNPe-Z.webp" 
                alt="Brasão de Inhapi" 
                className="w-full h-full object-contain"
                onError={(e) => { e.currentTarget.src = 'https://placehold.co/100x100?text=INHAPI'; }}
              />
            </div>
          </div>
          
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Operação Pipa
          </h1>
          <p className="text-slate-400 font-medium text-xs sm:text-sm mt-1 max-w-md mx-auto">
            Sistema Integrado de Gestão Hídrica • Prefeitura de Inhapi / AL
          </p>

          <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1 rounded-full bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Selecione seu perfil de acesso para continuar</span>
          </div>
        </div>

        {/* Role Choice Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Opção 1: Administração */}
          <button 
            disabled={isCheckingPassword}
            onClick={() => handleChooseAccess('admin')}
            className="group relative bg-slate-900/80 hover:bg-slate-900 backdrop-blur-xl p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-800 hover:border-blue-500/60 text-left transition-all hover:shadow-2xl hover:shadow-blue-500/10 active:scale-[0.98] disabled:opacity-50 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <LayoutDashboard size={24} className="stroke-[2]" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Gestão Central
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold mb-1.5 text-white tracking-tight">
                Painel da Administração
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-4">
                Monitoramento da frota em tempo real, emissão de relatórios, despacho de rotas e cadastros.
              </p>

              <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Rastreamento GPS em mapa interativo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Relatórios com exportação para PDF</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Controle seguro com senha mestra</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-blue-400 group-hover:text-blue-300">
              <span>Acessar Administração</span>
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Opção 2: Motorista */}
          <button 
            onClick={() => handleChooseAccess('driver')}
            className="group relative bg-slate-900/80 hover:bg-slate-900 backdrop-blur-xl p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-800 hover:border-cyan-500/60 text-left transition-all hover:shadow-2xl hover:shadow-cyan-500/10 active:scale-[0.98] cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Truck size={24} className="stroke-[2]" />
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Operador de Campo
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold mb-1.5 text-white tracking-tight">
                Aplicativo do Motorista
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-4">
                Navegação GPS, rotas calculadas pelas vias, fotos de comprovação e modo offline resiliente.
              </p>

              <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Traçado de vias reais com setas animadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Salva localmente sem internet e sincroniza</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Confirmação fotográfica da entrega</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-cyan-400 group-hover:text-cyan-300">
              <span>Acessar como Motorista</span>
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        {/* Footer Info & Online Status */}
        <div className="text-center mt-8 space-y-3">
          {!isOnline && (
            <div className="bg-amber-500/10 text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-medium border border-amber-500/20 inline-flex items-center gap-2">
              <AlertCircle size={14} /> Modo Offline Ativo • Armazenamento Local Seguro
            </div>
          )}
          {firebaseError && (
            <div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-xl text-xs font-medium border border-red-500/20 max-w-sm mx-auto">
              {firebaseError}
            </div>
          )}
          {user && (
            <div className="pt-2 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <span>Conectado: <strong className="text-slate-200">{user.email}</strong></span>
              <span>•</span>
              <button 
                onClick={() => auth.signOut()} 
                className="text-red-400 hover:text-red-300 hover:underline font-semibold cursor-pointer"
              >
                Encerrar sessão
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Password Prompt Modal for Admin */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="bg-slate-900 p-6 sm:p-8 rounded-3xl w-full max-w-sm shadow-2xl border border-slate-800 max-h-[92dvh] overflow-y-auto"
            >
              <div className="w-14 h-14 bg-blue-600/15 border border-blue-500/30 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock size={26} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-center mb-1 text-white tracking-tight">
                Autenticação de Administrador
              </h3>
              <p className="text-slate-400 text-xs text-center mb-5 leading-relaxed">
                Digite a senha administrativa para liberar o acesso ao painel de controle.
              </p>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type={showPlainPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Senha de acesso"
                    className={`w-full bg-slate-950 border ${passwordError ? 'border-red-500' : 'border-slate-700'} focus:border-blue-500 outline-none rounded-xl py-3 pl-4 pr-11 text-white font-medium transition-all placeholder:text-slate-500 text-sm`}
                    onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlainPassword(!showPlainPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title={showPlainPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPlainPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {passwordError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 text-red-400 text-xs font-medium mt-2"
                    >
                      <AlertCircle size={14} /> {passwordError}
                    </motion.div>
                  )}
                </div>

                <div className="flex items-center justify-between px-1 text-xs">
                  <button
                    type="button"
                    onClick={handleResetToDefaultPassword}
                    className="text-blue-400 hover:text-blue-300 transition-colors font-medium cursor-pointer"
                  >
                    Usar senha padrão (123456)
                  </button>
                  <span className="text-slate-500 font-mono text-[11px]">Inhapi / AL</span>
                </div>

                <button 
                  onClick={verifyPassword}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-blue-600/25 text-sm cursor-pointer"
                >
                  <span>Entrar no Painel</span>
                  <ChevronRight size={16} />
                </button>

                <button 
                  onClick={() => {
                    setShowPasswordPrompt(false);
                    setSelectedAccess(null);
                    setAdminPassword('');
                    setPasswordError('');
                  }}
                  className="w-full text-slate-400 hover:text-slate-200 font-medium py-2 text-xs transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
