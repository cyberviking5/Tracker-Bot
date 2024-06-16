export default <T>(x: any, property: string): x is T => {
  return (x as any)[property] !== undefined
}
