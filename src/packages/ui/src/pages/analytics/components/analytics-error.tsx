export function AnalyticsError({
  message,
  details,
}: {
  message: string
  details: Record<string, string[]> | undefined
}) {
  return (
    <div
      role="alert"
      className="w-full max-w-full min-w-0 space-y-1 text-sm [overflow-wrap:anywhere] break-words"
    >
      <p>{message}</p>
      {details !== undefined &&
        Object.entries(details).map(([field, messages]) => (
          <div key={field}>
            <span className="font-medium">{field}</span>
            {messages.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
        ))}
    </div>
  )
}
