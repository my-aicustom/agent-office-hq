// Legacy interrogation reasoning engine.
//
// All 5 agents (aero-writer/Maya, radar-x/Nadia, iron-shield/Rian,
// hermes-sentry/Budi, cloud-forge/Gilang) now answer chat from their own
// real, data-grounded agent modules under agents/<name>/agent.mjs —
// server.mjs's REAL_AGENT_ANSWERERS map routes every known agentId there
// before this file is ever consulted. AGENT_KNOWLEDGE is kept empty (rather
// than deleted outright) only as a documented, safe fallback for an
// unrecognized agentId — see processAgentChat below.
export const AGENT_KNOWLEDGE = {};

export function processAgentChat(agentId, message, history = []) {
  const agent = AGENT_KNOWLEDGE[agentId];
  if (!agent) {
    return {
      status: 'error',
      message: 'Agent ID tidak ditemukan dalam registry.'
    };
  }

  if (typeof agent.generateAnswer !== 'function') {
    return {
      status: 'error',
      message: 'Agent ini menggunakan domain intelligence endpoint, bukan template chat legacy.'
    };
  }

  const replyText = agent.generateAnswer(message);
  const timestampStr = new Date().toLocaleTimeString('id-ID');

  return {
    status: 'success',
    agentId: agent.id,
    agentName: agent.name,
    agentAvatar: agent.avatar,
    agentColor: agent.color,
    timestamp: timestampStr,
    reply: replyText
  };
}
