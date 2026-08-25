import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { BudiAgent } from '../agents/budi/agent.mjs';
import { BudiLeadsDb } from '../agents/budi/leads_db.mjs';
import { formatLeadAlert, TelegramBridge } from '../agents/budi/telegram_bridge.mjs';
import { LEAD_STATUSES, LEAD_SOURCES } from '../agents/budi/constants.mjs';

function tempLeadsFile() {
  return path.resolve('data', `budi-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeAgent() {
  const filePath = tempLeadsFile();
  const leadsDb = new BudiLeadsDb(filePath);
  const bridge = new TelegramBridge({ botToken: null, chatId: null });
  const agent = new BudiAgent({ leadsDb, bridge });
  return { agent, leadsDb, filePath };
}

async function cleanup(filePath) {
  await fs.rm(filePath, { force: true });
}

test('ingestLead persists a valid lead with NEW status', async () => {
  const { agent, filePath } = makeAgent();
  try {
    const result = await agent.ingestLead({ name: 'Andi', phone: '081234567890', source: LEAD_SOURCES.WEBSITE_FORM });
    assert.equal(result.inserted, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.lead.name, 'Andi');
    assert.equal(result.lead.phone, '6281234567890');
    assert.equal(result.lead.status, LEAD_STATUSES.NEW);
    assert.equal(result.lead.source, LEAD_SOURCES.WEBSITE_FORM);
    assert.ok(result.lead.id.startsWith('LEAD-'));
    assert.equal(result.alert.skipped, undefined);
    assert.equal(result.alert.dispatched, false);
    assert.equal(result.alert.error, 'Telegram bridge is not configured.');
  } finally {
    await cleanup(filePath);
  }
});

test('ingestLead rejects a lead missing required fields', async () => {
  const { agent, filePath } = makeAgent();
  try {
    await assert.rejects(
      () => agent.ingestLead({ phone: '081234567890' }),
      error => error.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => agent.ingestLead({ name: 'Budi tanpa kontak' }),
      error => error.code === 'VALIDATION_ERROR'
    );
  } finally {
    await cleanup(filePath);
  }
});

test('ingestLead rejects an unknown lead source', async () => {
  const { agent, filePath } = makeAgent();
  try {
    await assert.rejects(
      () => agent.ingestLead({ name: 'Citra', phone: '081200000000', source: 'CARRIER_PIGEON' }),
      error => error.code === 'VALIDATION_ERROR'
    );
  } finally {
    await cleanup(filePath);
  }
});

test('duplicate leads by phone number are detected and not double-inserted', async () => {
  const { agent, filePath } = makeAgent();
  try {
    const first = await agent.ingestLead({ name: 'Dewi', phone: '0812-3456-7890', source: LEAD_SOURCES.MANUAL });
    assert.equal(first.inserted, true);

    const second = await agent.ingestLead({ name: 'Dewi Lagi', phone: '6281234567890', source: LEAD_SOURCES.WHATSAPP });
    assert.equal(second.inserted, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.lead.id, first.lead.id);
    assert.equal(second.alert.skipped, true);

    const leads = await agent.getLeads();
    assert.equal(leads.length, 1);
  } finally {
    await cleanup(filePath);
  }
});

test('duplicate leads by email are detected when phone is absent', async () => {
  const { agent, filePath } = makeAgent();
  try {
    await agent.ingestLead({ name: 'Eka', email: 'Eka@Example.com', source: LEAD_SOURCES.MANUAL });
    const second = await agent.ingestLead({ name: 'Eka Duplikat', email: 'eka@example.com', source: LEAD_SOURCES.MANUAL });
    assert.equal(second.duplicate, true);
  } finally {
    await cleanup(filePath);
  }
});

test('syncWhatsAppWebhook extracts lead fields from a WA provider payload', async () => {
  const { agent, filePath } = makeAgent();
  try {
    const result = await agent.syncWhatsAppWebhook({ from: '081298765432', pushname: 'Fajar', message: 'Mau tanya harga laser cutting' });
    assert.equal(result.inserted, true);
    assert.equal(result.lead.name, 'Fajar');
    assert.equal(result.lead.phone, '6281298765432');
    assert.equal(result.lead.source, LEAD_SOURCES.WHATSAPP);
    assert.equal(result.lead.message, 'Mau tanya harga laser cutting');
  } finally {
    await cleanup(filePath);
  }
});

test('updateLeadStatus updates status and rejects unknown leads/statuses', async () => {
  const { agent, filePath } = makeAgent();
  try {
    const { lead } = await agent.ingestLead({ name: 'Gita', phone: '081211112222', source: LEAD_SOURCES.MANUAL });
    const updated = await agent.updateLeadStatus(lead.id, LEAD_STATUSES.QUALIFIED);
    assert.equal(updated.status, LEAD_STATUSES.QUALIFIED);
    assert.equal(typeof updated.updatedAt, 'string');

    await assert.rejects(
      () => agent.updateLeadStatus(lead.id, 'NOT_A_STATUS'),
      error => error.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => agent.updateLeadStatus('LEAD-DOES-NOT-EXIST', LEAD_STATUSES.WON),
      error => error.code === 'LEAD_NOT_FOUND'
    );
  } finally {
    await cleanup(filePath);
  }
});

test('getLeadMetrics aggregates counts by status and conversion rate', async () => {
  const { agent, filePath } = makeAgent();
  try {
    const a = await agent.ingestLead({ name: 'Hadi', phone: '081300000001', source: LEAD_SOURCES.MANUAL });
    const b = await agent.ingestLead({ name: 'Indah', phone: '081300000002', source: LEAD_SOURCES.MANUAL });
    const c = await agent.ingestLead({ name: 'Joko', phone: '081300000003', source: LEAD_SOURCES.MANUAL });
    await agent.updateLeadStatus(a.lead.id, LEAD_STATUSES.WON);
    await agent.updateLeadStatus(b.lead.id, LEAD_STATUSES.LOST);
    void c;

    const status = await agent.getStatus();
    assert.equal(status.metrics.total, 3);
    assert.equal(status.metrics.byStatus.WON, 1);
    assert.equal(status.metrics.byStatus.LOST, 1);
    assert.equal(status.metrics.byStatus.NEW, 1);
    assert.equal(status.metrics.conversionRate, 0.5);
    assert.equal(status.currentStatus, 'READY');
    assert.equal(status.telegram.status, 'UNAVAILABLE');
  } finally {
    await cleanup(filePath);
  }
});

test('leads persist to disk and survive a fresh BudiLeadsDb instance pointed at the same file', async () => {
  const { agent, filePath } = makeAgent();
  try {
    await agent.ingestLead({ name: 'Kirana', phone: '081400000001', source: LEAD_SOURCES.MANUAL });
    await agent.ingestLead({ name: 'Lukman', phone: '081400000002', source: LEAD_SOURCES.MANUAL });

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(raw.records.length, 2);

    const reopened = new BudiLeadsDb(filePath);
    const reopenedLeads = await reopened.getLeads();
    assert.equal(reopenedLeads.length, 2);
    assert.deepEqual(reopenedLeads.map(l => l.name).sort(), ['Kirana', 'Lukman']);
  } finally {
    await cleanup(filePath);
  }
});

test('formatLeadAlert renders a human-readable Telegram message', () => {
  const message = formatLeadAlert({
    id: 'LEAD-TEST-ABC',
    name: 'Mira',
    phone: '6281500000000',
    email: null,
    source: LEAD_SOURCES.WEBSITE_FORM,
    message: 'Butuh cutting akrilik'
  });
  assert.match(message, /Mira/);
  assert.match(message, /6281500000000/);
  assert.match(message, /LEAD-TEST-ABC/);
  assert.doesNotMatch(message, /Email:/);
});

test('TelegramBridge.sendLeadAlert reports not-configured without throwing', async () => {
  const bridge = new TelegramBridge({ botToken: null, chatId: null });
  const result = await bridge.sendLeadAlert({ id: 'LEAD-X', name: 'Nia', phone: '0800', source: LEAD_SOURCES.MANUAL });
  assert.equal(result.dispatched, false);
  assert.ok(result.error);
});
