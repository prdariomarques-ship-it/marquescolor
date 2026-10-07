from decimal import Decimal

import pytest

from app.nfe_parser import NfeParseError, parse_nfe_xml

_SAMPLE_NFE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe35240512345678000199550010000012345123456789" versao="4.00">
    <ide>
      <cUF>35</cUF>
      <nNF>12345</nNF>
      <serie>1</serie>
      <dhEmi>2024-10-01T09:30:00-03:00</dhEmi>
    </ide>
    <emit>
      <CNPJ>12345678000199</CNPJ>
      <xNome>Tintas Suvinil Distribuidora S.A.</xNome>
    </emit>
    <dest>
      <CNPJ>98765432000111</CNPJ>
    </dest>
    <det nItem="1">
      <prod>
        <cProd>SUV-18L-BR</cProd>
        <xProd>Tinta Acrílica Fosca Branca 18L</xProd>
        <NCM>32091090</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>10.0000</qCom>
        <vUnCom>95.5000</vUnCom>
        <vProd>955.00</vProd>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>SUV-ESM-36</cProd>
        <xProd>Esmalte Sintético Brilhante 3.6L</xProd>
        <NCM>32081090</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>6.0000</qCom>
        <vUnCom>58.0000</vUnCom>
        <vProd>348.00</vProd>
      </prod>
    </det>
    <total>
      <ICMSTot>
        <vICMS>120.50</vICMS>
        <vFrete>45.00</vFrete>
        <vNF>1348.00</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>
"""


def test_parses_header_fields():
    parsed = parse_nfe_xml(_SAMPLE_NFE_XML.encode("utf-8"))
    assert parsed.chave_acesso == "35240512345678000199550010000012345123456789"
    assert parsed.numero == "12345"
    assert parsed.serie == "1"
    assert parsed.emitente_cnpj == "12345678000199"
    assert parsed.emitente_nome == "Tintas Suvinil Distribuidora S.A."
    assert parsed.destinatario_cnpj == "98765432000111"
    assert parsed.valor_total == Decimal("1348.00")
    assert parsed.valor_frete == Decimal("45.00")


def test_parses_all_items():
    parsed = parse_nfe_xml(_SAMPLE_NFE_XML.encode("utf-8"))
    assert len(parsed.items) == 2
    first = parsed.items[0]
    assert first.supplier_sku == "SUV-18L-BR"
    assert first.description == "Tinta Acrílica Fosca Branca 18L"
    assert first.quantity == Decimal("10.0000")
    assert first.unit_cost == Decimal("95.5000")
    assert first.total_cost == Decimal("955.00")


def test_tolerates_nfeproc_wrapper():
    wrapped = (
        '<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">'
        + _SAMPLE_NFE_XML.split("?>", 1)[1]
        + "<protNFe><infProt><chNFe>35240512345678000199550010000012345123456789</chNFe></infProt></protNFe>"
        + "</nfeProc>"
    )
    parsed = parse_nfe_xml(wrapped.encode("utf-8"))
    assert parsed.numero == "12345"
    assert len(parsed.items) == 2


def test_malformed_xml_raises_nfe_parse_error():
    with pytest.raises(NfeParseError):
        parse_nfe_xml(b"<not valid xml")


def test_wrong_root_element_raises_nfe_parse_error():
    with pytest.raises(NfeParseError):
        parse_nfe_xml(b"<somethingElse><a>1</a></somethingElse>")


def test_no_items_raises_nfe_parse_error():
    no_items = """<?xml version="1.0"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35240512345678000199550010000012345123456789">
        <ide><nNF>1</nNF><serie>1</serie></ide>
        <emit><CNPJ>12345678000199</CNPJ><xNome>X</xNome></emit>
      </infNFe>
    </NFe>
    """
    with pytest.raises(NfeParseError):
        parse_nfe_xml(no_items.encode("utf-8"))
