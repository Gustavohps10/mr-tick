export interface ViewModel<Data = void> {
  isSuccess: boolean
  statusCode: number
  data?: Data
  error?: string
  /** Erros por campo (id do campo -> mensagens), quando a falha é de validação de formulário. */
  details?: Record<string, string[]>
}
