import React, { useState, useEffect } from 'react';
import { RBAC_ROLES } from '../data/mockData';
import { RoleId } from '../types';

interface AuthViewProps {
  onLogin: (roleId: RoleId, userName: string, matricula: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>('caixa');
  const [userLogin, setUserLogin] = useState('Marcos Silva (Mat. 1042)');
  const [password, setPassword] = useState('••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [shift, setShift] = useState('Turno 1 - Manhã/Tarde (08h às 17h)');
  const [terminal, setTerminal] = useState('Terminal Balcão 01 - Tintométrica A');
  const [liveClock, setLiveClock] = useState('14:32:08');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveClock(now.toLocaleTimeString('pt-BR'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRoleChange = (roleId: RoleId) => {
    setSelectedRoleId(roleId);
    const role = RBAC_ROLES.find(r => r.id === roleId);
    if (role) {
      setUserLogin(`${role.defaultUser} (${role.matricula})`);
    }
  };

  const currentRole = RBAC_ROLES.find(r => r.id === selectedRoleId) || RBAC_ROLES[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(selectedRoleId, currentRole.defaultUser, currentRole.matricula);
  };

  const handleBiometrics = () => {
    alert(`Autenticação biométrica / RFID realizada com sucesso para ${currentRole.defaultUser} (${currentRole.badge}).`);
    onLogin(selectedRoleId, currentRole.defaultUser, currentRole.matricula);
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col justify-between -m-2 select-none">
      {/* MAIN DUAL-CANVAS CONTAINER */}
      <div className="grid grid-cols-12 gap-6 items-stretch flex-1">
        {/* LEFT BRAND & INSTITUTIONAL CANVAS (5 Columns) */}
        <section className="col-span-12 lg:col-span-5 bg-[#0f2744] text-white rounded-xl p-6 lg:p-7 flex flex-col justify-between relative overflow-hidden border border-white/10 shadow-md">
          {/* Chromatic background accent shapes */}
          <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-[#00687a]/30 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-[#52002e]/30 blur-3xl pointer-events-none" />

          {/* Top Brand Anchor */}
          <div className="relative z-10">
            <div className="flex items-center gap-3.5 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#00687a] to-[#57dffe] p-0.5 flex items-center justify-center shadow-lg">
                <div className="w-full h-full bg-[#0f2744] rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#57dffe] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    palette
                  </span>
                </div>
              </div>
              <div>
                <h1 className="text-[20px] font-extrabold text-white tracking-tight leading-none">
                  MarquesColor
                </h1>
                <p className="text-[11px] text-[#57dffe] uppercase tracking-wider font-semibold mt-1">
                  Tintas & Revestimentos
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-white/15 pt-4">
              <h2 className="text-[15px] font-bold text-white mb-1.5 leading-snug">
                Gestão de Tintometria & PDV de Alta Performance
              </h2>
              <p className="text-xs text-[#798fb1] leading-relaxed">
                Plataforma corporativa integrada para controle de fórmulas pigmentares, dosagem de bases arquitetônicas, caixa rápido e conciliação financeira de lojas de tintas.
              </p>
            </div>

            {/* Chromatic Swatch Palette Matrix */}
            <div className="mt-5 bg-white/5 p-3.5 rounded-xl border border-white/10 backdrop-blur-xs">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold text-[#57dffe] uppercase tracking-wider">
                  Catálogo de Bases & Gloss Ativo
                </span>
                <span className="text-[11px] font-mono text-[#798fb1]">SYS-TINT #441</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-[#001229]/60 p-2 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-white shadow-xs shrink-0 border border-slate-300"></span>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">Base A</p>
                    <p className="text-[9px] text-[#798fb1] mt-0.5">Branco Puro</p>
                  </div>
                </div>

                <div className="bg-[#001229]/60 p-2 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-400 shadow-xs shrink-0"></span>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">Base B</p>
                    <p className="text-[9px] text-[#798fb1] mt-0.5">Média Tons</p>
                  </div>
                </div>

                <div className="bg-[#001229]/60 p-2 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-rose-600 shadow-xs shrink-0"></span>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">Base C</p>
                    <p className="text-[9px] text-[#798fb1] mt-0.5">Saturada</p>
                  </div>
                </div>

                <div className="bg-[#001229]/60 p-2 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-900 shadow-xs shrink-0 border border-slate-700"></span>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">Base D</p>
                    <p className="text-[9px] text-[#798fb1] mt-0.5">Escura</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Feature Badge: RBAC Security Policy Snapshot */}
          <div className="relative z-10 my-4 bg-[#001229]/80 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[#57dffe] mb-2">
              <span className="material-symbols-outlined text-base">policy</span>
              <span className="text-xs font-bold text-white">Política de Integridade & Auditoria</span>
            </div>
            <p className="text-[11px] text-[#798fb1] mb-2.5 leading-relaxed">
              Cada acesso é criptografado e mapeado com carimbo de tempo inviolável. Operações com margem de desconto ou sangria de caixa requerem autenticação em dois fatores ou chave de gerente.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#798fb1]">
              <div className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded">
                <span className="material-symbols-outlined text-[#57dffe] text-sm">check_circle</span>
                <span className="text-[11px]">Logs Nuvem S3</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded">
                <span className="material-symbols-outlined text-[#57dffe] text-sm">check_circle</span>
                <span className="text-[11px]">TLS 1.3 / EAL4+</span>
              </div>
            </div>
          </div>

          {/* Bottom Hardware Telemetry Detail Card */}
          <div className="relative z-10 bg-black/20 border-t border-white/10 pt-3 flex items-center justify-between text-xs text-[#798fb1]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-sm">print</span>
              </div>
              <div>
                <p className="text-white font-semibold text-xs leading-none">Impressora Não-Fiscal 80mm</p>
                <p className="text-[10px] font-mono mt-0.5">Epson TM-T20X (Pronta)</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-bold text-white uppercase">Operante</span>
            </div>
          </div>
        </section>

        {/* RIGHT AUTHENTICATION & RBAC CONTROLLER (7 Columns) */}
        <section className="col-span-12 lg:col-span-7 bg-white rounded-xl border border-[#c4c6ce]/40 p-6 lg:p-7 flex flex-col justify-between shadow-xs">
          <div>
            {/* Top Screen Title */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#c4c6ce]/30">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-[#dee8ff] text-[#001229] font-mono text-[10px] font-bold">
                    SEGURANÇA CORPORATIVA
                  </span>
                  <span className="text-[11px] text-[#44474d]">• Terminal Físico Verificado</span>
                </div>
                <h2 className="text-[18px] font-extrabold text-[#001229] tracking-tight">
                  Acesso ao Sistema Comercial MarquesColor Pro v4.8
                </h2>
                <p className="text-xs text-[#44474d]">
                  Autenticação de operador com perfil de permissões e restrições
                </p>
              </div>

              <button
                type="button"
                onClick={() => alert('Atalhos de Acesso:\n[Enter] Confirmar credenciais\n[F1] Ajuda')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0f3ff] hover:bg-[#dee8ff] text-[#001229] border border-[#c4c6ce]/50 text-xs font-semibold cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-[#00687a]">help_outline</span>
                <span>F1 Ajuda</span>
              </button>
            </div>

            {/* RBAC ROLE SELECTOR (Interactive Tabs Grid) */}
            <div className="mb-5">
              <label className="block text-[11px] uppercase tracking-wider text-[#74777e] font-bold mb-2">
                Selecione a Função / Escopo de Acesso (RBAC)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {RBAC_ROLES.map((role) => {
                  const isSelected = selectedRoleId === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleRoleChange(role.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-all flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'border-[#001229] bg-[#f0f3ff] shadow-xs'
                          : 'border-[#c4c6ce]/40 hover:border-[#74777e] bg-white'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[#001229] text-white' : 'bg-[#f0f3ff] text-[#001229]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">{role.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#001229]">{role.title}</span>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-[#00687a]"></span>}
                        </div>
                        <p className="text-[11px] text-[#44474d] mt-0.5 leading-snug line-clamp-2">
                          {role.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LOGIN FORM & CREDENTIALS */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs text-[#001229] font-bold mb-1">
                    Matrícula ou E-mail Corporativo
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
                      <span className="material-symbols-outlined text-lg">badge</span>
                    </span>
                    <input
                      type="text"
                      value={userLogin}
                      onChange={(e) => setUserLogin(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 border border-[#c4c6ce] rounded-lg bg-white text-[#001229] text-xs font-medium focus:ring-2 focus:ring-[#00687a] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-[#001229] font-bold">
                      Senha de Acesso / PIN
                    </label>
                    <button
                      type="button"
                      onClick={() => alert('Procedimento de recuperação de senha enviado ao e-mail do gerente.')}
                      className="text-[11px] text-[#00687a] hover:underline cursor-pointer"
                    >
                      Esqueci a senha
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
                      <span className="material-symbols-outlined text-lg">lock</span>
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-9 pr-9 py-2 border border-[#c4c6ce] rounded-lg bg-white text-[#001229] text-xs font-mono focus:ring-2 focus:ring-[#00687a] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#74777e] hover:text-[#001229] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs text-[#001229] font-bold mb-1">
                    Turno de Caixa
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
                      <span className="material-symbols-outlined text-lg">schedule</span>
                    </span>
                    <select
                      value={shift}
                      onChange={(e) => setShift(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 border border-[#c4c6ce] rounded-lg bg-white text-[#001229] text-xs cursor-pointer focus:ring-2 focus:ring-[#00687a] outline-none"
                    >
                      <option>Turno 1 - Manhã/Tarde (08h às 17h)</option>
                      <option>Turno 2 - Tarde/Noite (13h às 21h)</option>
                      <option>Turno Especial - Fechamento de Estoque</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#001229] font-bold mb-1">
                    Terminal de Operação / Hardware
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#74777e]">
                      <span className="material-symbols-outlined text-lg">desktop_windows</span>
                    </span>
                    <select
                      value={terminal}
                      onChange={(e) => setTerminal(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 border border-[#c4c6ce] rounded-lg bg-white text-[#001229] text-xs cursor-pointer focus:ring-2 focus:ring-[#00687a] outline-none"
                    >
                      <option>Terminal Balcão 01 - Tintométrica A</option>
                      <option>Terminal Caixa 02 - PDV Rápido</option>
                      <option>Retaguarda Administrativa / Escritório</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Cluster: Main Enter Button & Biometrics Reader */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#001229] hover:bg-[#0f2744] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[#57dffe] text-base">login</span>
                  <span>Entrar no Sistema</span>
                  <span className="px-1.5 py-0.2 rounded bg-white/20 font-mono text-[10px] text-white">
                    [Enter]
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleBiometrics}
                  className="py-2.5 px-4 rounded-lg border border-[#c4c6ce] hover:border-[#00687a] bg-[#f0f3ff] text-[#001229] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[#00687a] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                    fingerprint
                  </span>
                  <span>Leitor de Crachá / Biometria</span>
                </button>
              </div>
            </form>
          </div>

          {/* AUDIT & ACTIVE PRIVILEGES MATRIX */}
          <div className="mt-5 pt-3.5 border-t border-[#c4c6ce]/40 bg-[#f0f3ff]/70 -mx-6 -mb-6 p-4 rounded-b-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#001229] text-sm">rule</span>
                <span className="text-[11px] font-bold text-[#001229] uppercase tracking-wide">
                  Matriz Ativa de Privilégios & Restrições do Perfil:
                </span>
                <span className="font-mono text-xs font-bold text-[#00687a] px-2 py-0.5 rounded bg-white border border-[#c4c6ce]/30">
                  {currentRole.badge}
                </span>
              </div>
              <span className="text-[10px] text-[#74777e]">Política Corporativa POL-POS-2023-B</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {currentRole.privileges.map((p, idx) => (
                <div key={idx} className="p-2.5 bg-white rounded-lg border border-[#c4c6ce]/60 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-[#001229] font-semibold mb-1">
                    <span className={`material-symbols-outlined text-base ${p.iconColor}`}>
                      {p.icon}
                    </span>
                    <span>{p.title}</span>
                  </div>
                  <p
                    className="text-[11px] text-[#44474d] font-mono leading-tight"
                    dangerouslySetInnerHTML={{ __html: p.desc }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* FOOTER AUDIT BAR */}
      <footer className="w-full bg-[#f0f3ff] px-6 py-2 border-t border-[#c4c6ce]/40 flex flex-wrap items-center justify-between text-xs text-[#44474d] mt-4 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#00687a] text-sm">verified_user</span>
            <span>Autenticação Criptografada AES-256</span>
          </div>
          <span>•</span>
          <div>Terminal ID: <span className="font-mono font-bold text-[#001229]">TERM-SPO-04A-POS</span></div>
          <span>•</span>
          <div>IP Local: <span className="font-mono font-bold text-[#001229]">192.168.10.42</span></div>
        </div>

        <div className="flex items-center gap-3">
          <span>Suporte Técnico MarquesColor:</span>
          <span className="font-mono font-bold text-[#001229]">0800 770 2040</span>
          <span className="px-2 py-0.5 rounded bg-[#dee8ff] text-[#001229] text-[10px] font-bold">
            Atendimento 24/7
          </span>
        </div>
      </footer>
    </div>
  );
};
