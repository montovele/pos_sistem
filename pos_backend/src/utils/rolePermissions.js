const lowerRoles = new Set(['cashier', 'manager', 'vendedor']);

export function canAssignRole(actorRole, targetRole) {
  if (targetRole === 'admin' || targetRole === 'superadmin') {
    return actorRole === 'superadmin';
  }
  return lowerRoles.has(targetRole) && (actorRole === 'admin' || actorRole === 'superadmin');
}
