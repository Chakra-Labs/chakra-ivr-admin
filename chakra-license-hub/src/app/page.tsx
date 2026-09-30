"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  LayoutDashboard, Command, FolderKanban, CheckSquare,
  Trello, Clock, GitBranch, BarChart2, FileText,
  Users, Settings, HelpCircle, Sparkles, Search,
  Bell, Moon, Plus, MoreVertical, ShieldCheck, Database, Zap,
  Edit2, Trash2, Power, Copy, Check, Box, Key
} from "../components/icons";

interface Client {
  id: string;
  company_name: string;
  token: string;
  is_active: boolean;
  used_minutes: number;
  package_name?: string;
}

export interface Package {
  id: string;
  name: string;
  maxMinutes: number;
}

function LicenseHub({ onLogout }: { onLogout?: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [packages, setPackages] = useState<Package[]>([
    { id: '1', name: 'Starter', maxMinutes: 15000 },
    { id: '2', name: 'Growth', maxMinutes: 25000 },
    { id: '3', name: 'Business', maxMinutes: 40000 },
    { id: '4', name: 'Scale', maxMinutes: 75000 },
    { id: '5', name: 'Enterprise - MD', maxMinutes: 100000 },
    { id: '6', name: 'Enterprise - LG', maxMinutes: 200000 },
  ]);

  const getPackageMaxMinutes = (packageName?: string) => {
    const pkg = packages.find(p => p.name === packageName);
    return pkg ? pkg.maxMinutes : 15000;
  };
  const [companyName, setCompanyName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState("Starter");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentTab, setCurrentTab] = useState("dashboard");

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  useEffect(() => {
    fetch("/api/licenses")
      .then((res) => res.json())
      .then((data) => {
        setClients(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch licenses", err);
        setIsLoading(false);
      });
  }, []);

  const generateToken = async () => {
    if (!companyName.trim()) {
      showError("Please enter a company name first.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, packageName: selectedPackage }),
      });

      if (!response.ok) throw new Error("Failed to generate token");

      const newLicense = await response.json();
      setNewToken(newLicense.token);
      setClients([newLicense, ...clients]);
      setCompanyName("");
    } catch (error) {
      console.error(error);
      showError("An error occurred while generating the token.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch("/api/licenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "toggle_status", isActive: !currentStatus }),
      });
      if (response.ok) {
        setClients(clients.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
        if (selectedClient && selectedClient.id === id) {
           setSelectedClient({ ...selectedClient, is_active: !currentStatus });
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this license?")) return;
    try {
      const response = await fetch("/api/licenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        setClients(clients.filter(c => c.id !== id));
        setSelectedClient(null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) {
      setSelectedClient(null);
      return;
    }
    try {
      const response = await fetch("/api/licenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "edit", companyName: editName }),
      });
      if (response.ok) {
        setClients(clients.map(c => c.id === id ? { ...c, company_name: editName } : c));
        // Also update selectedClient so UI reflects
        if (selectedClient && selectedClient.id === id) {
           setSelectedClient({ ...selectedClient, company_name: editName });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSelectedClient(null);
    }
  };

  const openClientModal = (client: Client) => {
    setSelectedClient(client);
    setEditName(client.company_name);
    setCopied(false);
  };

  const handleCopyToken = () => {
    if (selectedClient) {
      navigator.clipboard.writeText(selectedClient.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex font-sans selection:bg-indigo-500/30 overflow-hidden relative z-0">
      {/* Toast Notification */}
      <div className={`fixed top-6 right-6 z-[100] transition-all duration-300 transform ${errorMsg ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`}>
        <div className="bg-[#15141a] border border-red-500/30 text-red-400 px-4 py-3 rounded-xl shadow-[0_10px_40px_rgba(239,68,68,0.1)] flex items-center gap-3 backdrop-blur-md">
          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
            <span className="text-red-500 font-bold font-mono">!</span>
          </div>
          <p className="text-[13px] font-medium pr-2">{errorMsg}</p>
        </div>
      </div>

      <div className="absolute -top-40 right-0 w-[800px] h-[800px] bg-[#00ebfb]/[0.03] rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute -bottom-40 -left-40 w-[800px] h-[800px] bg-indigo-500/[0.03] rounded-full blur-[120px] pointer-events-none -z-10" />
      {/* Sidebar */}
      <aside className="w-[260px] border-r border-white/5 bg-[#070709] p-5 flex flex-col gap-6 shrink-0 h-screen sticky top-0">
        <div className="flex items-center px-2 mb-6 mt-3">
          <Image src="/chakra-labs-logo.png" alt="Chakra Labs Logo" width={220} height={64} className="w-auto h-14 object-contain" priority />
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 px-2">Menu</div>
            <div className="space-y-[2px]">
              <SidebarItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={currentTab === 'dashboard'} onClick={() => setCurrentTab('dashboard')} />
              <SidebarItem icon={<Database size={16} />} label="Company" active={currentTab === 'company'} onClick={() => setCurrentTab('company')} />
              <SidebarItem icon={<Key size={16} />} label="Token" active={currentTab === 'token'} onClick={() => setCurrentTab('token')} />
              <SidebarItem icon={<Box size={16} />} label="Packages" active={currentTab === 'packages'} onClick={() => setCurrentTab('packages')} />
            </div>
          </div>
        </nav>

        <div className="mt-auto pt-4 border-t border-white/5">
          <button className="w-full relative overflow-hidden rounded-xl p-4 bg-gradient-to-b from-[#181525] to-[#0c0a13] border border-white/5 hover:border-indigo-500/30 transition-all group shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-left">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col gap-1">
              <Sparkles className="text-indigo-400 mb-1" size={18} />
              <span className="font-semibold text-sm text-zinc-200">Ask Chakra AI</span>
              <span className="text-[10px] text-zinc-500">Get insights from your licenses</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden relative">
        {/* Top Header */}
        <header className="h-[72px] px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#18181b] border border-white/10 flex items-center justify-center overflow-hidden">
              <Users size={16} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100 leading-tight">Chakra Admin</div>
              <div className="text-[11px] text-zinc-500 font-medium">admin@chakra.ai</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" size={16} />
              <input
                type="text"
                placeholder="Search Anything..."
                className="pl-10 pr-4 py-2 h-9 bg-[#121214] border border-white/5 rounded-full text-[13px] focus:outline-none focus:border-indigo-500/50 focus:bg-[#18181b] w-[280px] transition-all placeholder-zinc-600 text-zinc-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <button className="w-9 h-9 rounded-full bg-[#121214] border border-white/5 flex items-center justify-center hover:bg-white/5 transition-colors text-zinc-400">
                <Bell size={16} />
              </button>
              <button className="w-9 h-9 rounded-full bg-[#121214] border border-white/5 flex items-center justify-center hover:bg-white/5 transition-colors text-zinc-400">
                <Moon size={16} />
              </button>
              <button onClick={onLogout} title="Log Out" className="w-9 h-9 rounded-full bg-[#121214] border border-white/5 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all text-zinc-400">
                <Power size={14} />
              </button>
              <button className="h-9 px-4 ml-2 rounded-full bg-[#00ebfb] hover:bg-[#00ebfb]/90 flex items-center gap-2 font-medium text-[13px] shadow-[0_0_15px_rgba(0,235,251,0.3)] transition-all text-black border border-white/10">
                <Sparkles size={14} />
                Ask AI
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-8 pt-2 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto space-y-6">

            <div className="flex items-end justify-between mb-2">
              <div>
                <h1 className="text-[28px] font-bold tracking-tight text-zinc-100">{currentTab === 'dashboard' ? 'Welcome back, Admin' : currentTab === 'company' ? 'Manage Companies' : currentTab === 'token' ? 'Generate Tokens' : 'Subscription Packages'}</h1>
              </div>
            </div>

            {currentTab === 'dashboard' ? (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-4 gap-5">
                  <MetricCard
                    title="Total Clients"
                    value={clients.length.toString()}
                    icon={<Users size={18} className="text-zinc-300" />}
                  />
                  <MetricCard
                    title="Active Licenses"
                    value={clients.filter(c => c.is_active).length.toString()}
                    icon={<ShieldCheck size={18} className="text-zinc-300" />}
                  />
                  <MetricCard
                    title="Suspended"
                    value={clients.filter(c => !c.is_active).length.toString()}
                    icon={<Command size={18} className="text-zinc-300" />}
                  />
                  <MetricCard
                    title="Usage Min."
                    value={clients.reduce((acc, curr) => acc + curr.used_minutes, 0).toLocaleString()}
                    icon={<Clock size={18} className="text-zinc-300" />}
                  />
                </div>

                <div className="grid grid-cols-12 gap-5 h-[400px]">
                  {/* Licenses List - Styled like "Today's Tasks" */}
                  <div className="col-span-5 bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden">

                    <div className="flex justify-between items-center mb-5 relative z-10">
                      <h3 className="font-semibold text-[15px] text-zinc-200">Recent Licenses</h3>
                      <button className="text-zinc-500 hover:text-zinc-300"><MoreVertical size={16} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2.5 relative z-10">
                      {isLoading ? (
                        <div className="text-center py-8 text-zinc-500 text-sm">Loading licenses...</div>
                      ) : clients.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-sm">No licenses found.</div>
                      ) : (
                        clients.map((client) => (
                          <div 
                            key={client.id} 
                            onClick={() => openClientModal(client)}
                            className="flex items-center justify-between p-3.5 rounded-xl bg-[#15141a] border border-white/5 hover:bg-[#1a1920] transition-colors group cursor-pointer"
                          >
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-lg bg-[#1e1d24] border border-white/5 flex items-center justify-center shadow-inner group-hover:bg-[#25232d] transition-colors shrink-0">
                                <Database size={16} className="text-indigo-400/80" />
                              </div>
                              <div>
                                <div className="text-[14px] font-medium text-zinc-200 leading-tight mb-0.5 group-hover:text-[#00ebfb] transition-colors flex items-center gap-2">
                                  {client.company_name}
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-zinc-400 font-mono tracking-wider">
                                    {client.package_name || 'Starter'}
                                  </span>
                                </div>
                                <div className="text-[12px] text-zinc-500 font-mono">{client.token.substring(0, 15)}...</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-5">
                              <div className="flex flex-col items-end">
                                <CircularProgress value={client.used_minutes || 0} max={getPackageMaxMinutes(client.package_name)} size={44} strokeWidth={5.5} />
                              </div>
                              <div className="flex items-center gap-2 min-w-[70px] justify-end">
                                <span className={`text-[12px] font-medium ${client.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {client.is_active ? 'Active' : 'Suspended'}
                                </span>
                                <div className={`w-1.5 h-1.5 rounded-full ${client.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`} />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Usage Line Graph */}
                  <div className="col-span-7 bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden">
                    <UsageLineGraph clients={clients} />
                  </div>
                </div>
              </>
            ) : currentTab === 'company' ? (
              <div className="bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col mt-4">
                <h3 className="font-semibold text-[15px] text-zinc-200 mb-5">Registered Companies</h3>
                <div className="grid grid-cols-3 gap-5">
                  {clients.map(client => (
                    <div key={client.id} className="p-5 bg-[#15141a] rounded-xl border border-white/5 flex flex-col gap-4 group hover:bg-[#1a1920] transition-colors cursor-pointer" onClick={() => openClientModal(client)}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#1e1d24] border border-white/5 flex items-center justify-center shrink-0">
                          <Database size={16} className="text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-[15px] font-medium text-zinc-200 group-hover:text-[#00ebfb] transition-colors">{client.company_name}</div>
                          <div className="text-[12px] text-zinc-500 font-mono mt-0.5">{client.package_name || 'Starter'}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${client.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className={`text-[12px] font-medium ${client.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                            {client.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </div>
                        <div className="text-[12px] text-zinc-400 font-mono">
                          {client.used_minutes.toLocaleString()} mins
                        </div>
                      </div>
                    </div>
                  ))}
                  {clients.length === 0 && <div className="col-span-3 text-center py-10 text-zinc-500">No companies found.</div>}
                </div>
              </div>
            ) : currentTab === 'token' ? (
              <div className="flex justify-center mt-10">
                <div className="w-full max-w-2xl bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-8 shadow-xl flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-center mb-8 relative z-10">
                    <h3 className="font-semibold text-lg text-zinc-200">Generate New License</h3>
                  </div>

                  <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full">
                    <div className="w-full space-y-6">
                      <div className="space-y-2 text-left w-full">
                        <label className="text-[13px] font-medium text-zinc-400 ml-1">Company Name</label>
                        <input
                          type="text"
                          placeholder="Enter company name to generate token..."
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full px-5 py-4 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 focus:bg-[#1a1920] text-zinc-200 placeholder-zinc-600 transition-all text-[14px] shadow-inner"
                        />
                      </div>

                      <div className="space-y-2 text-left w-full">
                        <label className="text-[13px] font-medium text-zinc-400 ml-1">Subscription Package</label>
                        <div className="grid grid-cols-3 gap-3">
                          {packages.map(pkg => (
                            <div 
                              key={pkg.id}
                              onClick={() => setSelectedPackage(pkg.name)}
                              className={`cursor-pointer px-4 py-3 rounded-xl border text-[13px] transition-all flex justify-between items-center ${selectedPackage === pkg.name ? 'bg-[#00ebfb]/10 border-[#00ebfb]/50 text-[#00ebfb]' : 'bg-[#15141a] border-white/5 text-zinc-400 hover:border-white/10 hover:bg-[#1a1920]'}`}
                            >
                              <span className="font-medium">{pkg.name}</span>
                              <span className={`text-[11px] font-mono ${selectedPackage === pkg.name ? 'text-[#00ebfb]/70' : 'text-zinc-600'}`}>{(pkg.maxMinutes / 1000).toFixed(0)}k</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={generateToken}
                        disabled={isGenerating}
                        className="w-full py-4 mt-4 bg-[#00ebfb] hover:bg-[#00ebfb]/90 disabled:opacity-50 text-black rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(0,235,251,0.2)] active:scale-[0.98] flex items-center justify-center gap-2 text-[15px]"
                      >
                        {isGenerating ? "Generating..." : <><Plus size={18} /> Create Token</>}
                      </button>
                    </div>

                    {newToken && (
                      <div className="mt-8 w-full bg-[#121116] border border-indigo-500/20 p-6 rounded-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
                        <div className="text-[12px] text-indigo-400 font-bold mb-2 uppercase tracking-widest flex items-center justify-between">
                          New Token Ready
                          <span className="bg-indigo-500/10 text-indigo-300 px-2.5 py-1 rounded text-[11px]">Copied</span>
                        </div>
                        <div className="font-mono text-[14px] text-zinc-300 break-all bg-black/30 p-4 rounded-lg border border-white/5 selection:bg-indigo-500/30">
                          {newToken}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <PackagesPage packages={packages} setPackages={setPackages} />
            )}

          </div>
        </div>
      </main>

      {/* Modal Popup */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all opacity-100" onClick={() => setSelectedClient(null)}>
          <div className="bg-[#0f0e13] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            {/* Top usage progress line */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5">
              <div 
                className={`h-full transition-all duration-1000 ${
                  ((selectedClient.used_minutes || 0) / getPackageMaxMinutes(selectedClient.package_name)) > 0.9 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                  ((selectedClient.used_minutes || 0) / getPackageMaxMinutes(selectedClient.package_name)) > 0.75 ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-[#00ebfb] shadow-[0_0_10px_rgba(0,235,251,0.5)]'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, ((selectedClient.used_minutes || 0) / getPackageMaxMinutes(selectedClient.package_name)) * 100))}%` }}
              />
            </div>

            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00ebfb]/10 rounded-full blur-[80px] pointer-events-none" />
            
            <div className="flex items-center justify-between relative z-10">
              <h2 className="text-xl font-bold text-white">Manage License</h2>
              <button onClick={() => setSelectedClient(null)} className="text-zinc-500 hover:text-white transition-colors">
                <Plus className="rotate-45" size={20} />
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-1.5 ml-1">Company Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-zinc-200 text-[14px] transition-all"
                />
              </div>
              
              <div>
                <label className="block text-[12px] font-medium text-zinc-400 mb-1.5 ml-1">License Token</label>
                <div className="relative group">
                  <div className="w-full px-4 py-3 bg-[#121116] border border-white/5 rounded-xl text-zinc-500 text-[14px] font-mono break-all pr-12">
                    {selectedClient.token}
                  </div>
                  <button 
                    onClick={handleCopyToken}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    title="Copy token"
                  >
                    {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#15141a] border border-white/5 rounded-xl">
                <div>
                  <div className="text-[14px] font-medium text-zinc-200 mb-0.5">Package</div>
                  <div className="text-[12px] text-[#00ebfb] font-medium">{selectedClient.package_name || 'Starter'}</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#15141a] border border-white/5 rounded-xl">
                <div>
                  <div className="text-[14px] font-medium text-zinc-200 mb-0.5">License Status</div>
                  <div className="text-[12px] text-zinc-500">{selectedClient.is_active ? 'Currently active and valid' : 'Currently suspended'}</div>
                </div>
                <button 
                  onClick={() => handleToggleStatus(selectedClient.id, selectedClient.is_active)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${selectedClient.is_active ? 'bg-[#00ebfb]' : 'bg-zinc-700'}`}
                  role="switch"
                  aria-checked={selectedClient.is_active}
                >
                  <span 
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectedClient.is_active ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 relative z-10">
              <button 
                onClick={() => handleDelete(selectedClient.id)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all font-medium text-[14px]"
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => handleSaveEdit(selectedClient.id)}
                className="flex-1 py-3 bg-[#00ebfb] hover:bg-[#00ebfb]/90 text-black rounded-xl font-bold transition-all flex items-center justify-center text-[14px] shadow-[0_0_15px_rgba(0,235,251,0.2)]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-[10px] transition-all text-[13px] font-medium ${active
        ? "bg-[#181622] text-zinc-200 border border-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
      }`}>
      <div className={`flex items-center justify-center w-5 h-5 ${active ? "text-indigo-400" : ""}`}>{icon}</div>
      {label}
    </button>
  );
}

function MetricCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-[#0f0e13] border border-white/5 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

      <div className="flex items-center gap-3 mb-4 relative z-10">
        <div className="w-9 h-9 rounded-lg bg-[#18181b] border border-white/5 flex items-center justify-center shadow-inner group-hover:bg-[#202024] transition-colors">
          {icon}
        </div>
        <div className="font-medium text-[13px] text-zinc-400">{title}</div>
      </div>

      <div className="relative z-10 flex items-baseline gap-2">
        <div className="text-[32px] font-bold text-zinc-100 tracking-tight leading-none">{value}</div>
      </div>
    </div>
  );
}

function CircularProgress({ value, max, size = 42, strokeWidth = 5 }: { value: number, max: number, size?: number, strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(1, Math.max(0, value / max));
  const strokeDashoffset = circumference - percentage * circumference;

  let color = "text-[#00ebfb]";
  if (percentage > 0.9) {
    color = "text-red-500";
  } else if (percentage > 0.75) {
    color = "text-amber-400";
  }

  return (
    <div className="relative flex items-center justify-center group/progress" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${color} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[12px] font-bold text-zinc-100">{Math.round(percentage * 100)}%</span>
      </div>
      
      {/* Tooltip */}
      <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none z-50">
        <div className="bg-[#18181b] border border-white/10 text-zinc-200 text-[10px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl flex items-center gap-1.5">
          <span className="text-[#00ebfb]">{value.toLocaleString()}</span>
          <span className="text-zinc-500">/</span>
          <span className="text-zinc-400">{max.toLocaleString()} min</span>
        </div>
      </div>
    </div>
  );
}

function UsageLineGraph({ clients }: { clients: Client[] }) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');

  const totalUsage = clients.reduce((acc, curr) => acc + (curr.used_minutes || 0), 0);
  const now = new Date();
  
  let data: number[] = [];
  let labels: string[] = [];

  if (period === 'week') {
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    data = new Array(7).fill(0);
    const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    data[dayIndex] = totalUsage;
  } else if (period === 'month') {
    labels = ['1st', '5th', '10th', '15th', '20th', '25th', '30th'];
    data = new Array(7).fill(0);
    const date = now.getDate();
    const monthDays = [1, 5, 10, 15, 20, 25, 30];
    let idx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < monthDays.length; i++) {
      const diff = Math.abs(date - monthDays[i]);
      if (diff < minDiff) {
        minDiff = diff;
        idx = i;
      }
    }
    data[idx] = totalUsage;
  } else {
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    data = new Array(12).fill(0);
    data[now.getMonth()] = totalUsage;
  }
  
  const getNiceMax = (maxValue: number, ticks: number = 4) => {
    if (maxValue === 0) return 100;
    const fraction = maxValue / ticks;
    const magnitude = Math.floor(Math.log10(fraction));
    const magnitudePow = Math.pow(10, magnitude);
    const significant = fraction / magnitudePow;
    
    let niceSignificant;
    if (significant <= 1) niceSignificant = 1;
    else if (significant <= 2) niceSignificant = 2;
    else if (significant <= 5) niceSignificant = 5;
    else niceSignificant = 10;
    
    return niceSignificant * magnitudePow * ticks;
  };

  const rawMax = Math.max(...data, 4);
  const maxVal = getNiceMax(rawMax);
  const w = 800;
  const h = 300;
  const paddingX = 60;
  const paddingY = 40;
  
  const points = data.map((val, i) => {
    const x = data.length > 1 ? paddingX + (i / (data.length - 1)) * (w - paddingX * 2) : w / 2;
    const y = h - paddingY - (val / maxVal) * (h - paddingY * 2);
    return `${x},${y}`;
  }).join(" ");

  const d = `M ${points}`;
  const areaD = `M ${data.length > 1 ? paddingX : w/2},${h-paddingY} L ${points} L ${data.length > 1 ? w-paddingX : w/2},${h-paddingY} Z`;

  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-5 relative z-10">
        <h3 className="font-semibold text-[15px] text-zinc-200">Total Usage Over Time</h3>
        <div className="flex items-center gap-1 bg-[#121214] p-1 rounded-lg border border-white/5">
          {['week', 'month', 'year'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-3 py-1 text-[11px] font-medium rounded-md capitalize transition-all ${
                period === p 
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full drop-shadow-xl" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gradientLine" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ebfb" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#00ebfb" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = h - paddingY - pct * (h - paddingY*2);
            return (
              <g key={pct}>
                <line x1={paddingX} y1={y} x2={w - paddingX} y2={y} stroke="#ffffff" strokeOpacity="0.05" />
                <text x={paddingX - 10} y={y + 4} fill="#52525b" fontSize="10" textAnchor="end">{Math.round(pct * maxVal).toLocaleString()}</text>
              </g>
            );
          })}

          <path d={areaD} fill="url(#gradientLine)" />
          <path d={d} fill="none" stroke="#00ebfb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(0,235,251,0.5)]" />
          
          {data.map((val, i) => {
            const x = data.length > 1 ? paddingX + (i / (data.length - 1)) * (w - paddingX * 2) : w / 2;
            const y = h - paddingY - (val / maxVal) * (h - paddingY * 2);
            return (
              <g key={i} className="group cursor-pointer">
                <circle cx={x} cy={y} r="5" fill="#0f0e13" stroke="#00ebfb" strokeWidth="2.5" className="transition-all duration-300 group-hover:fill-[#00ebfb]" />
                <text x={x} y={h - paddingY + 20} fill="#71717a" fontSize="10" textAnchor="middle">{labels[i]}</text>
                
                {/* Tooltip text */}
                <rect x={x - 30} y={y - 35} width="60" height="22" rx="4" fill="#18181b" stroke="rgba(255,255,255,0.1)" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                <text x={x} y={y - 20} fill="#00ebfb" fontSize="10" textAnchor="middle" className="opacity-0 group-hover:opacity-100 transition-opacity font-bold">{val.toLocaleString()}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function PackagesPage({ packages, setPackages }: { packages: Package[], setPackages: React.Dispatch<React.SetStateAction<Package[]>> }) {
  const [newPkgName, setNewPkgName] = useState("");
  const [newPkgMax, setNewPkgMax] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState("");

  const addPackage = () => {
    if (!newPkgName || !newPkgMax) return;
    const newPkg: Package = {
      id: Math.random().toString(36).substr(2, 9),
      name: newPkgName,
      maxMinutes: parseInt(newPkgMax, 10),
    };
    setPackages([...packages, newPkg]);
    setNewPkgName("");
    setNewPkgMax("");
  };

  const deletePackage = (id: string) => {
    setPackages(packages.filter(p => p.id !== id));
  };

  const startEdit = (p: Package) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditMax(p.maxMinutes.toString());
  };

  const saveEdit = () => {
    setPackages(packages.map(p => p.id === editingId ? { ...p, name: editName, maxMinutes: parseInt(editMax) } : p));
    setEditingId(null);
  };

  return (
    <div className="flex gap-6 w-full mt-6 pb-20 items-start">
      <div className="w-[350px] shrink-0 bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 p-8 rounded-2xl flex flex-col gap-6 shadow-xl sticky top-6">
        <h3 className="text-zinc-200 font-semibold text-lg">Add New Package</h3>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 text-left">
            <label className="text-[12px] font-medium text-zinc-400 ml-1">Package Name</label>
            <input type="text" placeholder="e.g. Premium" value={newPkgName} onChange={e => setNewPkgName(e.target.value)} className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-zinc-200 text-[14px] transition-all" />
          </div>
          <div className="flex flex-col gap-2 text-left">
            <label className="text-[12px] font-medium text-zinc-400 ml-1">Max Minutes</label>
            <input type="number" placeholder="e.g. 50000" value={newPkgMax} onChange={e => setNewPkgMax(e.target.value)} className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-zinc-200 text-[14px] transition-all" />
          </div>
          <button onClick={addPackage} className="w-full px-6 py-3 bg-[#00ebfb] hover:bg-[#00ebfb]/90 text-black rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(0,235,251,0.2)] text-[14px] mt-2">
            Add Package
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-8 shadow-xl">
        <h3 className="text-zinc-200 font-semibold mb-6 text-lg">Existing Packages</h3>
        <div className="grid grid-cols-3 gap-5">
          {packages.map(p => (
            <div key={p.id} className="flex flex-col p-5 bg-[#15141a] rounded-xl border border-white/5 group hover:bg-[#1a1920] transition-colors relative overflow-hidden min-h-[140px]">
              {editingId === p.id ? (
                <div className="flex flex-col h-full justify-between gap-4">
                  <div className="space-y-3">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 bg-[#0f0e13] border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:border-[#00ebfb]" />
                    <input type="number" value={editMax} onChange={e => setEditMax(e.target.value)} className="w-full px-3 py-2 bg-[#0f0e13] border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:border-[#00ebfb]" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 text-[#00ebfb] hover:text-[#00ebfb]/80 py-2 bg-[#00ebfb]/10 rounded-lg text-sm font-medium transition-colors">Save</button>
                    <button onClick={() => setEditingId(null)} className="flex-1 text-zinc-400 hover:text-white py-2 bg-white/5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[#1e1d24] border border-white/5 flex items-center justify-center shrink-0 group-hover:bg-[#25232d] transition-colors">
                      <Box size={18} className="text-indigo-400" />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(p)} className="p-2 text-zinc-500 hover:text-[#00ebfb] hover:bg-[#00ebfb]/10 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deletePackage(p.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-200 font-semibold text-[16px] group-hover:text-[#00ebfb] transition-colors">{p.name}</div>
                    <div className="text-zinc-500 text-[13px] font-mono mt-1">{p.maxMinutes.toLocaleString()} mins</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {packages.length === 0 && <div className="col-span-3 text-center py-8 text-zinc-500">No packages available.</div>}
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    setTimeout(() => {
      setLoading(false);
      if (email === "admin@chakra.lk" && password === "chakra123") {
        onLogin();
      } else {
        setLoginError("Invalid email or password.");
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center font-sans relative overflow-hidden z-0 bg-cover bg-center" style={{ backgroundImage: "url('/blue-wave-black.jpg')" }}>
      <div className="absolute inset-0 bg-black/40 -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/[0.15] rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#00ebfb]/[0.1] rounded-full blur-[120px] pointer-events-none -z-10" />
      
      <div className="w-full max-w-[420px] p-8 relative z-10">
        <div className="flex justify-center mb-10">
          <Image src="/chakra-labs-logo.png" alt="Chakra Labs" width={220} height={64} className="w-auto h-16 object-contain drop-shadow-2xl" priority />
        </div>
        
        <div className="bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-[#00ebfb] to-indigo-500" />
          
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Welcome Back</h2>
          <p className="text-zinc-500 text-[13px] text-center mb-8">Enter your admin credentials to access the hub.</p>
          
          {loginError && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] text-center font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-zinc-400 ml-1">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@chakra.lk"
                className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-white text-[14px] transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[12px] font-medium text-zinc-400 ml-1">Password</label>
                <a href="#" className="text-[11px] text-[#00ebfb] hover:underline" onClick={e => e.preventDefault()}>Forgot?</a>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-white text-[14px] transition-all"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 mt-4 bg-[#00ebfb] text-black hover:bg-[#00ebfb]/90 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(0,235,251,0.2)] text-[14px] flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Sign In to Admin Hub"}
            </button>
          </form>
        </div>
        
        <p className="text-center text-zinc-600 text-[11px] mt-8 font-medium tracking-wide">
          SECURE ACCESS • CHAKRA LICENSE HUB
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    const auth = localStorage.getItem("chakra_auth");
    if (auth === "true") setIsAuthenticated(true);
  }, []);

  if (!isMounted) return <div className="min-h-screen bg-[#070709]" />; // Prevents hydration mismatch flash

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => {
      localStorage.setItem("chakra_auth", "true");
      setIsAuthenticated(true);
    }} />;
  }
  
  return <LicenseHub onLogout={() => {
    localStorage.removeItem("chakra_auth");
    setIsAuthenticated(false);
  }} />;
}
