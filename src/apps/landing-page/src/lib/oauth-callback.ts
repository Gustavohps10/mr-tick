export function createOAuthDesktopCallbackUrl(
  query: string,
  isDevelopment: boolean,
): string {
  const protocol = isDevelopment ? 'electron' : 'mr-tick'
  const callback = new URL(`${protocol}://oauth/callback`)
  callback.search = query
  return callback.toString()
}
