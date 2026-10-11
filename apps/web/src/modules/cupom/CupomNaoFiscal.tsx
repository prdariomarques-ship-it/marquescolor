import { formatarCentavos, formatarDataHora } from '../../lib/format';

interface CupomProps {
  venda: any;
  config: any;
}

export function CupomNaoFiscal({ venda, config }: CupomProps) {
  const largura = config?.larguraCupomMm === 58 ? '58mm' : '80mm';
  const nomeLoja = config?.nomeLoja || 'Marquescollor Tintas';
  const cnpj = config?.cnpj || '';
  const endereco = config?.endereco || '';
  const telefone = config?.telefone || '';
  const cabecalho = config?.cabecalhoCupom || '';
  const rodape = config?.rodapeCupom || 'CUPOM NAO FISCAL - SEM VALOR FISCAL';
  const mensagemFinal = config?.mensagemFinal || 'Obrigado pela preferencia!';

  return (
    <div className="cupom-nao-fiscal" style={{ width: largura, fontFamily: 'monospace', fontSize: '11px', padding: '4px' }}>
      <style>{`
        @media print {
          @page { size: ${largura} auto; margin: 0; }
          body * { visibility: hidden; }
          .cupom-nao-fiscal, .cupom-nao-fiscal * { visibility: visible; }
          .cupom-nao-fiscal { position: absolute; left: 0; top: 0; }
          .no-print { display: none; }
        }
      `}</style>

      {/* Cabecalho */}
      <div className="text-center border-b border-dashed pb-1 mb-1">
        {cabecalho && <p className="font-bold">{cabecalho}</p>}
        <p className="font-bold uppercase">{nomeLoja}</p>
        {cnpj && <p>CNPJ: {cnpj}</p>}
        {endereco && <p className="text-xs">{endereco}</p>}
        {telefone && <p>Tel: {telefone}</p>}
      </div>

      {/* Destaque NAO FISCAL */}
      <div className="text-center border border-dashed my-1 py-1">
        <p className="font-bold">CUPOM NAO FISCAL</p>
        <p className="text-xs">SEM VALOR FISCAL</p>
      </div>

      {/* Dados da venda */}
      <div className="text-xs mb-1">
        <p>{formatarDataHora(venda.criadoEm)}</p>
        <p>Cupom: #{venda.numero}</p>
        {venda.cliente && <p>Cliente: {venda.cliente.nome}</p>}
        {venda.cliente?.cpfCnpj && <p>CPF/CNPJ: {venda.cliente.cpfCnpj}</p>}
      </div>

      <div className="border-t border-dashed my-1" />

      {/* Itens */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-dashed">
            <th className="text-left">Item</th>
            <th className="text-right">Qtd</th>
            <th className="text-right">Unit</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {venda.itens?.map((it: any) => (
            <tr key={it.id}>
              <td colSpan={4} className="pt-1">{it.nomeProdutoSnapshot}</td>
            </tr>
          ))}
          {venda.itens?.map((it: any) => (
            <tr key={it.id + '_qtd'}>
              <td className="text-left">{it.codigoSnapshot}</td>
              <td className="text-right">{it.quantidade}</td>
              <td className="text-right">{formatarCentavos(it.precoUnitarioCentavos)}</td>
              <td className="text-right">{formatarCentavos(it.subtotalCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed my-1" />

      {/* Totais */}
      <div className="text-xs space-y-0">
        <div className="flex justify-between"><span>Subtotal:</span><span>{formatarCentavos(venda.subtotalCentavos)}</span></div>
        {venda.descontoCentavos > 0 && (
          <div className="flex justify-between"><span>Desconto:</span><span>-{formatarCentavos(venda.descontoCentavos)}</span></div>
        )}
        {venda.acrescimoCentavos > 0 && (
          <div className="flex justify-between"><span>Acrescimo:</span><span>+{formatarCentavos(venda.acrescimoCentavos)}</span></div>
        )}
        <div className="flex justify-between font-bold border-t border-dashed mt-1 pt-1">
          <span>TOTAL:</span><span>{formatarCentavos(venda.totalCentavos)}</span>
        </div>
      </div>

      <div className="border-t border-dashed my-1" />

      {/* Pagamentos */}
      <div className="text-xs">
        <p className="font-bold">Pagamentos:</p>
        {venda.pagamentos?.map((p: any) => (
          <div key={p.id} className="flex justify-between">
            <span>{p.forma} {p.parcelas > 1 ? `(${p.parcelas}x)` : ''}</span>
            <span>{formatarCentavos(p.valorCentavos)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed my-1" />

      {/* Mensagem final */}
      <p className="text-center text-xs font-bold mt-2">{mensagemFinal}</p>
      <p className="text-center text-xs mt-1">{rodape}</p>

      {/* Botoes */}
      <div className="no-print text-center mt-4">
        <button
          onClick={() => window.print()}
          className="bg-azul hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
}
