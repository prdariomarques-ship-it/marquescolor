import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children?: ReactNode;
  papel?: string;
}

export function ProtectedRoute({ children, papel }: ProtectedRouteProps) {
  const { usuario, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fundo">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Se deve trocar senha e nao esta na pagina de troca, redireciona
  if (usuario.deveTrocarSenha && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }

  // Se exige papel especifico
  if (papel && usuario.papel !== papel && usuario.papel !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fundo p-6">
        <div className="max-w-md bg-white rounded-lg shadow p-6 text-center">
          <h1 className="text-xl font-bold text-vermelho mb-2">Acesso negado</h1>
          <p className="text-gray-600">
            Seu perfil ({usuario.papel}) nao tem permissao para acessar esta pagina.
          </p>
          <a href="/" className="inline-block mt-4 bg-azul text-white px-4 py-2 rounded">
            Voltar ao Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Se tem children (uso direto como wrapper), renderiza children;
  // senao (uso como layout route), renderiza <Outlet />
  return <>{children ?? <Outlet />}</>;
}
