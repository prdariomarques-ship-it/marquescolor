"""Heuristic text classifier for e-mails that did NOT come with a
parseable NF-e XML attachment (that case is decided directly in
app/ingest.py, since it requires actually trying to parse each
attachment — a much stronger signal than keyword matching).

This is intentionally simple keyword matching, not an LLM call: the
mailbox gets ~30 e-mails/month tied to NF-e plus whatever else comes in,
low enough volume that a human reviewing the DESCONHECIDO/low-confidence
bucket is cheap, and a deterministic classifier is easier to audit and
fix than a model call for this. If volume or variety grows enough that
this stops being good enough, swap this function's body for an LLM
call — nothing else in the pipeline needs to change, since callers only
see the ClassificationResult.
"""
import re
import unicodedata
from dataclasses import dataclass

from app.models import EmailCategory


@dataclass(frozen=True)
class ClassificationResult:
    category: EmailCategory
    confidence: float
    matched_keywords: tuple[str, ...] = ()


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    return text.lower()


_FINANCEIRO_KEYWORDS = ("boleto", "fatura", "cobranca", "vencimento", "pagamento", "duplicata")
_PEDIDO_KEYWORDS = ("pedido", "cotacao", "orcamento", "proposta comercial")
_SPAM_KEYWORDS = (
    "descadastrar", "unsubscribe", "promocao imperdivel", "compre agora",
    "oferta exclusiva", "ganhe desconto",
)


def classify_email(
    *,
    from_email: str,
    subject: str | None,
    body_text: str | None,
    known_supplier_emails: frozenset[str] = frozenset(),
    internal_domain: str | None = None,
) -> ClassificationResult:
    haystack = _normalize(f"{subject or ''} {body_text or ''}")
    from_email_norm = from_email.lower()

    spam_hits = tuple(kw for kw in _SPAM_KEYWORDS if kw in haystack)
    if spam_hits:
        return ClassificationResult(EmailCategory.SPAM, 0.6, spam_hits)

    financeiro_hits = tuple(kw for kw in _FINANCEIRO_KEYWORDS if kw in haystack)
    if financeiro_hits:
        return ClassificationResult(EmailCategory.FINANCEIRO, 0.7, financeiro_hits)

    pedido_hits = tuple(kw for kw in _PEDIDO_KEYWORDS if kw in haystack)
    if pedido_hits:
        if from_email_norm in known_supplier_emails:
            return ClassificationResult(EmailCategory.PEDIDO_FORNECEDOR, 0.75, pedido_hits)
        return ClassificationResult(EmailCategory.PEDIDO_CLIENTE, 0.55, pedido_hits)

    if internal_domain and from_email_norm.endswith(f"@{internal_domain.lower()}"):
        return ClassificationResult(EmailCategory.INFO_INTERNA, 0.5)

    # Deliberately low confidence, not zero-and-crash: an unmatched
    # e-mail is real, common, and not an error — it just means nothing
    # here should be acted on automatically.
    return ClassificationResult(EmailCategory.DESCONHECIDO, 0.0)
