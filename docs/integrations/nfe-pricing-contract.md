# Contrato NF-e → módulo de custo de aquisição / motor de preços

**Versão do contrato:** `nfe-pricing-contract/v1` · **Escopo:** este documento descreve o que o módulo de NF-e **entrega**. Ele **não** define fórmula de custo, markup, margem ou regra tributária (isso pertence ao módulo de custo/motor de preços). O motor de preços (`motor-precos.ts`, commits `390252a`/`c73a88f`) **não existe** na cópia local verificada; portanto este contrato foi escrito só a partir do que a Fase 5 produz e **não foi validado contra o motor real**.

## 1. Princípio

O módulo de NF-e termina em **extração, identificação e preparação de dados**. Ele nunca:

- grava `Produto.precoCustoCentavos`, `precoVendaCentavos` ou `margemPercentual`;
- calcula custo de aquisição (rateio de frete/desconto/impostos);
- aprova preço.

Ele só marca, para quem consome: *esta NF-e foi aprovada por um humano, estes são os itens/valores originais, este é o estágio físico/estoque*.

## 2. Quando os dados existem

`GET /api/nfe/documentos/:id/dados-custo` (papel ADMIN/GERENTE) responde **409** até que `statusCompra = APROVADA` (aprovação humana). Antes disso não há dados "confiáveis" para custo.

| Estágio (campo) | Significado | Quem define |
|---|---|---|
| `statusDocumento` | documento interpretado | pipeline |
| `statusConferencia` | pendente → em revisão → conferida / rejeitada | pipeline + humano |
| `statusCompra` | não preparada → preparada → **aprovada** | humano (aprovar) |
| `recebimentoFisicoEm` | mercadoria **recebida fisicamente** | humano |
| `statusEstoque` | estoque **atualizado** (`APLICADO`) | módulo NF-e, só após os dois acima |
| custo atualizado / preço aprovado | **fora deste módulo** | módulo de custo / motor |

`estagios.custoAtualizadoPorEsteModulo` e `estagios.precoAprovadoPorEsteModulo` são **sempre `false`**.

Recomendação ao consumidor: só calcular custo definitivo quando `estagios.recebimentoFisicoConfirmado = true` (a quantidade recebida pode divergir da NF) ou, se for calcular antes, tratar como *provisório*.

## 3. Payload (gerado de `dadosParaCusto` em `servico.ts`)

```jsonc
{
  "contrato": "nfe-pricing-contract/v1",
  "documento": {
    "id": "cuid", "chaveAcesso": "44 dígitos | null", "numero": "1001", "serie": "1",
    "dataEmissao": "2026-10-20T13:00:00.000Z",
    "fonteDados": "XML",                 // XML | PDF_TEXTO | OCR | MULTIMODAL
    "fornecedorId": "cuid", "emitenteCnpj": "11222333000181",
    "emitenteCrt": "1",                  // regime do EMITENTE (1=Simples, 2=Simples excesso, 3=Normal) — texto do XML
    "emitenteUf": "SP",
    "aprovadoEm": "ISO", "aprovadoPorId": "cuid"
  },
  "estagios": {
    "aprovada": true, "recebimentoFisicoConfirmado": false, "estoqueAtualizado": false,
    "custoAtualizadoPorEsteModulo": false, "precoAprovadoPorEsteModulo": false
  },
  "totaisDocumento": {                   // centavos (Int), exatamente como na NF
    "produtosCentavos": 12500, "freteCentavos": 0, "seguroCentavos": 0, "descontoCentavos": 0, "outrasCentavos": 0,
    "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 0, "pisCentavos": 0, "cofinsCentavos": 0, "notaCentavos": 12500
  },
  "itens": [{
    "itemNfeId": "cuid", "produtoId": "cuid", "codigoInterno": "P0001",
    "custoAtualProdutoCentavos": 1250,   // só leitura, para comparação; NÃO é alterado aqui
    "quantidadeNf": 10, "quantidadeRecebida": null,   // preenchida após recebimento físico
    "unidade": "UN", "unidadeTributavel": "UN",
    "quantidadeOriginal": "10.0000",     // TEXTO exato do XML
    "valorUnitarioOriginal": "12.5000000000", // TEXTO exato (até 10 casas)
    "valorTotalCentavos": 12500,         // vProd
    "freteCentavos": 0, "seguroCentavos": 0, "descontoCentavos": 0, "outrasCentavos": 0,   // nível do item
    "impostos": { "icmsCentavos": 0, "icmsStCentavos": 0, "ipiCentavos": 0, "pisCentavos": 0, "cofinsCentavos": 0 },
    "fiscal": { "ncm": "32091010", "cest": null, "cfop": "5102", "origem": "0", "cst": null, "csosn": "102" },
    "origemDados": "XML"
  }]
}
```

Notas de interpretação (não são cálculo):

- **Dinheiro em centavos inteiros; quantidade e unitário em texto original.** Para não perder precisão, o consumidor deve usar `valorTotalCentavos` (vProd) como valor fiscal do item, não `quantidade × unitário arredondado`.
- Só aparecem itens vinculados a produto (`MAPEADO`/`CONFIRMADO`). Itens dispensados por decisão humana ("não entra") ficam de fora.
- Frete/seguro/desconto/outras do **documento** (`totaisDocumento`) e do **item** são entregues separados; **o rateio não é feito aqui**.
- ICMS/ST/IPI/PIS/COFINS por item vêm do XML. Em fonte `PDF_TEXTO`/`OCR` esses valores ficam **zerados** (não são lidos) e os documentos nesse caso exigem revisão humana (`FONTE_NAO_XML`).
- `quantidadeNf` está na **unidade da NF**; quando a unidade da NF difere da do produto, `quantidadeRecebida` está na **unidade do produto** (exigência do recebimento). Ver risco 4.1.

## 4. Riscos que o consumidor (GLM / módulo de custo) precisa conhecer

### 4.1 Unidade da NF ≠ unidade do produto
Itens como "1 CX (6 UN)" geram o alerta `UNIDADE_DIVERGENTE`. O módulo de NF-e **recusa** `recebimentoIntegral` nesses itens e exige a quantidade recebida na unidade do produto + justificativa. O **fator de conversão de custo** (custo da caixa → custo da unidade) **não é tratado aqui** e deve ser decidido pelo módulo de custo.

### 4.2 Rota existente `/compras/:id/confirmar` e `POST /compras` (CONFIRMADA) sobrescrevem custo
No código verificado (`compras.routes.ts`), confirmar uma compra faz `produto.update({ estoqueAtual, precoCustoCentavos: it.precoCustoCentavos })` — ou seja, **sobrescreve o custo do produto pelo unitário da compra, sem aprovação de preço**. Por isso o módulo de NF-e:

- **não cria** `Compra` na aprovação (qualquer `Compra` em status ≠ `CONFIRMADA` poderia ser confirmada por essa rota, movendo estoque e custo, e depois a NF-e duplicaria o estoque);
- cria a `Compra` **já `CONFIRMADA` na mesma transação** que atualiza o estoque (`ItemCompra.precoCustoCentavos` = unitário da NF, **apenas informativo**; o `Produto.precoCustoCentavos` não é tocado).

Se o módulo de custo quiser atualizar custo, deve fazê-lo por mecanismo próprio e aprovado. **Recomendação ao GLM:** revisar `/compras/:id/confirmar` e `POST /compras`, que hoje atualizam custo automaticamente (contradiz "nenhuma atualização automática de preços").

### 4.3 Fontes não-XML
`fonteDados ≠ XML` significa leitura aproximada (texto de PDF / OCR / sugestão multimodal). Mesmo após revisão humana, o consumidor deve tratar `confianca` < 0.9 como *dado conferido manualmente*, não como dado fiscal confiável de máquina. Exemplo real observado: OCR leu CNPJ `11.222.888/0001-8` onde o correto era `11.222.333/0001-81`.

### 4.4 O que depende de informação real do contador (não decidido aqui)
Rateio de frete/seguro/outras despesas acessórias; tratamento de IPI/ICMS-ST na composição do custo; crédito de ICMS/PIS/COFINS (regime da **loja**, que este módulo não conhece; só o CRT do emitente é entregue); CFOPs que não representam compra para revenda (devolução, remessa, bonificação, demonstração); conversão de unidades de embalagem. Lista consolidada em `nfe-ingestion.md` §9.

## 5. Evolução do contrato

Mudanças compatíveis (campos novos) mantêm `v1`. Remoção/renomeação exige `v2` e aviso ao consumidor. Se o motor precisar de campo que não está aqui, **abrir pedido neste arquivo** (não alterar `servico.ts` sem coordenação). Nenhum campo de preço/custo calculado será adicionado a este payload.
