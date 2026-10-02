async function record(client, {
  actorUserId,
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  reason = null,
}) {
  await client.query(
    `INSERT INTO admin_audit_logs
       (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason)
     VALUES ($1, $2, $3, $4, $5::JSONB, $6::JSONB, $7)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      reason,
    ]
  );
}

module.exports = { record };
