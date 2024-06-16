// waits while f returns true
export default (
  f: () => boolean,
  timeoutMs: number = -1,
  recheckMs: number = 50
) => {
  return new Promise<void>((resolve) => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      if (!f() || (timeoutMs !== -1 && Date.now() - startTime >= timeoutMs)) {
        clearInterval(interval)
        resolve()
      }
    }, recheckMs)
  })
}
