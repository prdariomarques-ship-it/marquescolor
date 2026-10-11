import { useAuth } from '../stores/auth';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, Package, Tag, FolderTree, UserCircle, Truck, Boxes, History, ShoppingCart, Receipt, Wallet, Settings, FileText, TrendingUp, ClipboardList, Banknote, DatabaseBackup } from 'lucide-react';

export function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const menuItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/pdv', label: 'PDV (F2)', icon: ShoppingCart, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/vendas', label: 'Vendas', icon: Receipt, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/caixa', label: 'Caixa', icon: Wallet, papeis: ['ADMIN', 'GERENTE', 'CAIXA'] },
    { to: '/produtos', label: 'Produtos', icon: Package, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/categorias', label: 'Categorias', icon: FolderTree, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/marcas', label: 'Marcas', icon: Tag, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/estoque', label: 'Estoque', icon: Boxes, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/estoque/movimentacoes', label: 'Movimentacoes', icon: History, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/compras', label: 'Compras', icon: ShoppingCart, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/orcamentos', label: 'Orcamentos', icon: ClipboardList, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/clientes', label: 'Clientes', icon: UserCircle, papeis: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA'] },
    { to: '/fornecedores', label: 'Fornecedores', icon: Truck, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/financeiro', label: 'Financeiro', icon: Banknote, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/relatorios', label: 'Relatorios', icon: TrendingUp, papeis: ['ADMIN', 'GERENTE'] },
    { to: '/usuarios', label: 'Usuarios', icon: Users, papeis: ['ADMIN'] },
    { to: '/backup', label: 'Backup', icon: DatabaseBackup, papeis: ['ADMIN'] },
    { to: '/config', label: 'Configuracoes', icon: Settings, papeis: ['ADMIN'] },
  ];

  return (
    <div className="min-h-screen bg-fundo flex flex-col">
      <header className="bg-azul text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 5 barrinhas coloridas de tinta */}
            <div className="flex gap-1">
              <div className="w-2 h-8 rounded-sm bg-amarelo" />
              <div className="w-2 h-8 rounded-sm bg-vermelho" />
              <div className="w-2 h-8 rounded-sm bg-verde" />
              <div className="w-2 h-8 rounded-sm bg-laranja" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Marquescollor Tintas</h1>
              <p className="text-xs text-blue-100">Sistema de Vendas</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">Ola, {usuario?.nome}</p>
              <p className="text-xs text-blue-100">{usuario?.papel}</p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 bg-vermelho hover:bg-red-700 px-3 py-2 rounded text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        <aside className="w-56 bg-white border-r p-4 hidden md:block">
          <nav className="space-y-1">
            {menuItems
              .filter(item => !item.papeis || item.papeis.includes(usuario?.papel || ''))
              .map(item => {
                const Icon = item.icon;
                const ativo = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      ativo ? 'bg-azul text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      <footer className="bg-gray-800 text-gray-300 px-4 py-2 text-xs text-center">
        Loja: Marquescollor Tintas - Ribeirao Pires/SP
      </footer>
    </div>
  );
}
