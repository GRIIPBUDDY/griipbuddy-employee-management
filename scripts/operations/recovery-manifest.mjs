export const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/;
export function validateManifest(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.files) || !Array.isArray(value.references)) throw new Error('Invalid recovery manifest.');
  const files = new Map();
  for (const file of value.files) {
    if (!keyPattern.test(file.key) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10485760 || !/^[a-f0-9]{64}$/.test(file.sha256) || files.has(file.key)) throw new Error('Invalid or duplicate recovery file.');
    files.set(file.key, file);
  }
  for (const ref of value.references) {
    const file = files.get(ref.key);
    if (!file || file.sha256 !== ref.sha256 || file.size !== ref.size) throw new Error('Referenced document is missing or has invalid bytes.');
  }
  return files;
}
