from app.models.analytics import AuditEvent


def record_audit_event(
    db,
    *,
    company_id: str,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            company_id=company_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
    )
