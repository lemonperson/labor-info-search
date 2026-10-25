export function openDatabaseOrRecover<T>(open: () => T, onFailure: (error: unknown) => void): T | null {
  try { return open() }
  catch (error) { onFailure(error); return null }
}
