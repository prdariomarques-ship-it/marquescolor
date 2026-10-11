import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { env } from '../src/lib/env';

const prisma = new PrismaClient();

async function main() {
  console.log('Semeando banco de dados...');

  // Usuario admin — senha 'admin', NAO forca troca (e o dono)
  const senhaHash = await bcrypt.hash('admin', 10);
  await prisma.usuario.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      nome: 'Administrador',
      login: 'admin',
      senhaHash,
      papel: 'ADMIN',
      deveTrocarSenha: false, // dono do sistema
    },
  });
  console.log('Usuario admin criado (login: admin / senha: admin)');

  // Configuracao unica da loja
  await prisma.configuracao.upsert({
    where: { id: 'unica' },
    update: {},
    create: {
      id: 'unica',
      nomeLoja: env.LOJA_NOME,
      cnpj: env.LOJA_CNPJ || null,
      endereco: env.LOJA_ENDERECO || null,
      proximoNumeroVenda: 1,
      permitirVendaSemEstoque: true,
      larguraCupomMm: 80,
      imprimirAuto: false,
      cabecalhoCupom: env.LOJA_NOME,
      rodapeCupom: 'CUPOM NAO FISCAL - SEM VALOR FISCAL',
      mensagemFinal: 'Obrigado pela preferencia!',
      formasPagamentoAtivas: JSON.stringify([
        'DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'FIADO',
      ]),
    },
  });
  console.log('Configuracao criada:', env.LOJA_NOME);

  // 20 categorias iniciais de loja de tintas
  const categorias = [
    'Tinta Acrilica', 'Tinta Latex', 'Tinta Esmalte', 'Tinta Automotiva',
    'Massa Corrida', 'Textura', 'Selador', 'Fundo Preparador',
    'Impermeabilizante', 'Verniz', 'Solvente', 'Aguarras',
    'Lixa', 'Rolo', 'Pincel', 'Bandeja',
    'Fita', 'Espatula', 'Ferramentas', 'Materiais Diversos',
  ];
  for (const nome of categorias) {
    await prisma.categoria.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }
  console.log(`${categorias.length} categorias criadas`);

  console.log('Seed concluido.');
}

main()
  .catch((e) => { console.error('Erro no seed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
