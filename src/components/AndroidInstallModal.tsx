import React, { useState } from 'react';
import { 
  Smartphone, 
  Download, 
  CheckCircle2, 
  X, 
  Share2, 
  HelpCircle, 
  QrCode, 
  ShieldCheck, 
  WifiOff, 
  Sparkles,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidInstallModal: React.FC<AndroidInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isAndroid, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'apk' | 'qrcode'>('quick');

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(currentUrl)}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Android branding */}
        <div className="bg-gradient-to-br from-[#1b4382] via-[#0284c7] to-[#0ea5e9] p-5 sm:p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center flex-shrink-0">
              <img 
                src="/pwa-192x192.png" 
                alt="Operação Pipa" 
                className="w-full h-full object-contain rounded-xl"
                onError={(e) => {
                  e.currentTarget.src = '/icon.svg';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-400/30 flex items-center gap-1">
                  <Smartphone size={12} /> Versão Android
                </span>
                <span className="text-white/70 text-[10px] font-bold">PWA / WebAPK</span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white mt-0.5">
                Operação Pipa no Android
              </h2>
            </div>
          </div>
          <p className="text-xs text-white/80 font-medium">
            Instale o aplicativo oficial no seu smartphone para ter acesso rápido, tela cheia e suporte offline.
          </p>

          {/* Sub-tabs */}
          <div className="flex gap-2 mt-4 bg-black/20 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('quick')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                activeTab === 'quick' ? 'bg-white text-brand-dark shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Instalação Direta
            </button>
            <button
              onClick={() => setActiveTab('qrcode')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                activeTab === 'qrcode' ? 'bg-white text-brand-dark shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              QR Code (Celular)
            </button>
            <button
              onClick={() => setActiveTab('apk')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                activeTab === 'apk' ? 'bg-white text-brand-dark shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Pacote APK / Loja
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-slate-700">
          {activeTab === 'quick' && (
            <div className="space-y-4">
              {/* Native Install Action if ready */}
              {isInstallable && !isInstalled && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Download size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-emerald-900">Instalação com 1 Toque</h4>
                      <p className="text-xs text-emerald-700">Seu dispositivo suporta instalação instantânea!</p>
                    </div>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all whitespace-nowrap"
                  >
                    Instalar Agora
                  </button>
                </div>
              )}

              {isInstalled && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-blue-900">Aplicativo Já Instalado</h4>
                    <p className="text-xs text-blue-700">Você já está usando a versão instalada no seu dispositivo!</p>
                  </div>
                </div>
              )}

              {/* Step by Step for Android Chrome */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-brand-teal" />
                  Como instalar pelo navegador Android (Google Chrome):
                </h4>
                
                <ol className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-teal/20 text-brand-teal font-black flex items-center justify-center flex-shrink-0 text-[11px]">
                      1
                    </span>
                    <span>
                      Abra este link no <strong>Google Chrome</strong> do seu Android.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-teal/20 text-brand-teal font-black flex items-center justify-center flex-shrink-0 text-[11px]">
                      2
                    </span>
                    <span>
                      Toque no menu de três pontinhos (<strong>⋮</strong>) no canto superior direito do navegador.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-teal/20 text-brand-teal font-black flex items-center justify-center flex-shrink-0 text-[11px]">
                      3
                    </span>
                    <span>
                      Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-teal/20 text-brand-teal font-black flex items-center justify-center flex-shrink-0 text-[11px]">
                      4
                    </span>
                    <span>
                      Pronto! O ícone da <strong>Operação Pipa</strong> ficará junto dos seus outros apps, abrindo sem a barra do navegador.
                    </span>
                  </li>
                </ol>
              </div>

              {/* Advantages */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <ShieldCheck size={18} className="mx-auto text-emerald-600 mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Sem Ocupar Memória</p>
                  <p className="text-[10px] text-slate-500">Pesa menos de 2 MB no celular</p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <WifiOff size={18} className="mx-auto text-blue-600 mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Rotas em Cache</p>
                  <p className="text-[10px] text-slate-500">Funciona em áreas sem sinal</p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <Sparkles size={18} className="mx-auto text-amber-500 mb-1" />
                  <p className="text-[11px] font-bold text-slate-800">Atualização Automática</p>
                  <p className="text-[10px] text-slate-500">Sempre na versão mais recente</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'qrcode' && (
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <p className="text-xs text-slate-600 max-w-sm">
                Aponte a câmera do seu celular Android para o QR Code abaixo para abrir e instalar o aplicativo direto no seu telefone:
              </p>
              
              <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code para instalar no celular" 
                  className="w-52 h-52 object-contain"
                />
              </div>

              <div className="w-full flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <input 
                  type="text" 
                  readOnly 
                  value={currentUrl} 
                  className="bg-transparent text-xs text-slate-600 flex-1 outline-none px-2 font-mono truncate"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-1.5 bg-brand-dark hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copiado!' : 'Copiar Link'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'apk' && (
            <div className="space-y-3.5 text-xs text-slate-600">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900">
                <h4 className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 text-amber-950 mb-1">
                  <Smartphone size={15} /> Geração de APK Nativo (Google Play / MDM)
                </h4>
                <p className="text-[11px] leading-relaxed">
                  O padrão <strong>PWA (Progressive Web App)</strong> configurado neste projeto atende 100% aos requisitos do Google para geração de <strong>WebAPK</strong> e <strong>TWA (Trusted Web Activity)</strong>.
                </p>
              </div>

              <div className="space-y-2 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                <h5 className="font-bold text-slate-800 text-xs">Opções para gerar o arquivo .APK:</h5>
                <ul className="space-y-2 list-disc list-inside text-slate-600">
                  <li>
                    <strong>PWA Builder (Recomendado pelo Google):</strong> Acesse{' '}
                    <a 
                      href="https://www.pwabuilder.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 font-bold underline inline-flex items-center gap-0.5"
                    >
                      PWABuilder.com <ExternalLink size={12} />
                    </a>, cole a URL deste app e clique em <em>"Package for Android"</em> para baixar o pacote APK assinado ou AAB para a Google Play Store.
                  </li>
                  <li>
                    <strong>Bubblewrap CLI:</strong> Ferramenta oficial do Google para empacotar este PWA em APK nativo via terminal (`npm i -g @bubblewrap/cli`).
                  </li>
                  <li>
                    <strong>Instalação Direta no Celular:</strong> A forma mais rápida e recomendada para os motoristas da Prefeitura é a <strong>Instalação Direta</strong> pela aba anterior, que gera o aplicativo no Android sem precisar de arquivo APK externo.
                  </li>
                </ul>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setActiveTab('quick')}
                  className="px-5 py-2.5 bg-brand-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-all"
                >
                  Voltar para Instalação Direta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-medium">
            Prefeitura Municipal de Inhapi / AL
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AndroidInstallModal;
