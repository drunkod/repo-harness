import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export interface OracleSessionEvidence {
  providerSessionId?: string;
  observation?: {
    source: 'oracle-session-metadata';
    sessionId: string;
    parentSessionId: string | null;
    conversationUrl?: string;
    promptSubmitted?: boolean;
    modelSelection?: unknown;
    appSelection?: unknown;
    thinkingSelection?: unknown;
  };
  /** Oracle recorded `browser.runtime.promptSubmitted: true` for this session. */
  promptSubmitted?: true;
  evidenceError?: string;
  networkCapture?: OracleNetworkCapture;
  conversationCapture?: OracleConversationCapture;
}

function readJson(path: string): Record<string, unknown> {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('invalid evidence file');
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid evidence object');
  return value as Record<string, unknown>;
}

/** The invocation owns the descriptor path; console output never supplies session identity. */
export function readOracleSessionEvidence(path: string, oracleHome: string, parentSessionId?: string): OracleSessionEvidence {
  try {
    const handle = readJson(path);
    if (handle.protocol !== 1 || handle.kind !== 'oracle-session'
      || typeof handle.sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(handle.sessionId)
      || handle.parentSessionId !== (parentSessionId ?? null)
      || Object.keys(handle).some(key => !['protocol', 'kind', 'sessionId', 'parentSessionId'].includes(key))) throw new Error('invalid session descriptor');
    const metadata = readJson(join(oracleHome, 'sessions', handle.sessionId, 'meta.json'));
    if (metadata.id !== handle.sessionId) throw new Error('session metadata identity mismatch');
    const browser = metadata.browser;
    const observation = browser && typeof browser === 'object' && !Array.isArray(browser) ? browser as Record<string, unknown> : {};
    const runtime = observation.runtime as { promptSubmitted?: unknown } | undefined;
    return {
      ...(runtime?.promptSubmitted === true ? { promptSubmitted: true as const } : {}),
      providerSessionId: handle.sessionId,
      observation: {
        source: 'oracle-session-metadata', sessionId: handle.sessionId, parentSessionId: handle.parentSessionId as string | null,
        modelSelection: observation.modelSelection,
        appSelection: observation.appSelection,
        thinkingSelection: observation.thinkingSelection,
      },
    };
  } catch (error) {
    return { evidenceError: error instanceof Error ? error.message : String(error) };
  }
}

/** Validate the invocation-owned upstream slug against Oracle's private metadata. */
export function readOracleProviderSessionMetadata(slug: string, oracleHome: string, parentSessionId?: string, allowRunning = false): OracleSessionEvidence {
  try {
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw new Error('invalid provider session slug');
    const metadata = readJson(join(oracleHome, 'sessions', slug, 'meta.json'));
    if (metadata.id !== slug || (metadata.status !== 'completed' && !(allowRunning && metadata.status === 'running'))) throw new Error('invalid provider session metadata');
    const browser = metadata.browser && typeof metadata.browser === 'object' ? metadata.browser as Record<string, unknown> : {};
    const options = metadata.options && typeof metadata.options === 'object' ? metadata.options as Record<string, unknown> : {};
    const parent = options.followupSessionId ?? null;
    if (parent !== (parentSessionId ?? null)) throw new Error('provider session lineage mismatch');
    const runtime = browser.runtime && typeof browser.runtime === 'object' ? browser.runtime as Record<string, unknown> : undefined;
    if (!runtime || typeof runtime.conversationId !== 'string' || runtime.promptSubmitted !== true) throw new Error('invalid browser runtime metadata');
    return { promptSubmitted: true, providerSessionId: slug, observation: { source: 'oracle-session-metadata', sessionId: slug, parentSessionId: parent as string | null, conversationUrl: typeof runtime.tabUrl === 'string' ? runtime.tabUrl : undefined, promptSubmitted: true, modelSelection: runtime.modelSelection, appSelection: runtime.appSelection, thinkingSelection: runtime.thinkingSelection } };
  } catch (error) { return { evidenceError: error instanceof Error ? error.message : String(error) }; }
}

export interface OracleNetworkCapture {
  readonly status: 'captured' | 'empty' | 'incomplete' | 'missing' | 'invalid';
  readonly path: string;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly sessionId: string | null;
}

function readPrivateEvidenceBytes(path: string, limit: number, requirePrivate = false): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || (requirePrivate && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())))) throw new Error('invalid evidence file');
    const bytes = readFileSync(fd);
    if (bytes.length > limit) throw new Error('invalid evidence file');
    return bytes;
  } finally { closeSync(fd); }
}

/** Retain transport provenance only; captured streams are not tool or revision receipts. */
export function readOracleNetworkCapture(path: string, sessionId: string | undefined, origin: string): OracleNetworkCapture {
  let bytes: Buffer;
  try { bytes = readPrivateEvidenceBytes(path, 64 * 1024 * 1024); }
  catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid', path, sha256: null, bytes: null, sessionId: null };
  }
  const basis = { path, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, sessionId: null };
  try {
    if (!sessionId) throw new Error('descriptor unavailable');
    const lines = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    const first = lines[0], last = lines.at(-1);
    // The exporter assigns a sequence before dropping the single over-limit record.
    const byteLimited = last?.event === 'capture_end' && last.status === 'incomplete'
      && Array.isArray(last.reasons) && last.reasons.includes('byte_limit');
    if (lines.length < 2 || lines.some((line, index) => !line || Array.isArray(line)
      || line.sequence !== index + 1 + (byteLimited && index === lines.length - 1 ? 1 : 0))) throw new Error('invalid capture sequence');
    if (!first || !last || first.event !== 'capture_start' || first.protocol !== 1 || first.kind !== 'oracle-page-response-streams'
      || first.sessionId !== sessionId || first.origin !== origin
      || last.event !== 'capture_end' || !['captured', 'empty', 'incomplete'].includes(last.status as string)
      || !Number.isInteger(last.streams) || (last.streams as number) < 0 || (last.streams as number) > 256
      || !Array.isArray(last.reasons) || !last.reasons.every(reason => typeof reason === 'string')
      || (last.status === 'empty' && last.streams !== 0) || (last.status === 'captured' && last.streams === 0)
      || (last.status !== 'incomplete' && last.reasons.length !== 0)
      || lines.slice(1, -1).some(line => line.event === 'capture_start' || line.event === 'capture_end')) throw new Error('invalid capture binding');
    return { ...basis, sessionId, status: last.status as 'captured' | 'empty' | 'incomplete' };
  } catch { return { ...basis, status: 'invalid' }; }
}

export interface OracleConversationCapture {
  readonly status: 'captured' | 'missing' | 'invalid';
  readonly sessionId: string | null;
  readonly conversationId: string | null;
  readonly sha256: string | null;
  readonly history: unknown;
}

export function readOracleProviderNativeCapture(slug: string, oracleHome: string): OracleConversationCapture {
  const invalid = (status: 'missing' | 'invalid'): OracleConversationCapture => ({ status, sessionId: null, conversationId: null, sha256: null, history: null });
  try {
    const meta = readJson(join(oracleHome, 'sessions', slug, 'meta.json'));
    const runtime = (meta.browser as Record<string, unknown>)?.runtime as Record<string, unknown> | undefined;
    const conversationId = typeof runtime?.conversationId === 'string' ? runtime.conversationId : undefined;
    if (meta.id !== slug || meta.status !== 'completed' || runtime?.promptSubmitted !== true || !conversationId) return invalid('invalid');
    const root = join(oracleHome, 'sessions', slug, 'artifacts');
    const rawPath = join(root, `conversation-${conversationId}-raw.json`);
    const evidencePath = join(root, `conversation-${conversationId}-evidence.json`);
    const raw = readPrivateEvidenceBytes(rawPath, 12 * 1024 * 1024, true);
    const evidence = readPrivateEvidenceBytes(evidencePath, 12 * 1024 * 1024, true);
    const value = JSON.parse(evidence.toString('utf8')) as Record<string, unknown>;
    if (value.schema !== 'oracle.provider-native-capture-evidence/v1' || value.conversationId !== conversationId) return invalid('invalid');
    const rawHash = createHash('sha256').update(raw).digest('hex');
    const document = value.materializedDocument;
    if (value.rawSha256 !== rawHash || value.rawBytes !== raw.length || !document || typeof document !== 'object') return invalid('invalid');
    const materialized = document as Record<string, unknown>;
    if (materialized.path !== `conversation-${conversationId}-raw.json` || materialized.sha256 !== rawHash || materialized.bytes !== raw.length) return invalid('invalid');
    return { status: 'captured', sessionId: slug, conversationId, sha256: createHash('sha256').update(evidence).digest('hex'), history: { raw: raw.toString('utf8'), evidence: value } };
  } catch (error) { return invalid((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid'); }
}

/** Only the invocation-owned path and completed session metadata can supply history. */
export function readOracleConversationCapture(path: string, sessionId: string | undefined, oracleHome: string): OracleConversationCapture {
  const invalid = (status: 'missing' | 'invalid'): OracleConversationCapture => ({status,sessionId:null,conversationId:null,sha256:null,history:null});
  try {
    const stat=lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) return invalid('invalid');
    const bytes=readPrivateEvidenceBytes(path, 12*1024*1024, true);
    const value=JSON.parse(bytes.toString('utf8'));
    if (!sessionId || value.protocol!==1 || value.kind!=='oracle-session-conversation-history' || value.sessionId!==sessionId) return invalid('invalid');
    const meta=readJson(join(oracleHome,'sessions',sessionId,'meta.json'));
    const runtime=(meta.browser as {runtime?:{conversationId?:string;promptSubmitted?:boolean}}|undefined)?.runtime;
    if(meta.id!==sessionId || meta.status!=='completed' || runtime?.promptSubmitted!==true || value.history?.conversationId!==runtime.conversationId) return invalid('invalid');
    return {status:'captured',sessionId,conversationId:runtime.conversationId!,sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex'),history:value.history};
  } catch(error) { return invalid((error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'invalid'); }
}
