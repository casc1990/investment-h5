export const unwrapApiPayload = (payload) => {
  if (payload?.code === 0 && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data
  }
  return payload
}
