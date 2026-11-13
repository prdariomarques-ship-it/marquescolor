import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarArquivoXlsx } from '../../web/src/lib/contabilExport.ts';
import { criarBackupComprimido, lerEValidarBackup } from '../../web/src/lib/backupService.ts';

test('XLSX gerado é um pacote ZIP com as três planilhas do relatório', async () => {
  const arquivo = gerarArquivoXlsx([
    { name: '1_Vendas_Periodo', rows: [['Venda', 'Total'], [101, 250.5]] },
    { name: '2_Itens_Detalhados', rows: [['Produto', 'Qtd'], ['Tinta acrílica', 2]] },
    { name: '3_Conciliacao', rows: [['Forma', 'Total'], ['PIX', 250.5]] },
  ]);

  assert.equal(arquivo.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50, 'deve iniciar com a assinatura ZIP local');
  const conteudo = bytes.toString('utf8');
  assert.match(conteudo, /xl\/workbook\.xml/);
  assert.match(conteudo, /1_Vendas_Periodo/);
  assert.match(conteudo, /2_Itens_Detalhados/);
  assert.match(conteudo, /3_Conciliacao/);
});

test('backup GZIP pode ser descomprimido e validado pelo SHA-256', async () => {
  const origem = {
    format: 'MARQUESCOLOR_BACKUP',
    version: 1,
    data: {
      vendas: [{ id: 'venda-1', totalCentavos: 12345 }],
      metaMensal: [{ competencia: '2026-11', valorMetaCentavos: 6500000 }],
    },
  };
  const arquivo = await criarBackupComprimido(origem);
  assert.equal(arquivo.compression, 'gzip');
  assert.ok(arquivo.compressedSize > 0);

  const restaurado = await lerEValidarBackup(arquivo.blob, arquivo.filename);
  assert.deepEqual(restaurado.data, origem.data);
  assert.equal(restaurado.checksumAlgo, 'SHA-256');
});
