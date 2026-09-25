import React, { useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AndroidInstallModal } from './AndroidInstallModal';

interface AndroidInstallBannerProps {
  variant?: 'banner' | 'button' | 'compact';
  className?: string;
}

export const AndroidInstallBanner: React.FC<AndroidInstallBannerProps> = ({ 
  variant = 'button',
  className = ''
}) => {
  const { isInstalled, isAndroid, isInstallable, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // If already installed in standalone mode and user dismissed banner, hide banner variant
  if (isInstalled && variant === 'banner') return null;
  if (dismissed && variant === 'banner') return null;

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-[11px] font-black uppercase tracking-wider shadow-sm transition-all ${className}`}
          title="Instalar aplicativo no Android"
        >
          <Smartphone size={14} />
          <span>App Android</span>
        </button>
        <AndroidInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  if (variant === 'button') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all ${className}`}
          title="Instalar aplicativo oficial no Android"
        >
          <Smartphone size={16} className="animate-bounce" />
          <span>Instalar no Android</span>
        </button>
        <AndroidInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  // Variant === 'banner'
  return (
    <>
      <div className={`bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <Smartphone size={18} />
          </div>
          <div className="truncate">
            <p className="font-black uppercase tracking-tight text-white text-[11px]">
              Versão Android Disponível
            </p>
            <p className="text-white/80 text-[10px] truncate">
              Instale a Operação Pipa no seu celular para suporte offline e tela cheia.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleClick}
            className="px-3 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 font-black text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Download size={13} /> Instalar
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Dispensar aviso"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <AndroidInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};

export default AndroidInstallBanner;
