export interface IJWTService {
  generateToken<T extends Record<string, string>>(payload: T): string
  tokenIsValid(token: string): boolean
  decodeToken<T extends Record<string, string>>(token: string): T | undefined
}
