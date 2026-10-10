/**
 * Chave de armazenamento do member por conexão.
 * Normaliza dataSourceId para evitar caracteres que quebram no Keytar (ex.: @ e / no Windows).
 */
export function getMemberVaultKey(
  workspaceId: string,
  dataSourceId: string,
): string {
  const safe = dataSourceId.replace(/@/g, '__at__').replace(/\//g, '_')
  return `workspace-session-${workspaceId}-${safe}-member`
}
