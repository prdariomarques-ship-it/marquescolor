import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalParaCentavos, multiplicarParaCentavos, parseDecimal } from '../src/modules/nfe/decimal.js';
import { validarChave, cnpjValido, calcularDvChave } from '../src/modules/nfe/chave.js';
import { lerNfeXml } from '../src/modules/nfe/xml-parser.js';
import { XmlInvalidoError } from '../src/modules/nfe/tipos.js';
import { montarXmlNfe, montarXmlEventoCancelamento, CNPJ_FORNECEDOR, CNPJ_LOJA } from './helpers/nfe-fixtures.js';

test('decimal: sem float, arredondamento half-up em centavos', () => {
  assert.equal(decimalParaCentavos('12.345'), 1235);
  assert.equal(decimalParaCentavos('12.344'), 1234);
  assert.equal(decimalParaCentavos('0.005'), 1);
  assert.equal(decimalParaCentavos('0.1'), 10);
  assert.equal(decimalParaCentavos('1,5'), null); // virgula nao e formato de NF-e
  assert.equal(decimalParaCentavos(''), null);
  assert.equal(decimalParaCentavos('abc'), null);
  // 10 casas de vUnCom x 4 casas de qCom
  assert.equal(multiplicarParaCentavos('3.0000', '12.3456789000'), 3704); // 37.0370367 -> 37.04
  assert.equal(multiplicarParaCentavos('0.3333', '3.0000000000'), 100); // 0.9999 -> 1.00
  assert.deepEqual(parseDecimal('10.50'), { negativo: false, unscaled: 1050n, escala: 2 });
});

test('chave: DV modulo 11, coerencia com CNPJ/serie/numero', () => {
  const { chave } = montarXmlNfe({ numero: 321, serie: 2 });
  const ok = validarChave(chave, { cnpjEmitente: CNPJ_FORNECEDOR, modelo: '55', serie: '2', numero: '321', cUF: '35' });
  assert.equal(ok.valida, true);
  const errada = chave.slice(0, 43) + String((Number(chave[43]) + 1) % 10);
  assert.equal(validarChave(errada).dvValido, false);
  assert.equal(validarChave('123').formatoValido, false);
  const incoerente = validarChave(chave, { cnpjEmitente: '45997418000153' });
  assert.equal(incoerente.valida, false);
  assert.match(incoerente.incoerencias.join(' '), /CNPJ/);
  assert.equal(calcularDvChave(chave.slice(0, 43)), Number(chave[43]));
  assert.equal(cnpjValido(CNPJ_FORNECEDOR), true);
  assert.equal(cnpjValido(CNPJ_LOJA), true);
  assert.equal(cnpjValido('11222333000182'), false);
});

test('XML valido: preserva zeros a esquerda, chave de 44 digitos e precisao decimal', () => {
  const { xml, chave } = montarXmlNfe({
    numero: 55,
    itens: [
      { codigo: '000123', descricao: 'RESINA & SOLVENTE <X>', ncm: '32091010', cest: '1000100', cfop: '5102', quantidade: '3.0000', valorUnitario: '12.3456789000', gtin: '7891234567895', csosn: '102' },
      { codigo: '7', quantidade: '2.0000', valorUnitario: '5.0000000000', cst: '00', icms: '1.80' },
    ],
    duplicatas: [{ n: '001', venc: '2026-11-20', v: '47.04' }],
  });
  const r = lerNfeXml(Buffer.from(xml));
  assert.equal(r.tipo, 'NFE');
  const n = r.nfe!;
  assert.equal(n.chaveAcesso, chave);
  assert.equal(n.chaveAcesso!.length, 44);
  assert.equal(n.itens.length, 2);
  assert.equal(n.itens[0].codigoFornecedor, '000123'); // zeros preservados
  assert.equal(n.itens[0].descricao, 'RESINA & SOLVENTE <X>'); // entidades decodificadas
  assert.equal(n.itens[0].valorUnitarioOriginal, '12.3456789000'); // 10 casas preservadas
  assert.equal(n.itens[0].quantidadeOriginal, '3.0000');
  assert.equal(n.itens[0].valorTotalCentavos, 3704);
  assert.equal(n.itens[0].gtin, '7891234567895');
  assert.equal(n.itens[0].cest, '1000100');
  assert.equal(n.itens[0].csosn, '102');
  assert.equal(n.itens[1].cst, '00');
  assert.equal(n.itens[1].icmsCentavos, 180);
  assert.equal(n.itens[1].gtin, null); // SEM GTIN nao vira GTIN
  assert.equal(n.emitente.cnpj, CNPJ_FORNECEDOR);
  assert.equal(n.destinatario.cnpj, CNPJ_LOJA);
  assert.equal(n.totais.notaCentavos, 3704 + 1000);
  assert.equal(n.duplicatas[0].vencimento, '2026-11-20');
  assert.equal(n.protocolo?.status, '100');
  assert.equal(n.origemCampos.chaveAcesso, 'XML:infNFe/@Id');
});

test('XML invalido: mal formado, DOCTYPE/XXE, nao-NFe, sem itens, item nao numerico', () => {
  const casos: [string, string][] = [
    ['<nfeProc><NFe><infNFe></NFe>', 'XML_MAL_FORMADO'],
    ['', 'XML_MAL_FORMADO'],
    ['<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "boom">]><nfeProc><NFe/></nfeProc>', 'XML_PERIGOSO'],
    ['<html><body/></html>', 'XML_NAO_NFE'],
    ['<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe1"></infNFe></NFe>', 'XML_SEM_ITENS'],
    ['<NFe><infNFe Id="NFe1"><det nItem="1"><prod><cProd>1</cProd><qCom>abc</qCom><vUnCom>1</vUnCom><vProd>1.00</vProd></prod></det></infNFe></NFe>', 'XML_ESTRUTURA'],
  ];
  for (const [xml, codigo] of casos) {
    assert.throws(() => lerNfeXml(Buffer.from(xml)), (e: unknown) => e instanceof XmlInvalidoError && e.codigo === codigo, `esperava ${codigo}`);
  }
});

test('XML: resumo (resNFe) e evento de cancelamento sao reconhecidos, nao tratados como NF-e completa', () => {
  const { chave } = montarXmlNfe({ numero: 9 });
  const res = lerNfeXml(Buffer.from(`<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>${chave}</chNFe></resNFe>`));
  assert.equal(res.tipo, 'RESUMO');
  assert.equal(res.chave, chave);
  const ev = lerNfeXml(Buffer.from(montarXmlEventoCancelamento(chave)));
  assert.equal(ev.tipo, 'EVENTO');
  assert.equal(ev.chave, chave);
  assert.equal(ev.evento?.tipoEvento, '110111');
});
