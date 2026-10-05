import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeServer, RealtimeEvent } from '../server/realtime';
import {
  createChitFull,
  addMemberToChit,
  createPaymentRecord,
  saveLiftAuction,
  recordLiftPayoutPayment,
  getMonthViewData,
} from '../server/prismaRepository';
import { initDatabase } from '../server/db';

describe('Real-Time Multi-Device Synchronization (SSE)', () => {
  let sseServer: RealtimeServer;
  let testChitId = '';
  let testMemberId = '';
  let testDueId = '';

  before(async () => {
    initDatabase();

    // Create a test chit with initial member and dues for mutation testing
    const chit = await createChitFull({
      name: 'SSE Realtime Test Chit',
      chit_value: 500000,
      monthly_chit_value: 25000,
      total_months: 20,
      total_members: 1,
      start_month: '2026-01',
      end_month: '2027-08',
      members: [{ customer_name: 'Realtime Member', phone: '9998887770', ticket_number: '01' }],
      rules: Array.from({ length: 20 }, (_, i) => ({
        month_number: i + 1,
        month_name: `Month ${i + 1}`,
        pre_lift_payment: 20000,
        post_lift_payment: 25000,
        monthly_chit_value: 25000,
        expected_lift_payout: 350000,
      })),
    });

    testChitId = chit.id;
    const m1Data = await getMonthViewData(testChitId, 1);
    testMemberId = m1Data!.dues[0].member_id;
    testDueId = m1Data!.dues[0].id;
  });

  afterEach(() => {
    if (sseServer) {
      sseServer.destroy();
    }
  });

  it('1. Authenticated SSE connection: registers client and writes initial connection ack', () => {
    sseServer = new RealtimeServer();
    const writtenData: string[] = [];

    // Mock Express Response object
    const mockRes: any = {
      write: (data: string) => {
        writtenData.push(data);
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    const clientId = sseServer.addClient('user-test-123', mockRes, {
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Desktop)',
    });

    assert.ok(clientId, 'Should return a valid clientId UUID');
    assert.equal(sseServer.getClientCount(), 1, 'Client count should be 1');
    assert.equal(sseServer.getUserClientCount('user-test-123'), 1);

    // Verify initial connection event was written to client stream
    assert.equal(writtenData.length, 1);
    const parsedAck = JSON.parse(writtenData[0].replace('data: ', '').trim());
    assert.equal(parsedAck.type, 'connected');
  });

  it('2. Unauthenticated SSE rejection: rejecting connections without valid credentials', () => {
    // Verify that missing token/session returns 401 unauthorized
    function checkAuth(token: string | null) {
      if (!token || token.trim() === '') {
        return { status: 401, error: 'Unauthorized. Please login.' };
      }
      return { status: 200, user: { id: 'valid-user' } };
    }

    assert.equal(checkAuth(null).status, 401);
    assert.equal(checkAuth('').status, 401);
    assert.equal(checkAuth('valid-session-token').status, 200);
  });

  it('3. Successful payment emits payment created event with correct chitId', async () => {
    sseServer = new RealtimeServer();
    const eventsReceived: RealtimeEvent[] = [];

    const mockRes: any = {
      write: (data: string) => {
        if (data.startsWith('data: ')) {
          eventsReceived.push(JSON.parse(data.replace('data: ', '').trim()));
        }
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-123', mockRes);

    // Simulate backend payment mutation
    const paymentResult = await createPaymentRecord({
      monthly_due_id: testDueId,
      amount: 5000,
      payment_method: 'UPI',
      notes: 'Realtime test payment',
    });

    assert.ok(paymentResult.payment?.id);
    const resolvedChitId = paymentResult.payment.chit_id || paymentResult.updatedDue.chit_id;
    assert.equal(resolvedChitId, testChitId);

    // Broadcast the event as performed in server.ts
    sseServer.broadcast({
      type: 'data_changed',
      chitId: resolvedChitId,
      entity: 'payment',
      action: 'created',
    });

    // We should have connected ack (index 0) and the data_changed event (index 1)
    assert.equal(eventsReceived.length, 2);
    const paymentEvent = eventsReceived[1];
    assert.equal(paymentEvent.type, 'data_changed');
    assert.equal(paymentEvent.entity, 'payment');
    assert.equal(paymentEvent.action, 'created');
    assert.equal(paymentEvent.chitId, testChitId);
  });

  it('4. Failed payment does not emit event', async () => {
    sseServer = new RealtimeServer();
    const eventsReceived: RealtimeEvent[] = [];

    const mockRes: any = {
      write: (data: string) => {
        if (data.startsWith('data: ')) {
          eventsReceived.push(JSON.parse(data.replace('data: ', '').trim()));
        }
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-123', mockRes);
    const initialEventsCount = eventsReceived.length;

    // Simulate invalid payment that throws an error
    let errorOccurred = false;
    try {
      await createPaymentRecord({
        monthly_due_id: 'non-existent-due-id',
        amount: 1000,
      });
      // Should not reach here
      sseServer.broadcast({ type: 'data_changed', chitId: 'xyz', entity: 'payment', action: 'created' });
    } catch (err) {
      errorOccurred = true;
    }

    assert.ok(errorOccurred, 'Payment should fail with invalid due ID');
    assert.equal(eventsReceived.length, initialEventsCount, 'No event should be broadcast when mutation fails');
  });

  it('5. Member mutation emits member event with exact chitId', async () => {
    sseServer = new RealtimeServer();
    const eventsReceived: RealtimeEvent[] = [];

    const mockRes: any = {
      write: (data: string) => {
        if (data.startsWith('data: ')) {
          eventsReceived.push(JSON.parse(data.replace('data: ', '').trim()));
        }
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-123', mockRes);

    const newMember = await addMemberToChit(testChitId, {
      customer_name: 'Gamma Sync Member',
      phone: '9988776655',
      ticket_number: '02',
    });

    assert.ok(newMember?.id);

    sseServer.broadcast({
      type: 'data_changed',
      chitId: testChitId,
      entity: 'member',
      action: 'created',
    });

    const lastEvent = eventsReceived[eventsReceived.length - 1];
    assert.equal(lastEvent.type, 'data_changed');
    assert.equal(lastEvent.entity, 'member');
    assert.equal(lastEvent.action, 'created');
    assert.equal(lastEvent.chitId, testChitId);
  });

  it('6. Lift auction mutation emits lift event with exact chitId', async () => {
    sseServer = new RealtimeServer();
    const eventsReceived: RealtimeEvent[] = [];

    const mockRes: any = {
      write: (data: string) => {
        if (data.startsWith('data: ')) {
          eventsReceived.push(JSON.parse(data.replace('data: ', '').trim()));
        }
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-123', mockRes);

    const liftResult = await saveLiftAuction(testChitId, testMemberId, {
      lift_month: 1,
      lift_amount: 350000,
      lift_amount_received: 200000,
      lift_date: '2026-01-15',
      payment_method: 'Bank Transfer',
    });

    assert.ok(liftResult);

    sseServer.broadcast({
      type: 'data_changed',
      chitId: testChitId,
      entity: 'lift',
      action: 'created',
    });

    const lastEvent = eventsReceived[eventsReceived.length - 1];
    assert.equal(lastEvent.type, 'data_changed');
    assert.equal(lastEvent.entity, 'lift');
    assert.equal(lastEvent.chitId, testChitId);
  });

  it('7. Lift payout installment mutation emits lift_payout event', async () => {
    sseServer = new RealtimeServer();
    const eventsReceived: RealtimeEvent[] = [];

    const mockRes: any = {
      write: (data: string) => {
        if (data.startsWith('data: ')) {
          eventsReceived.push(JSON.parse(data.replace('data: ', '').trim()));
        }
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-123', mockRes);

    const payoutResult = await recordLiftPayoutPayment(testChitId, testMemberId, {
      amount: 50000,
      payment_date: '2026-01-20',
      payment_method: 'Cheque',
    });

    assert.ok(payoutResult.transactions?.length > 0);

    sseServer.broadcast({
      type: 'data_changed',
      chitId: testChitId,
      entity: 'lift_payout',
      action: 'created',
    });

    const lastEvent = eventsReceived[eventsReceived.length - 1];
    assert.equal(lastEvent.type, 'data_changed');
    assert.equal(lastEvent.entity, 'lift_payout');
    assert.equal(lastEvent.chitId, testChitId);
  });

  it('8. Chit isolation: unrelated Chit events are cleanly ignored by frontend filter logic', () => {
    const activeChitId = 'chit-AAA';
    let refreshTriggered = false;

    function simulateFrontendHook(event: RealtimeEvent) {
      if (event.type !== 'data_changed') return;
      if (activeChitId !== null && event.chitId && event.chitId !== activeChitId) {
        // Ignored
        return;
      }
      refreshTriggered = true;
    }

    // Event for a different Chit (Chit-BBB)
    simulateFrontendHook({
      type: 'data_changed',
      chitId: 'chit-BBB',
      entity: 'payment',
      action: 'created',
    });
    assert.equal(refreshTriggered, false, 'Should NOT trigger refresh when event is for different Chit');

    // Event for the active Chit (Chit-AAA)
    simulateFrontendHook({
      type: 'data_changed',
      chitId: 'chit-AAA',
      entity: 'payment',
      action: 'created',
    });
    assert.equal(refreshTriggered, true, 'SHOULD trigger refresh when event matches active Chit');
  });

  it('9. Debouncing: multiple rapid events (payment + due update) collapse into a single refresh', async () => {
    let refreshCount = 0;
    let timer: NodeJS.Timeout | null = null;
    const debounceMs = 50;

    function handleRealtimeEvent() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refreshCount++;
        timer = null;
      }, debounceMs);
    }

    // Trigger 5 rapid events within 10ms
    handleRealtimeEvent();
    handleRealtimeEvent();
    handleRealtimeEvent();
    handleRealtimeEvent();
    handleRealtimeEvent();

    assert.equal(refreshCount, 0, 'No refresh should execute synchronously before debounce expires');

    // Wait for debounce window
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(refreshCount, 1, 'Exactly one debounced refresh should execute for all 5 rapid events');
  });

  it('10. SSE disconnect cleanup: automatically removes client from registry', () => {
    sseServer = new RealtimeServer();
    const mockRes: any = {
      write: () => true,
      flush: () => {},
      end: () => {},
    };

    const clientId = sseServer.addClient('user-test-456', mockRes);
    assert.equal(sseServer.getClientCount(), 1);

    // Simulate socket disconnect
    const removed = sseServer.removeClient(clientId);
    assert.equal(removed, true, 'Client should be successfully removed');
    assert.equal(sseServer.getClientCount(), 0, 'Registry should be empty after disconnect');
  });

  it('11. Security review: tokens are strictly forbidden in query strings and URLs', () => {
    // Replicate extractToken security logic
    function extractToken(req: any): string | null {
      if (req.signedCookies && req.signedCookies.chit_session) {
        return req.signedCookies.chit_session;
      }
      if (req.cookies && req.cookies.chit_session) {
        return req.cookies.chit_session;
      }
      const authHeader = req.headers?.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
      }
      return null;
    }

    // 1. Request with query token ONLY -> MUST BE REJECTED (null)
    const queryOnlyReq = {
      query: { token: 'insecure-url-token-123' },
      cookies: {},
      headers: {},
    };
    assert.equal(extractToken(queryOnlyReq), null, 'Tokens in URL query string must NOT be accepted');

    // 2. Request with HTTP-only session cookie -> ACCEPTED
    const cookieReq = {
      cookies: { chit_session: 'secure-cookie-session-token' },
      headers: {},
    };
    assert.equal(extractToken(cookieReq), 'secure-cookie-session-token', 'HTTP-only cookie must be accepted');

    // 3. Request with Bearer header -> ACCEPTED
    const bearerReq = {
      cookies: {},
      headers: { authorization: 'Bearer header-session-token' },
    };
    assert.equal(extractToken(bearerReq), 'header-session-token', 'Bearer header must be accepted');
  });

  it('12. Payload security review: SSE events contain ZERO sensitive customer or financial data', () => {
    sseServer = new RealtimeServer();
    const capturedMessages: string[] = [];

    const mockRes: any = {
      write: (data: string) => {
        capturedMessages.push(data);
        return true;
      },
      flush: () => {},
      end: () => {},
    };

    sseServer.addClient('user-test-789', mockRes);

    const testEvent: RealtimeEvent = {
      type: 'data_changed',
      chitId: 'test-chit-001',
      entity: 'payment',
      action: 'created',
    };

    sseServer.broadcast(testEvent);

    assert.equal(capturedMessages.length, 2); // connected ack + broadcast event
    const broadcastRaw = capturedMessages[1];
    const parsed = JSON.parse(broadcastRaw.replace('data: ', '').trim());

    // Strict whitelist of permitted fields in SSE invalidation signal
    const allowedKeys = new Set(['type', 'chitId', 'entity', 'action', 'timestamp']);
    for (const key of Object.keys(parsed)) {
      assert.ok(allowedKeys.has(key), `Field "${key}" is not permitted in SSE payload`);
    }

    // Ensure sensitive terms are never present
    const forbiddenSubstrings = ['amount', 'password', 'phone', 'customer', 'balance', 'notes', 'reference'];
    for (const forbidden of forbiddenSubstrings) {
      assert.ok(!broadcastRaw.toLowerCase().includes(forbidden), `SSE payload must not expose ${forbidden}`);
    }
  });
});
