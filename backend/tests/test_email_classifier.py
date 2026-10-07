from app.email_classifier import classify_email
from app.models import EmailCategory


def test_financeiro_keyword_wins():
    result = classify_email(
        from_email="cobranca@banco.com", subject="Boleto em atraso - vencimento hoje", body_text=None,
    )
    assert result.category == EmailCategory.FINANCEIRO
    assert result.confidence > 0


def test_pedido_from_known_supplier_is_pedido_fornecedor():
    result = classify_email(
        from_email="vendas@suvinil.com.br", subject="Confirmação de pedido #123", body_text=None,
        known_supplier_emails=frozenset({"vendas@suvinil.com.br"}),
    )
    assert result.category == EmailCategory.PEDIDO_FORNECEDOR


def test_pedido_from_unknown_sender_is_pedido_cliente():
    result = classify_email(
        from_email="joao@gmail.com", subject="Gostaria de fazer um pedido de tinta", body_text=None,
        known_supplier_emails=frozenset({"vendas@suvinil.com.br"}),
    )
    assert result.category == EmailCategory.PEDIDO_CLIENTE


def test_spam_keyword_detected():
    result = classify_email(
        from_email="marketing@promo.com", subject="Oferta exclusiva! Ganhe desconto agora",
        body_text="Clique aqui para descadastrar",
    )
    assert result.category == EmailCategory.SPAM


def test_internal_domain_without_other_signal_is_info_interna():
    result = classify_email(
        from_email="gerente@marquescolor.com.br", subject="Fechamento de caixa de ontem", body_text=None,
        internal_domain="marquescolor.com.br",
    )
    assert result.category == EmailCategory.INFO_INTERNA


def test_unmatched_email_is_desconhecido_with_zero_confidence():
    result = classify_email(from_email="alguem@exemplo.com", subject="Oi", body_text="tudo bem?")
    assert result.category == EmailCategory.DESCONHECIDO
    assert result.confidence == 0.0


def test_accent_insensitive_matching():
    """'cotação' with the real accent must match the same as the
    unaccented keyword list — Brazilian Portuguese e-mails almost always
    carry accents, so this isn't an edge case, it's the common case."""
    result = classify_email(
        from_email="fornecedor@akzonobel.com", subject="Cotação de tintas", body_text=None,
        known_supplier_emails=frozenset({"fornecedor@akzonobel.com"}),
    )
    assert result.category == EmailCategory.PEDIDO_FORNECEDOR
