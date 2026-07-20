import type { ArtifactFile, ArtifactRecord, ArtifactView } from './types';

const STORAGE_KEY = 'deepseek_pp_artifacts';
const MAX_ARTIFACTS = 50;

export async function saveArtifact(input: {
  kind: ArtifactRecord['kind'];
  filename: string;
  mimeType: string;
  content: string;
  files?: ArtifactFile[];
  view?: ArtifactView;
}): Promise<ArtifactRecord> {
  const record: ArtifactRecord = {
    id: crypto.randomUUID(),
    kind: input.kind,
    filename: input.filename,
    mimeType: input.mimeType,
    content: input.content,
    sizeBytes: new TextEncoder().encode(input.content).length,
    createdAt: Date.now(),
    files: input.files,
    view: input.view,
  };
  const records = await getArtifacts();
  await chrome.storage.local.set({
    [STORAGE_KEY]: [record, ...records].slice(0, MAX_ARTIFACTS),
  });
  return record;
}

export async function getArtifact(id: string): Promise<ArtifactRecord | null> {
  return (await getArtifacts()).find((artifact) => artifact.id === id) ?? null;
}

export async function getArtifacts(): Promise<ArtifactRecord[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY) as Record<string, unknown>;
  const value = data[STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isArtifactRecord);
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as ArtifactRecord;
  return typeof record.id === 'string' &&
    (record.kind === 'file' || record.kind === 'bundle') &&
    typeof record.filename === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.content === 'string' &&
    typeof record.sizeBytes === 'number' &&
    typeof record.createdAt === 'number';
}
