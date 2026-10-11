import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './stores/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Login from './modules/login/Login';
import TrocarSenha from './modules/trocar-senha/TrocarSenha';
import Dashboard from './modules/dashboard/Dashboard';
import Usuarios from './modules/usuarios/Usuarios';
import Produtos from './modules/produtos/Produtos';
import ImportarProdutos from './modules/produtos/ImportarProdutos';
import Categorias from './modules/categorias/Categorias';
import Marcas from './modules/marcas/Marcas';
import Clientes from './modules/clientes/Clientes';
import ImportarClientes from './modules/clientes/ImportarClientes';
import Fornecedores from './modules/fornecedores/Fornecedores';
import ImportarFornecedores from './modules/fornecedores/ImportarFornecedores';
import Estoque from './modules/estoque/Estoque';
import Movimentacoes from './modules/estoque/Movimentacoes';
import PDV from './modules/pdv/PDV';
import Vendas from './modules/vendas/Vendas';
import Caixa from './modules/caixa/Caixa';
import Configuracoes from './modules/config/Configuracoes';
import Compras from './modules/compras/Compras';
import Orcamentos from './modules/orcamentos/Orcamentos';
import Financeiro from './modules/financeiro/Financeiro';
import Relatorios from './modules/relatorios/Relatorios';
import Backup from './modules/backup/Backup';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/trocar-senha" element={<TrocarSenha />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/produtos/importar" element={
                <ProtectedRoute papel="ADMIN"><ImportarProdutos /></ProtectedRoute>
              } />
              <Route path="/categorias" element={
                <ProtectedRoute papel="ADMIN"><Categorias /></ProtectedRoute>
              } />
              <Route path="/marcas" element={
                <ProtectedRoute papel="ADMIN"><Marcas /></ProtectedRoute>
              } />
              <Route path="/usuarios" element={
                <ProtectedRoute papel="ADMIN"><Usuarios /></ProtectedRoute>
              } />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/importar" element={
                <ProtectedRoute papel="ADMIN"><ImportarClientes /></ProtectedRoute>
              } />
              <Route path="/fornecedores" element={
                <ProtectedRoute papel="ADMIN"><Fornecedores /></ProtectedRoute>
              } />
              <Route path="/fornecedores/importar" element={
                <ProtectedRoute papel="ADMIN"><ImportarFornecedores /></ProtectedRoute>
              } />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/estoque/movimentacoes" element={<Movimentacoes />} />
              <Route path="/pdv" element={<PDV />} />
              <Route path="/vendas" element={<Vendas />} />
              <Route path="/caixa" element={<Caixa />} />
              <Route path="/compras" element={
                <ProtectedRoute papel="ADMIN"><Compras /></ProtectedRoute>
              } />
              <Route path="/orcamentos" element={<Orcamentos />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/backup" element={
                <ProtectedRoute papel="ADMIN"><Backup /></ProtectedRoute>
              } />
              <Route path="/config" element={
                <ProtectedRoute papel="ADMIN"><Configuracoes /></ProtectedRoute>
              } />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
