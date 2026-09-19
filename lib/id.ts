// 客户端幂等 id：投票、表情反应、评论都要一个 v4 UUID 作为「同一笔」的凭据，
// 服务端按 UUID_PATTERN 校验（server/index.js）。不能用 crypto.randomUUID——
// 它只在安全上下文存在，手机走 http://<局域网 IP> 打开站点时是 undefined，
// 直接调用会在点击瞬间同步抛错，投票因此在真机上静默失败（界面照常翻页、
// 请求一个没发）。crypto.getRandomValues 不受安全上下文限制，统一用它拼 v4。
export function newId(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  const hex = Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
