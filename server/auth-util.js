// 账号体系公共工具：auth.js（会话/登录）与 auth-email.js（邮箱/验证码）
// 共用，抽出来是为了让两边的依赖保持单向（auth-email → auth），不绕环。
import {
  randomBytes,
  scrypt as scryptCallback,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export const normalize = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validPassword = (value) =>
  typeof value === 'string' && value.length >= 12 && value.length <= 128;
// 邮箱校验走务实口径：覆盖常规个人邮箱，不做完整 RFC 5322——
// 真正的裁决权在 verification code 能不能送到，格式只挡明显手滑
export const validEmail = (value) =>
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
export const derive = (password, salt) =>
  scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
// 不存在的账号也跑一次同参数推导，抹平登录时序差
export const dummySalt = randomBytes(16).toString('hex');
