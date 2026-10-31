import { getAddress, isAddress, isHex, hexToString, validateTypedData, type Hex } from 'viem';

export type Severity = 'Critical' | 'Warning' | 'Informational' | 'Unknown';
export type Evidence = { path: string; value: string };
export type Finding = { severity: Severity; title: string; explanation: string; evidence: Evidence[]; verify: string; status: 'verified field' | 'interpretation' | 'unverified' };
export type MapNode = { id: string; label: string; value: string; kind: string; evidence: Evidence[] };
export type MapEdge = { from: string; to: string; label: string; evidence: Evidence[] };
export type Inspection = { kind: string; network: number; claimedChain?: number; primaryType?: string; domain?: Record<string, unknown>; original: unknown; fields: Evidence[]; summary: string; facts: string[]; unknowns: string[]; findings: Finding[]; nodes: MapNode[]; edges: MapEdge[]; contracts: string[] };
export const NETWORKS: Record<number, { name: string; explorer: string }> = { 56: { name: 'BNB Smart Chain', explorer: 'https://bscscan.com/address/' }, 8453: { name: 'Base', explorer: 'https://basescan.org/address/' }, 4663: { name: 'Robinhood Chain', explorer: 'https://explorer.chain.robinhood.com/address/' } };
const MAX_SIZE = 100_000;
const MAX_DEPTH = 24;
const MAX_UINT = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
function schema(types: Record<string, unknown>, name: string, fields: Record<string, string>): boolean { const entries = types[name]; if (!Array.isArray(entries)) return false; return Object.entries(fields).every(([key, type]) => entries.some(item => obj(item) && item.name === key && item.type === type)); }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' ? String(v) : JSON.stringify(v);
function depth(v: unknown, n = 0): void { if (n > MAX_DEPTH) throw Error('Request is nested too deeply.'); if (v && typeof v === 'object') for (const item of Object.values(v)) depth(item, n + 1); }
function numeric(v: unknown): bigint | undefined { try { if (typeof v === 'string' && !/^\d+$|^0x[0-9a-f]+$/i.test(v)) return; if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'bigint') return; return BigInt(v); } catch { return; } }
function field(path: string, value: unknown): Evidence { return { path, value: str(value) }; }
function flatten(v: unknown, path: string, out: Evidence[] = []): Evidence[] { if (Array.isArray(v)) v.forEach((item, i) => flatten(item, `${path}[${i}]`, out)); else if (obj(v)) Object.entries(v).forEach(([key, item]) => flatten(item, `${path}.${key}`, out)); else out.push(field(path, v)); return out; }
function json(raw: string): unknown { try { return JSON.parse(raw); } catch { throw Error('Invalid JSON. Paste a JSON-RPC request, typed-data object, or a plain message.'); } }
function unwrap(input: unknown): { payload: unknown; method?: string; context?: Record<string, unknown> } {
  if (!obj(input)) return { payload: input };
  if (typeof input.method !== 'string' || !Array.isArray(input.params)) return { payload: input, context: input };
  const method = input.method;
  if (!['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'personal_sign'].includes(method)) throw Error(`Unsupported RPC method: ${method}.`);
  const params = input.params;
  const payload = method === 'personal_sign' ? params.find(v => typeof v === 'string' && !isAddress(v)) : params.find(v => obj(v) || typeof v === 'string' && v.trim().startsWith('{'));
  if (payload === undefined) throw Error('RPC params do not contain a supported message.');
  return { payload, method, context: input };
}
function decodePersonal(value: unknown): string { if (typeof value !== 'string') throw Error('Personal-sign payload must be text or hex.'); if (isHex(value)) { try { return hexToString(value as Hex); } catch { return value; } } return value; }
function parseSiwe(message: string): Record<string, string> | undefined {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const match = lines[0]?.match(/^(.+) wants you to sign in with your Ethereum account:$/);
  if (!match || !isAddress(lines[1] || '')) return;
  const result: Record<string, string> = { domain: match[1], address: getAddress(lines[1]) };
  for (const line of lines.slice(2)) { const m = line.match(/^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID): (.+)$/); if (m) result[m[1]] = m[2]; }
  if (!result.URI || result.Version !== '1' || !/^\d+$/.test(result['Chain ID'] || '') || !/^[a-zA-Z0-9]{8,}$/.test(result.Nonce || '') || !result['Issued At'] || Number.isNaN(Date.parse(result['Issued At']))) return;
  return result;
}
function addFinding(x: Inspection, severity: Severity, title: string, explanation: string, evidence: Evidence[], verify: string, status: Finding['status'] = 'interpretation') { x.findings.push({ severity, title, explanation, evidence, verify, status }); }
function node(x: Inspection, id: string, kind: string, label: string, value: unknown, path: string) { if (value === undefined || value === null) return; x.nodes.push({ id, kind, label, value: str(value), evidence: [field(path, value)] }); }
function edge(x: Inspection, from: string, to: string, label: string, path: string, value: unknown) { if (x.nodes.some(n => n.id === from) && x.nodes.some(n => n.id === to)) x.edges.push({ from, to, label, evidence: [field(path, value)] }); }
function address(v: unknown, path: string) { if (typeof v !== 'string' || !isAddress(v)) throw Error(`${path} must be a valid EVM address.`); return getAddress(v); }
function requireNum(v: unknown, path: string) { const n = numeric(v); if (n === undefined || n < 0n) throw Error(`${path} must be a non-negative integer.`); return n; }
function deadline(x: Inspection, v: unknown, path: string, label: string) { const n = requireNum(v, path); node(x, path, 'time', label, v, path); const now = BigInt(Math.floor(Date.now() / 1000)); if (n !== 0n && n < now) addFinding(x, 'Warning', 'Deadline has passed', `${label} is earlier than the current time.`, [field(path, v)], 'Confirm the intended deadline and current chain time.', 'verified field'); else if (n > now + 365n * 86400n) addFinding(x, 'Warning', 'Long-lived authorization', `${label} is more than one year away.`, [field(path, v)], 'Confirm the permission duration is intended.'); }
function amount(x: Inspection, v: unknown, path: string, bits = 256) { const n = requireNum(v, path); node(x, path, 'amount', 'Amount (raw units)', v, path); if (n === (bits === 160 ? MAX_UINT160 : MAX_UINT)) addFinding(x, 'Critical', 'Unlimited allowance value', 'The amount is the maximum value of its integer type.', [field(path, v)], 'Check token decimals and whether unlimited access is intended.', 'verified field'); else if (n >= 10n ** 30n) addFinding(x, 'Warning', 'Extremely large raw amount', 'This raw integer is very large; token decimals are needed to interpret units.', [field(path, v)], 'Confirm token decimals and the intended amount.'); }
function base(network: number, kind: string, original: unknown): Inspection { return { kind, network, original, fields: [], summary: '', facts: [], unknowns: [], findings: [], nodes: [], edges: [], contracts: [] }; }
function typed(raw: Record<string, unknown>, network: number, original: unknown, context?: Record<string, unknown>): Inspection {
  const domain = raw.domain, types = raw.types, message = raw.message, primaryType = raw.primaryType;
  if (!obj(domain) || !obj(types) || !obj(message) || typeof primaryType !== 'string') throw Error('Typed data needs domain, types, primaryType, and message objects.');
  try { validateTypedData({ domain, types: types as Record<string, { name: string; type: string }[]>, primaryType, message }); } catch (e) { throw Error(`Invalid EIP-712 typed data: ${e instanceof Error ? e.message.split('\n')[0] : 'invalid fields'}`); }
  const x = base(network, 'EIP-712 typed data', original); x.domain = domain; x.primaryType = primaryType; x.fields = [...flatten(domain, 'domain'), ...flatten(message, 'message')]; x.claimedChain = numeric(domain.chainId) !== undefined ? Number(numeric(domain.chainId)) : undefined;
  node(x, 'verifier', 'contract', 'Verifying contract', domain.verifyingContract, 'domain.verifyingContract');
  if (domain.verifyingContract !== undefined) x.contracts.push(address(domain.verifyingContract, 'domain.verifyingContract'));
  x.facts.push(`Primary type: ${primaryType}`, `Domain: ${str(domain.name ?? 'unspecified')}`, `Version: ${str(domain.version ?? 'unspecified')}`);
  if (x.claimedChain !== undefined && x.claimedChain !== network) addFinding(x, 'Warning', 'Domain chain differs from selected network', `The request declares chain ${x.claimedChain}; selected network is ${network}.`, [field('domain.chainId', domain.chainId)], 'Switch to the declared network and verify the expected chain.', 'verified field');
  if (domain.verifyingContract) addFinding(x, 'Unknown', 'Contract behavior is unverified', 'Typed data identifies a verifying contract, but decoding cannot establish its code behavior or trustworthiness.', [field('domain.verifyingContract', domain.verifyingContract)], 'Check deployed bytecode and review the contract independently.', 'unverified');
  const m = message;
  if (primaryType === 'Permit' && schema(types, 'Permit', { owner: 'address', spender: 'address', value: 'uint256', nonce: 'uint256', deadline: 'uint256' }) && 'owner' in m && 'spender' in m && 'value' in m && 'nonce' in m && 'deadline' in m) {
    x.kind = 'ERC-2612 permit'; const owner = address(m.owner, 'message.owner'), spender = address(m.spender, 'message.spender');
    node(x, 'owner', 'identity', 'Claimed owner', owner, 'message.owner'); node(x, 'spender', 'identity', 'Spender', spender, 'message.spender'); amount(x, m.value, 'message.value'); requireNum(m.nonce, 'message.nonce'); deadline(x, m.deadline, 'message.deadline', 'Deadline'); edge(x, 'owner', 'spender', 'may authorize allowance', 'message.spender', spender); edge(x, 'verifier', 'spender', 'token allowance target', 'message.spender', spender);
    x.summary = 'If accepted by the token contract, this signature can set a token allowance for the named spender.'; x.unknowns.push('Actual signer and signature validity are not established.', 'Token decimals and contract behavior require independent verification.');
  } else if (/^Permit(Single|Batch)$/.test(primaryType) && schema(types, 'PermitDetails', { token: 'address', amount: 'uint160', expiration: 'uint48', nonce: 'uint48' }) && schema(types, primaryType, { details: primaryType === 'PermitBatch' ? 'PermitDetails[]' : 'PermitDetails', spender: 'address', sigDeadline: 'uint256' }) && 'details' in m) {
    x.kind = 'Permit2 AllowanceTransfer'; const details = Array.isArray(m.details) ? m.details : [m.details]; if (!details.length) throw Error('Permit2 details cannot be empty.');
    if (m.spender !== undefined) node(x, 'spender', 'identity', 'Spender', address(m.spender, 'message.spender'), 'message.spender'); else x.unknowns.push('Spender is not explicit in this request.');
    details.forEach((d, i) => { if (!obj(d)) throw Error('Permit2 details must be objects.'); const p = Array.isArray(m.details) ? `message.details[${i}]` : 'message.details'; const token = address(d.token, `${p}.token`); node(x, `token${i}`, 'token', 'Token', token, `${p}.token`); x.contracts.push(token); amount(x, d.amount, `${p}.amount`, 160); deadline(x, d.expiration, `${p}.expiration`, 'Expiration'); requireNum(d.nonce, `${p}.nonce`); edge(x, `token${i}`, 'spender', 'allowance', `${p}.amount`, d.amount); }); deadline(x, m.sigDeadline, 'message.sigDeadline', 'Signature deadline');
    x.summary = 'If accepted by Permit2, this request can authorize token allowances for the explicit spender.'; x.unknowns.push('Actual signer, signature validity, and existing token approval to Permit2 are not established.');
  } else if (/^Permit(Witness)?TransferFrom$|^PermitBatch(Witness)?TransferFrom$/.test(primaryType) && schema(types, 'TokenPermissions', { token: 'address', amount: 'uint256' }) && schema(types, primaryType, { permitted: primaryType.includes('Batch') ? 'TokenPermissions[]' : 'TokenPermissions', nonce: 'uint256', deadline: 'uint256' }) && 'permitted' in m) {
    x.kind = 'Permit2 SignatureTransfer'; const items = Array.isArray(m.permitted) ? m.permitted : [m.permitted]; if (!items.length) throw Error('Permitted token list cannot be empty.');
    items.forEach((d, i) => { if (!obj(d)) throw Error('Permitted token entry must be an object.'); const p = Array.isArray(m.permitted) ? `message.permitted[${i}]` : 'message.permitted'; const token = address(d.token, `${p}.token`); node(x, `token${i}`, 'token', 'Token', token, `${p}.token`); x.contracts.push(token); amount(x, d.amount, `${p}.amount`); }); requireNum(m.nonce, 'message.nonce'); deadline(x, m.deadline, 'message.deadline', 'Deadline');
    const explicitSpender = context?.spender; if (explicitSpender !== undefined) { node(x, 'spender', 'identity', 'Context spender', address(explicitSpender, 'spender'), 'spender'); items.forEach((_, i) => edge(x, `token${i}`, 'spender', 'single transfer context', 'spender', explicitSpender)); } else x.unknowns.push('The spender is not established by the typed data.');
    x.summary = 'This may authorize a one-time token transfer if accepted by Permit2. It does not itself create a persistent token allowance.'; x.unknowns.push('Actual signer, signature validity, and existing token approval to Permit2 are not established.');
  } else { x.summary = `Structured ${primaryType} typed data. No supported permission semantics were established.`; x.unknowns.push('Authorization behavior for this primary type is unknown.', 'Actual signer and signature validity are not established.'); addFinding(x, 'Unknown', 'Unrecognized authorization type', 'Fields were decoded, but ORIL does not infer permission behavior for this type.', [field('primaryType', primaryType)], 'Review the verifying contract and the complete typed-data schema.', 'unverified'); }
  if (x.kind.startsWith('Permit2') && !domain.verifyingContract) addFinding(x, 'Unknown', 'Verifying contract absent', 'The domain omits a verifying contract.', [field('domain', domain)], 'Confirm the intended Permit2 contract and chain.', 'verified field');
  return x;
}
export function inspect(input: string, network = 56): Inspection {
  if (!NETWORKS[network]) throw Error('Unsupported network.'); if (!input.trim()) throw Error('Paste a signature request to inspect.'); if (new TextEncoder().encode(input).length > MAX_SIZE) throw Error('Request exceeds the 100 KB limit.');
  const trimmed = input.trim(); const parsed = trimmed.startsWith('{') || trimmed.startsWith('[') ? json(trimmed) : trimmed; depth(parsed);
  const { payload, method, context } = unwrap(parsed); let value = payload;
  if (typeof value === 'string' && value.trim().startsWith('{')) { value = json(value); depth(value); }
  if (obj(value) && obj(value.domain) && obj(value.types)) return typed(value, network, parsed, context);
  if (method?.startsWith('eth_signTypedData')) throw Error('Typed-data RPC payload is missing a valid domain, types, primaryType, or message.');
  if (typeof value !== 'string') throw Error('Unsupported request. Provide EIP-712 typed data, personal-sign, or a SIWE message.');
  if (!method && !/^0x[0-9a-f]*$/i.test(value) && !value.includes('\n')) throw Error('Plain text needs a personal_sign JSON-RPC wrapper; SIWE messages may be pasted directly.');
  const message = decodePersonal(value); const siwe = parseSiwe(message); const x = base(network, siwe ? 'SIWE message' : 'EIP-191 personal sign', parsed); x.fields = siwe ? flatten(siwe, 'siwe') : [field('message', message)]; x.summary = siwe ? `Sign-in request for ${siwe.domain}.` : 'A personal message is being requested for signing.'; x.facts.push(siwe ? 'SIWE fields are structurally valid.' : 'Message content decoded.'); x.unknowns.push('No cryptographic signature was provided or verified.', 'Signing a message can have application-specific consequences.');
  if (siwe) { node(x, 'identity', 'identity', 'Claimed address', siwe.address, 'siwe.address'); x.claimedChain = Number(siwe['Chain ID']); if (x.claimedChain !== network) addFinding(x, 'Warning', 'SIWE chain differs from selected network', `Message declares chain ${x.claimedChain}; selected network is ${network}.`, [field('siwe.Chain ID', siwe['Chain ID'])], 'Confirm the intended chain in the requesting application.', 'verified field'); if (siwe['Expiration Time']) deadline(x, Math.floor(Date.parse(siwe['Expiration Time']) / 1000), 'siwe.Expiration Time', 'SIWE expiration'); }
  else addFinding(x, 'Informational', 'Message purpose requires context', 'The message text alone does not establish what an application will do with a signature.', [field('message', message)], 'Confirm the requesting site and intended use.', 'unverified');
  return x;
}
