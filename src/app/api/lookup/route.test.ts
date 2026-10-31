import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
const url = (chain: number, address: string) => new NextRequest(`http://localhost/api/lookup?chain=${chain}&address=${address}`);
describe('bounded public lookup', () => {
  it('rejects unsupported chains and invalid addresses without RPC', async () => { const mocked = vi.fn(); globalThis.fetch = mocked; expect((await GET(url(1, '0x0000000000000000000000000000000000000001'))).status).toBe(400); expect((await GET(url(56, 'bad'))).status).toBe(400); expect(mocked).not.toHaveBeenCalled(); });
  it('reports failed RPCs without inventing code', async () => { globalThis.fetch = vi.fn().mockRejectedValue(Error('offline')); const response = await GET(url(56, '0x0000000000000000000000000000000000000011')); expect(response.status).toBe(503); expect((await response.json()).rpcAvailable).toBe(false); });
  it('falls back and distinguishes an account with no code', async () => { let calls = 0; globalThis.fetch = vi.fn(async () => { calls++; if (calls <= 2) throw Error('first endpoint down'); return new Response(JSON.stringify({ result: calls % 2 ? '0x38' : '0x' }), { status: 200 }); }) as typeof fetch; const response = await GET(url(56, '0x0000000000000000000000000000000000000012')); expect(response.status).toBe(200); expect((await response.json()).bytecodeExists).toBe(false); });
  it('rejects chain mismatches', async () => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: '0x1' }), { status: 200 })) as typeof fetch; const response = await GET(url(8453, '0x0000000000000000000000000000000000000013')); expect(response.status).toBe(503); });
});
