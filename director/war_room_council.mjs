// Legacy compatibility guard.
// Truthful multi-provider decisions now run exclusively through SharedCaseBus.

export class WarRoomCouncil {
  async convene() {
    const error = new Error('Legacy WarRoomCouncil is disabled. Use SharedCaseBus.processIncident().');
    error.code = 'LEGACY_WAR_ROOM_DISABLED';
    throw error;
  }
}
