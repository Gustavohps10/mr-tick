export interface Either<Failure, Success> {
  forwardFailure<NextSuccess>(): Either<Failure, NextSuccess>
  isFailure(): boolean
  isSuccess(): boolean
  readonly failure: Failure
  readonly success: Success
  map<NextSuccess>(
    transform: (value: Success) => NextSuccess,
  ): Either<Failure, NextSuccess>
  flatMap<NextSuccess>(
    transform: (value: Success) => Either<Failure, NextSuccess>,
  ): Either<Failure, NextSuccess>
  getOrElse(defaultValue: Success): Success
  unwrap(): Failure | Success
}

type EitherState<Failure, Success> =
  { kind: 'failure'; value: Failure } | { kind: 'success'; value: Success }

class EitherValue<Failure, Success> implements Either<Failure, Success> {
  constructor(private readonly state: EitherState<Failure, Success>) {}

  forwardFailure<NextSuccess>(): Either<Failure, NextSuccess> {
    return failure<Failure, NextSuccess>(this.failure)
  }

  isFailure(): boolean {
    return this.state.kind === 'failure'
  }

  isSuccess(): boolean {
    return this.state.kind === 'success'
  }

  get failure(): Failure {
    if (this.state.kind === 'failure') return this.state.value
    throw new Error('No failure value')
  }

  get success(): Success {
    if (this.state.kind === 'success') return this.state.value
    throw new Error('No success value')
  }

  map<NextSuccess>(
    transform: (value: Success) => NextSuccess,
  ): Either<Failure, NextSuccess> {
    if (this.state.kind === 'failure')
      return failure<Failure, NextSuccess>(this.state.value)
    return success(transform(this.state.value))
  }

  flatMap<NextSuccess>(
    transform: (value: Success) => Either<Failure, NextSuccess>,
  ): Either<Failure, NextSuccess> {
    if (this.state.kind === 'failure')
      return failure<Failure, NextSuccess>(this.state.value)
    return transform(this.state.value)
  }

  getOrElse(defaultValue: Success): Success {
    if (this.state.kind === 'failure') return defaultValue
    return this.state.value
  }

  unwrap(): Failure | Success {
    return this.state.value
  }
}

function success(): Either<never, void>
function success<Success>(value: Success): Either<never, Success>
function success<Success>(value?: Success): Either<never, Success | void> {
  return new EitherValue<never, Success | void>({ kind: 'success', value })
}

function failure<Failure, Success = never>(
  value: Failure,
): Either<Failure, Success> {
  return new EitherValue<Failure, Success>({ kind: 'failure', value })
}

export const Either = { success, failure }
