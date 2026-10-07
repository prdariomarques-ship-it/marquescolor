"""Parses a Brazilian NF-e (nota fiscal eletrônica) XML — the structured
data source this whole pipeline is built around. A supplier's NF-e email
almost always carries this XML as an attachment (it's the legally
authoritative document; the PDF DANFE is a human-readable rendering of
the same data) — this is why the ingestion pipeline treats "has an NF-e
XML attachment" as the high-confidence path, and anything else (PDF-only,
plain text) as lower-confidence, routed to review (see app/ingest.py).

Known, disclosed gap: this parses the <NFe>/<infNFe> structure (layout
4.00, the current nationwide standard) and tolerates the <nfeProc>
wrapper some senders add around it. It does not validate the digital
signature, does not check the chave de acesso's check digit, and does
not call SEFAZ to confirm the NF-e's real status (autorizada/cancelada) —
it trusts the XML's own content. A forged or already-cancelled NF-e
would be parsed as if valid; catching that would need a live SEFAZ
lookup, out of scope here.
"""
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree as ET


class NfeParseError(ValueError):
    pass


@dataclass
class ParsedNfeItem:
    supplier_sku: str | None
    description: str | None
    ncm: str | None
    cfop: str | None
    quantity: Decimal | None
    unit: str | None
    unit_cost: Decimal | None
    total_cost: Decimal | None


@dataclass
class ParsedNfe:
    chave_acesso: str | None
    numero: str | None
    serie: str | None
    emitente_cnpj: str | None
    emitente_nome: str | None
    destinatario_cnpj: str | None
    data_emissao: datetime | None
    valor_total: Decimal | None
    valor_frete: Decimal | None
    valor_impostos: Decimal | None
    items: list[ParsedNfeItem] = field(default_factory=list)


def _strip_namespace(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def _local_find(elem: ET.Element, path: str) -> ET.Element | None:
    """ElementTree find, ignoring namespaces — NF-e XML always declares
    xmlns="http://www.portalfiscal.inf.br/nfe", which would otherwise
    require every call site to pass a namespace map."""
    parts = path.split("/")
    current = elem
    for part in parts:
        found = None
        for child in current:
            if _strip_namespace(child.tag) == part:
                found = child
                break
        if found is None:
            return None
        current = found
    return current


def _text(elem: ET.Element | None, path: str) -> str | None:
    found = _local_find(elem, path) if elem is not None else None
    if found is None or found.text is None:
        return None
    text = found.text.strip()
    return text or None


def _decimal(elem: ET.Element | None, path: str) -> Decimal | None:
    text = _text(elem, path)
    if text is None:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


_CHAVE_RE = re.compile(r"NFe(\d{44})")


def parse_nfe_xml(xml_bytes: bytes) -> ParsedNfe:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise NfeParseError(f"not well-formed XML: {exc}") from exc

    # Tolerate both a bare <NFe> root and a <nfeProc> wrapper (NFe + protNFe).
    root_local = _strip_namespace(root.tag)
    if root_local == "nfeProc":
        nfe_elem = None
        for child in root:
            if _strip_namespace(child.tag) == "NFe":
                nfe_elem = child
                break
        if nfe_elem is None:
            raise NfeParseError("nfeProc root has no NFe child")
    elif root_local == "NFe":
        nfe_elem = root
    else:
        raise NfeParseError(f"unrecognized root element <{root_local}> — not an NF-e document")

    inf_nfe = None
    for child in nfe_elem:
        if _strip_namespace(child.tag) == "infNFe":
            inf_nfe = child
            break
    if inf_nfe is None:
        raise NfeParseError("missing <infNFe>")

    chave_acesso = None
    id_attr = inf_nfe.get("Id", "")
    match = _CHAVE_RE.match(id_attr)
    if match:
        chave_acesso = match.group(1)

    ide = _local_find(inf_nfe, "ide")
    emit = _local_find(inf_nfe, "emit")
    dest = _local_find(inf_nfe, "dest")
    total = _local_find(inf_nfe, "total")
    icms_tot = _local_find(total, "ICMSTot") if total is not None else None

    data_emissao = None
    dh_emi = _text(ide, "dhEmi") or _text(ide, "dEmi")
    if dh_emi:
        try:
            data_emissao = datetime.fromisoformat(dh_emi)
        except ValueError:
            data_emissao = None

    items: list[ParsedNfeItem] = []
    for det in inf_nfe:
        if _strip_namespace(det.tag) != "det":
            continue
        prod = _local_find(det, "prod")
        if prod is None:
            continue
        items.append(
            ParsedNfeItem(
                supplier_sku=_text(prod, "cProd"),
                description=_text(prod, "xProd"),
                ncm=_text(prod, "NCM"),
                cfop=_text(prod, "CFOP"),
                quantity=_decimal(prod, "qCom"),
                unit=_text(prod, "uCom"),
                unit_cost=_decimal(prod, "vUnCom"),
                total_cost=_decimal(prod, "vProd"),
            )
        )

    if not items:
        raise NfeParseError("NF-e has no <det>/<prod> items")

    return ParsedNfe(
        chave_acesso=chave_acesso,
        numero=_text(ide, "nNF"),
        serie=_text(ide, "serie"),
        emitente_cnpj=_text(emit, "CNPJ"),
        emitente_nome=_text(emit, "xNome"),
        destinatario_cnpj=_text(dest, "CNPJ") if dest is not None else None,
        data_emissao=data_emissao,
        valor_total=_decimal(icms_tot, "vNF") if icms_tot is not None else None,
        valor_frete=_decimal(icms_tot, "vFrete") if icms_tot is not None else None,
        valor_impostos=_decimal(icms_tot, "vICMS") if icms_tot is not None else None,
        items=items,
    )
