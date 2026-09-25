import { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Award, 
  Calendar, 
  ChevronDown, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  FileText, 
  ChevronRight, 
  X, 
  MapPin, 
  Clock, 
  Image as ImageIcon,
  Download,
  Filter
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Delivery, Councilman, Resident } from '../types';

interface CouncilmanPerformanceSectionProps {
  deliveries: Delivery[];
  councilmen: Councilman[];
  residents: Resident[];
  onViewPhoto?: (photoUrl: string) => void;
}

const BAR_COLORS = [
  '#0284c7', // Sky Blue
  '#0d9488', // Teal
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#f97316', // Orange
  '#14b8a6', // Teal lighter
  '#64748b'  // Slate
];

export default function CouncilmanPerformanceSection({
  deliveries,
  councilmen,
  residents,
  onViewPhoto
}: CouncilmanPerformanceSectionProps) {
  // Current month in 'YYYY-MM' format
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [onlyDelivered, setOnlyDelivered] = useState<boolean>(true);
  const [selectedCouncilmanDetail, setSelectedCouncilmanDetail] = useState<string | null>(null);

  // Helper to extract year-month from ISO string
  const getMonthKey = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // Helper to format 'YYYY-MM' to readable Portuguese
  const formatMonthLabel = (key: string) => {
    if (key === 'ALL') return 'Todos os Meses (Geral Acumulado)';
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const date = new Date(year, month, 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'long' });
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `${capitalized} de ${year}`;
  };

  // Generate list of available months from actual deliveries + current month
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthKey);

    deliveries.forEach(d => {
      const key = getMonthKey(d.createdAt);
      if (key) set.add(key);
    });

    const list = Array.from(set).sort().reverse();
    return list;
  }, [deliveries, currentMonthKey]);

  // Helper to find which councilman an item belongs to
  const resolveCouncilmanName = (delivery: Delivery): string => {
    if (delivery.councilman && delivery.councilman.trim()) {
      return delivery.councilman.trim();
    }
    // Fallback: check linked resident in database
    if (delivery.residentId) {
      const r = residents.find(res => res.id === delivery.residentId);
      if (r?.councilman && r.councilman.trim()) {
        return r.councilman.trim();
      }
    }
    if (delivery.residentName) {
      const r = residents.find(res => res.name.trim().toLowerCase() === delivery.residentName.trim().toLowerCase());
      if (r?.councilman && r.councilman.trim()) {
        return r.councilman.trim();
      }
    }
    return 'Sem Indicação (Geral)';
  };

  // Filter deliveries according to selected month and status filter
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d => {
      // Month filter
      if (selectedMonth !== 'ALL') {
        const dMonth = getMonthKey(d.createdAt);
        if (dMonth !== selectedMonth) return false;
      }
      // Status filter
      if (onlyDelivered && d.status !== 'DELIVERED') {
        return false;
      }
      return true;
    });
  }, [deliveries, selectedMonth, onlyDelivered]);

  // Aggregate deliveries per councilman
  const councilmanStats = useMemo(() => {
    const map = new Map<string, {
      name: string;
      deliveredCount: number;
      pendingCount: number;
      totalCount: number;
      deliveries: Delivery[];
    }>();

    // Initialize map with all registered councilmen
    councilmen.forEach(c => {
      const name = c.name.trim();
      if (name) {
        map.set(name, {
          name,
          deliveredCount: 0,
          pendingCount: 0,
          totalCount: 0,
          deliveries: []
        });
      }
    });

    // Populate with filtered deliveries
    filteredDeliveries.forEach(d => {
      const cName = resolveCouncilmanName(d);
      let entry = map.get(cName);
      if (!entry) {
        entry = {
          name: cName,
          deliveredCount: 0,
          pendingCount: 0,
          totalCount: 0,
          deliveries: []
        };
        map.set(cName, entry);
      }

      if (d.status === 'DELIVERED') {
        entry.deliveredCount += 1;
      } else {
        entry.pendingCount += 1;
      }
      entry.totalCount += 1;
      entry.deliveries.push(d);
    });

    const totalInPeriod = filteredDeliveries.length;

    // Convert map to array and compute percentage
    const arr = Array.from(map.values()).map(item => {
      const activeCount = onlyDelivered ? item.deliveredCount : item.totalCount;
      const percentage = totalInPeriod > 0 ? Math.round((activeCount / totalInPeriod) * 100) : 0;
      return {
        ...item,
        activeCount,
        percentage
      };
    });

    // Sort descending by active count
    arr.sort((a, b) => b.activeCount - a.activeCount);
    return arr;
  }, [filteredDeliveries, councilmen, onlyDelivered, residents]);

  // Data specifically formatted for Recharts
  const chartData = useMemo(() => {
    // Show only councilmen with > 0 deliveries, or if all are 0, top 5
    const activeList = councilmanStats.filter(c => c.activeCount > 0);
    const listToDisplay = activeList.length > 0 ? activeList : councilmanStats.slice(0, 6);

    return listToDisplay.map(item => {
      // Shorten name for XAxis if too long
      const displayName = item.name.length > 14 
        ? item.name.substring(0, 12) + '...' 
        : item.name;

      return {
        fullName: item.name,
        name: displayName,
        count: item.activeCount,
        delivered: item.deliveredCount,
        pending: item.pendingCount,
        percentage: item.percentage
      };
    });
  }, [councilmanStats]);

  // Metrics summary
  const totalDeliveriesCount = filteredDeliveries.length;
  const topCouncilman = councilmanStats.length > 0 && councilmanStats[0].activeCount > 0 
    ? councilmanStats[0] 
    : null;
  const activeCouncilmenCount = councilmanStats.filter(c => c.activeCount > 0 && c.name !== 'Sem Indicação (Geral)').length;
  const averagePerCouncilman = activeCouncilmenCount > 0 
    ? (totalDeliveriesCount / activeCouncilmenCount).toFixed(1) 
    : '0';

  // Export PDF of Councilman Performance
  const handleExportCouncilmanPDF = () => {
    const doc = new jsPDF();
    const periodLabel = selectedMonth === 'ALL' 
      ? 'Acumulado Geral' 
      : formatMonthLabel(selectedMonth);

    doc.setFontSize(16);
    doc.text(`Desempenho por Indicação (Vereadores) - Operação Pipa Inhapi`, 14, 18);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Período de Referência: ${periodLabel}`, 14, 26);
    doc.text(`Critério: ${onlyDelivered ? 'Apenas Entregas Realizadas' : 'Todas as Solicitações'} | Total Registrado: ${totalDeliveriesCount}`, 14, 32);

    const tableColumn = ["Posição", "Vereador / Indicação", "Entregas Realizadas", "Pendentes/Rota", "Participação (%)"];
    const tableRows = councilmanStats.map((c, index) => [
      `#${index + 1}`,
      c.name,
      c.deliveredCount.toString(),
      c.pendingCount.toString(),
      `${c.percentage}%`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 38,
      theme: 'striped',
      headStyles: { fillColor: [2, 132, 199] },
      styles: { fontSize: 10 }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} - Operação Pipa de Inhapi/AL`, 14, finalY + 12);

    doc.save(`relatorio-vereadores-${selectedMonth}.pdf`);
  };

  // Find deliveries for the modal detail view
  const selectedDetailData = selectedCouncilmanDetail 
    ? councilmanStats.find(c => c.name === selectedCouncilmanDetail) 
    : null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 mb-8">
      {/* Header with Title and Month Filter */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
              <Award size={22} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-brand-dark uppercase tracking-tight">
                Desempenho por Indicação (Vereadores)
              </h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Gráfico comparativo de entregas realizadas por cada vereador com filtro mensal
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls: Month Picker & Status Toggle & Export */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Month Selector */}
          <div className="relative flex-1 sm:flex-initial min-w-[200px]">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-blue-600">
              <Calendar size={15} />
            </div>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="ALL">🗓️ Todos os Meses (Acumulado)</option>
              {availableMonths.map(monthKey => (
                <option key={monthKey} value={monthKey}>
                  {formatMonthLabel(monthKey)} {monthKey === currentMonthKey ? '★ Mês Atual' : ''}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Delivered vs All Toggle */}
          <button
            type="button"
            onClick={() => setOnlyDelivered(!onlyDelivered)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all ${
              onlyDelivered
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="Alternar entre apenas concluídas ou todas as solicitações"
          >
            <Filter size={14} />
            {onlyDelivered ? 'Apenas Realizadas' : 'Todas Indicações'}
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={handleExportCouncilmanPDF}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
            title="Exportar dados comparativos dos vereadores em PDF"
          >
            <Download size={14} />
            PDF
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 my-6">
        <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
            <span>Total no Mês</span>
            <CheckCircle2 size={14} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-brand-dark">
            {totalDeliveriesCount}
          </div>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
            {onlyDelivered ? 'Entregas concluídas' : 'Solicitações registradas'}
          </p>
        </div>

        <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/50">
          <div className="flex items-center justify-between text-amber-800 text-[10px] font-black uppercase tracking-wider mb-1">
            <span>Maior Indicação</span>
            <Award size={14} className="text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-950 truncate" title={topCouncilman?.name || 'Nenhum'}>
            {topCouncilman ? topCouncilman.name : '—'}
          </div>
          <p className="text-[10px] text-amber-700 font-bold mt-0.5">
            {topCouncilman ? `${topCouncilman.activeCount} entregas (${topCouncilman.percentage}%)` : 'Sem registros no mês'}
          </p>
        </div>

        <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200/50">
          <div className="flex items-center justify-between text-blue-800 text-[10px] font-black uppercase tracking-wider mb-1">
            <span>Vereadores Ativos</span>
            <Users size={14} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-950">
            {activeCouncilmenCount}
          </div>
          <p className="text-[10px] text-blue-700 font-bold mt-0.5">
            Com indicações atendidas
          </p>
        </div>

        <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200/50">
          <div className="flex items-center justify-between text-purple-800 text-[10px] font-black uppercase tracking-wider mb-1">
            <span>Média / Vereador</span>
            <TrendingUp size={14} className="text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-950">
            {averagePerCouncilman}
          </div>
          <p className="text-[10px] text-purple-700 font-bold mt-0.5">
            Entregas por vereador ativo
          </p>
        </div>
      </div>

      {/* Comparative Bar Chart */}
      <div className="my-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-blue-600" />
            Gráfico Comparativo de Entregas por Vereador ({formatMonthLabel(selectedMonth)})
          </h4>
          <span className="text-[11px] font-bold text-slate-400">
            Clique na barra para detalhes
          </span>
        </div>

        <div className="bg-slate-50/50 p-4 sm:p-6 rounded-2xl border border-slate-200/70 h-72 sm:h-80">
          {chartData.length === 0 || chartData.every(d => d.count === 0) ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
              <Award size={36} className="text-slate-300 mb-2" />
              <p className="font-bold text-sm">Nenhuma entrega realizada neste mês para os vereadores.</p>
              <p className="text-xs text-slate-400 mt-1">
                Selecione outro mês no filtro acima ou escolha &quot;Todos os Meses&quot;.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                margin={{ top: 15, right: 15, left: -20, bottom: 25 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const fullName = e.activePayload[0].payload.fullName;
                    setSelectedCouncilmanDetail(fullName);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} 
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={45}
                />
                <YAxis 
                  allowDecimals={false} 
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} 
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(2, 132, 199, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                          <p className="font-black text-sm text-sky-400">{data.fullName}</p>
                          <div className="border-t border-slate-700 pt-1 space-y-0.5">
                            <p className="flex justify-between gap-4 font-bold">
                              <span className="text-slate-300">Entregas Realizadas:</span>
                              <span className="text-white font-black">{data.delivered}</span>
                            </p>
                            {data.pending > 0 && (
                              <p className="flex justify-between gap-4 font-bold text-amber-400">
                                <span>Pendentes / Em Rota:</span>
                                <span>{data.pending}</span>
                              </p>
                            )}
                            <p className="flex justify-between gap-4 font-bold text-emerald-400">
                              <span>Participação no Mês:</span>
                              <span>{data.percentage}%</span>
                            </p>
                          </div>
                          <p className="text-[9px] text-slate-400 pt-1 italic">
                            Clique para listar moradores atendidos
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[8, 8, 0, 0]}
                  animationDuration={800}
                >
                  {chartData.map((_entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={BAR_COLORS[index % BAR_COLORS.length]} 
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Ranking & Performance Breakdown Table */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Award size={15} className="text-amber-500" />
            Ranking Comparativo de Atendimento por Indicação
          </h4>
          <span className="text-xs font-bold text-slate-400">
            {councilmanStats.length} vereadores cadastrados
          </span>
        </div>

        <div className="overflow-hidden border border-slate-200 rounded-2xl">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Vereador</th>
                <th className="py-3 px-4 text-center">Entregas Realizadas</th>
                <th className="py-3 px-4 text-center">Participação</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {councilmanStats.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Nenhum vereador cadastrado no sistema.
                  </td>
                </tr>
              ) : (
                councilmanStats.map((c, index) => {
                  const isTop = index === 0 && c.activeCount > 0;
                  return (
                    <tr 
                      key={c.name}
                      className={`hover:bg-slate-50 transition-colors ${
                        isTop ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center font-black">
                        {index === 0 && c.activeCount > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-[11px]">
                            🥇
                          </span>
                        ) : index === 1 && c.activeCount > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[11px]">
                            🥈
                          </span>
                        ) : index === 2 && c.activeCount > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200/60 text-amber-900 text-[11px]">
                            🥉
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">{index + 1}º</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {isTop && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                              Líder
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className="text-emerald-600 font-black text-sm">
                          {c.deliveredCount}
                        </span>
                        {c.pendingCount > 0 && (
                          <span className="text-slate-400 text-[10px] ml-1.5" title="Entregas pendentes ou em rota">
                            (+{c.pendingCount} pendentes)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, c.percentage)}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-700 text-[11px] w-8 text-left">
                            {c.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCouncilmanDetail(c.name)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-wider transition-all inline-flex items-center gap-1 active:scale-95"
                        >
                          Detalhes
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detalhes das Entregas do Vereador no Mês */}
      {selectedDetailData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-6 max-w-2xl w-full border border-slate-100 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black">
                  <Award size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-900">{selectedDetailData.name}</h3>
                  <p className="text-xs text-slate-500 font-bold">
                    {formatMonthLabel(selectedMonth)} • {selectedDetailData.activeCount} entregas registradas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCouncilmanDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 my-4 space-y-2.5 pr-1">
              {selectedDetailData.deliveries.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhuma entrega registrada para este vereador no período selecionado.
                </div>
              ) : (
                selectedDetailData.deliveries.map(delivery => (
                  <div 
                    key={delivery.id} 
                    className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">
                          {delivery.residentName}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          delivery.status === 'DELIVERED' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : delivery.status === 'IN_ROUTE' 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {delivery.status === 'DELIVERED' ? 'ENTREGUE' : delivery.status === 'IN_ROUTE' ? 'EM ROTA' : 'PENDENTE'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span>{delivery.address} {delivery.neighborhood ? `(${delivery.neighborhood})` : ''}</span>
                      </div>
                      {delivery.referencePoint && (
                        <p className="text-[10px] text-slate-400">
                          Ref: {delivery.referencePoint}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right text-[10px] text-slate-400 font-mono">
                        <Clock size={11} className="inline mr-1" />
                        {new Date(delivery.createdAt || '').toLocaleDateString('pt-BR')}
                      </div>
                      {delivery.photo && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewPhoto && delivery.photo) {
                              onViewPhoto(delivery.photo);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-tight transition-colors flex items-center gap-1"
                        >
                          <ImageIcon size={12} /> Foto
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCouncilmanDetail(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
