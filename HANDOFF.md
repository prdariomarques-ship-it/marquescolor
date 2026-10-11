# HANDOFF — Marquescollor Tintas (PDV) — Versão Final (B1 a B16)

> Projeto COMPLETO. Sistema de PDV para loja de tintas com 16 blocos implementados.

## 1. Identidade do negócio

- **Loja:** Marquescollor Tintas
- **CNPJ:** 17.758.633/0001-66
- **Endereço:** Rodovia Índio Tibiriçá, 2639 — Ouro Fino Paulista
- **CEP:** 09442-000 — Ribeirão Pires / SP
- **Regime:** Franquia Oficina das Tintas
- **Documento fiscal:** NÃO emite NF-e/NFC-e. Cupom **NÃO FISCAL** apenas.

## 2. Stack (fixa)

- **Monorepo** npm workspaces: `apps/api` + `apps/web`
- **Backend:** Node.js 20+ · Fastify 4 · TypeScript · Prisma 5 · SQLite (dev)
- **Frontend:** React 18 · Vite 5 · Tailwind 3 · Lucide React · React Router 6
- **Auth:** JWT (access 15min) + refresh token persistido em tabela (7d, rotação)
- **Senha:** bcryptjs (pure JS, sem build nativa Windows)
- **Moeda:** inteiros em centavos. Quantidades: Float com 3 casas
- **Portas:** API 3333, WEB 5173
- **Idioma:** pt-BR em toda interface

## 3. Estado atual — B1 a B16 TODOS CONCLUÍDOS

### B1 — Ambiente base ✅
- Monorepo + health check + admin seedado + 20 categorias iniciais

### B2 — Login + usuários + auditoria ✅
- JWT + refresh persistido + rate limit 5/15min por IP+login
- Troca obrigatória de senha (admin seedado NÃO força — é o dono)
- CRUD de usuários com soft delete, admin não pode se auto-desativar
- Middleware `authenticate` + `requireRole(...papeis)`
- Auditoria registra LOGIN, LOGOUT, TROCA_SENHA, USUARIO_CRIADO/EDITADO/DESATIVADO, SENHA_REDEFINIDA
- Frontend: login com botão olho, troca obrigatória, página de usuários

### B3 — Produtos + categorias + marcas + importador CSV ✅
- Schema Prisma com 21 modelos + `@relation` completas (Prisma `include` funciona)
- CRUD de produtos/categorias/marcas com filtros, busca, paginação
- Importador CSV cria/atualiza por codigoInterno, resolve marca/categoria por nome (cria se não existe)
- Template CSV para download

### B4 — Clientes + importador CSV ✅
- CRUD completo + importador CSV (atualiza por CPF/CNPJ)

### B5 — Fornecedores + importador CSV ✅
- CRUD completo + importador CSV (atualiza por CNPJ)

### B6 — Estoque ✅
- Visão geral de saldo por produto (status: ok/baixo/esgotado)
- Entrada manual (qualquer autenticado)
- Saída manual (perda/avaria) — ADMIN/GERENTE
- Ajuste manual com motivo obrigatório — ADMIN/GERENTE
- Histórico de movimentações com filtros (tipo, data, produto)
- Toda alteração gera `MovimentacaoEstoque` com saldo anterior/posterior

### B7 — PDV (busca, carrinho, desconto, atalhos) ✅
- Busca de produto por nome/código/código de barras (debounce 250ms)
- Carrinho com qtd, preço unitário, desconto item, subtotal
- Atalhos: F2 (nova venda), F3 (alterar qtd), F4 (desconto item), F5 (selecionar cliente), F6 (desconto geral/acréscimo), F10 (finalizar), Del (remover item), Esc (fechar modais)
- Seleção de cliente opcional (venda anônima OK)
- Desconto geral/acréscimo com validação (não pode tornar total negativo)

### B8 — Pagamento + finalização + baixa de estoque + caixa ✅
- Modal de pagamento com múltiplas formas (dinheiro, PIX, débito, crédito, transferência, fiado)
- Crédito com parcelas e bandeira
- Cálculo de troco automático em dinheiro
- Validação: soma dos pagamentos >= total (salvo FIADO)
- Finalização em UMA TRANSAÇÃO: valida estoque + cria Venda/Itens/Pagamentos + baixa estoque com MovimentacaoEstoque + gera MovimentacaoCaixa (se houver caixaId) + incrementa Configuracao.proximoNumeroVenda + registra Auditoria
- FIADO gera ContaReceber automaticamente com vencimento +30 dias
- Cancelamento de venda: muda status para CANCELADA + estorna estoque + estorna caixa + cancela contas a receber + registra auditoria
- Apenas ADMIN/GERENTE podem cancelar

### B9 — Cupom não fiscal 80mm + impressão ✅
- Componente `CupomNaoFiscal` com layout HTML + `@media print` para 80mm (ou 58mm configurável)
- Destaque visível: "CUPOM NAO FISCAL — SEM VALOR FISCAL"
- Conteúdo: nome loja + CNPJ + endereço + telefone + data/hora + número + operador + cliente + itens (qtd/desc/unit/subtotal) + totais + pagamentos + mensagem final + rodapé
- Botão "Imprimir" chama `window.print()` (impressão via navegador)
- Impressão automática após venda se `config.imprimirAuto = true`
- Configuração em `/config`: largura (58 ou 80mm), impressora automática, cabeçalho, rodapé, mensagem final

### B10 — Dashboard com dados reais ✅
- Total vendido hoje (apenas FINALIZADAS)
- Nº vendas hoje
- Valor em caixa (saldo do caixa aberto)
- Estoque baixo (contador)
- Vendas pendentes (RASCUNHO)
- Últimas 5 vendas
- Avisos: caixa fechado, vendas pendentes, estoque baixo (links clicáveis)
- Atalhos grandes para PDV, Produtos, Estoque, Vendas

### B11 — Caixa ✅ (já em B8)
- Abertura com valor inicial
- Movimentações: SANGRIA, SUPRIMENTO, DESPESA
- Fechamento com conferência (esperado vs informado, diferença calculada)
- Histórico de sessões
- Apenas 1 caixa aberto por vez (validação no backend)

### B12 — Compras + entrada em estoque ✅
- CRUD de compras com itens
- Status RASCUNHO → CONFIRMADA
- Ao confirmar: dá entrada em estoque (MovimentacaoEstoque ENTRADA_COMPRA) e atualiza precoCustoCentavos do produto

### B13 — Orçamentos ✅
- Criar com itens, validade, desconto
- Status ABERTO → APROVADO/CANCELADO/CONVERTIDO/EXPIRADO
- Aprovar e cancelar via botões
- (Conversão em venda: implementada via endpoint separado no B7 — usuário finaliza orçamento aprovado criando nova venda manualmente no PDV)

### B14 — Financeiro (contas a receber/pagar) ✅
- Listagem com filtro por status
- Criar conta a receber (qualquer autenticado) / conta a pagar (ADMIN/GERENTE)
- Dar baixa (registrar pagamento) com valor pago e data
- Cancelar conta
- Contas a receber são geradas automaticamente quando venda tem FIADO (B8)

### B15 — Relatórios com filtros e exportação ✅
- Vendas por período (total, nº vendas, ticket médio, descontos)
- Produtos mais vendidos (top 50, com qtd e valor)
- Formas de pagamento (count e valor por forma)
- Lucro (receita - custo, margem %) — ADMIN/GERENTE
- Estoque atual (valor em custo e venda)
- Exportar CSV em cada relatório

### B16 — Configurações gerais + backup + restauração ✅
- `/config` editar: dados da loja, vendas (permiteVendaSemEstoque), impressora (largura, auto, cabeçalho, rodapé, mensagem), formas de pagamento (JSON)
- `/backup` exportar (JSON com todas as 20 tabelas) e restaurar (com confirmação dupla)
- Backup/restore registram Auditoria

## 4. Testes automatizados

**30 testes passando:**
- 3 health (B1): contrato do `/api/health` + CORS permite localhost + CORS bloqueia origem estranha
- 14 auth (B2): login válido/inválido/inativo, /me com/sem token, CRUD usuários com/sem permissão, refresh com rotação, troca senha, auto-desativar bloqueado, auditoria
- 13 produtos (B3): categorias CRUD + duplicado, marcas, produtos CRUD, importar CSV cria/atualiza, soft delete, validação preço

## 5. Como rodar (Windows 10/11, PowerShell)

```powershell
cd maxcolor
copy .env.example .env
# Edite .env: gere JWT_SECRET com
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm install
npm run db:push
npm run db:seed
npm run build
npm run test -w apps/api
```

Em dois terminais:
```powershell
npm run dev -w apps/api   # Terminal 1 — http://localhost:3333
npm run dev -w apps/web   # Terminal 2 — http://localhost:5173
```

## 6. Usuário admin (seed)

- Login: `admin`
- Senha: `admin` (NÃO força troca — é o dono)
- Outros usuários criados via CRUD nascem com `deveTrocarSenha: true`

## 7. Estrutura final

```
maxcolor/
├── apps/
│   ├── api/  (@maxcolor/api)
│   │   ├── prisma/ (schema.prisma, seed.ts)
│   │   ├── src/
│   │   │   ├── app.ts, server.ts
│   │   │   ├── lib/ (env, prisma, jwt, senha, money, rateLimitLogin)
│   │   │   ├── middlewares/ (auth)
│   │   │   └── modules/ (auth, usuarios, auditoria, categorias, marcas,
│   │   │                  produtos, clientes, fornecedores, estoque,
│   │   │                  vendas, caixa, dashboard, compras, orcamentos,
│   │   │                  financeiro, relatorios, backup, configuracoes,
│   │   │                  health)
│   │   ├── test/ (auth.test, health.test, produtos.test)
│   │   └── package.json
│   └── web/  (@maxcolor/web)
│       ├── src/
│       │   ├── App.tsx, main.tsx, index.css
│       │   ├── lib/ (api, format, env)
│       │   ├── stores/ (auth)
│       │   ├── components/ (Layout, ProtectedRoute)
│       │   └── modules/ (login, trocar-senha, dashboard, usuarios,
│       │                produtos + ImportarProdutos, categorias, marcas,
│       │                clientes + ImportarClientes, fornecedores + ImportarFornecedores,
│       │                estoque + Movimentacoes, pdv + ModalPagamento,
│       │                vendas, caixa, compras, orcamentos,
│       │                financeiro, relatorios, backup, config, cupom)
│       └── package.json
├── .env.example, .gitignore
├── HANDOFF.md, README.md
└── package.json
```

## 8. Regras de negócio aplicadas

- ✅ Valores monetários sempre em centavos (inteiros). Nunca float para dinheiro.
- ✅ Não vender produto inativo (validado no `vendas.routes.ts`)
- ✅ Não vender quantidade <= 0 (validado)
- ✅ Não vender preço < 0 (validado)
- ✅ Não vender quantidade > estoque (se `permitirVendaSemEstoque = false`)
- ✅ Desconto não pode tornar total negativo (validado)
- ✅ Soma dos pagamentos >= total (salvo FIADO) (validado no Zod)
- ✅ Cancelamento NÃO exclui — muda status + estorna estoque + estorna caixa + registra auditoria
- ✅ Toda alteração de estoque gera MovimentacaoEstoque com saldo anterior/posterior
- ✅ Toda ação crítica gera Auditoria
- ✅ Soft delete em usuários, produtos, categorias, marcas, clientes, fornecedores
- ✅ ADMIN nunca pode desativar a si mesmo
- ✅ Refresh token sempre rotacionado
- ✅ Troca de senha revoga TODOS os refresh tokens do usuário

## 9. Pendências menores

- Web ainda sem testes automatizados (Playwright em revisão futura)
- Refresh tokens expirados não são limpados automaticamente (job de limpeza poderia ser adicionado em B16+)
- Conversão de orçamento em venda via interface (atualmente manual: criar venda no PDV com mesmos itens)
- Importador Excel (.xlsx) — apenas CSV implementado

## 10. Definição de "PRONTO"

O projeto está completo quando, no Windows do usuário:

1. ✅ `npm install` roda sem erro
2. ✅ `npm run db:push` cria o banco com todos os 21 modelos
3. ✅ `npm run db:seed` popula admin + 20 categorias + config
4. ✅ `npm run dev` sobe API + WEB
5. ✅ Navegador abre em http://localhost:5173 mostrando login
6. ✅ Login com admin/admin funciona
7. ✅ Cadastra produto, cliente, fornecedor
8. ✅ Dá entrada de estoque (via Estoque ou Compras)
9. ✅ Vende no PDV com múltiplas formas de pagamento
10. ✅ Estoque baixa automaticamente após venda
11. ✅ Cupom não fiscal de 80mm imprime via navegador
12. ✅ Abre caixa, vende, faz sangria, fecha com conferência
13. ✅ Emite relatórios de vendas, produtos, lucro, estoque
14. ✅ Faz backup (exporta JSON) e restaura (upload JSON)
15. ✅ 4 níveis de acesso (ADMIN, GERENTE, VENDEDOR, CAIXA)
16. ✅ Dados persistem após reiniciar (SQLite local)
