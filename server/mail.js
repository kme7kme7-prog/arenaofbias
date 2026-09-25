// 邮件发送：零依赖 SMTP 客户端（node:net + node:tls）。
// 不用 nodemailer 的原因：deploy:vps 刻意不上传 node_modules（依赖升级要
// 单独人工审查安装），而发验证码是单一固定用途——一个服务器、一种邮件，
// 裸 SMTP 反而最省事。支持 465 隐式 TLS 与 587 STARTTLS，AUTH PLAIN/LOGIN。
// MAIL_DEV_LOG=1 时不连网，验证码打进服务器日志（本地调试与自动化测试），
// 生产严禁开启（会把验证码写进日志）。
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const timeoutMs = Number(process.env.MAIL_SMTP_TIMEOUT_MS || 20000);

export const mailDevLog = () => process.env.MAIL_DEV_LOG === '1';
export const mailReady = () =>
  Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );

const PURPOSE_TEXT = {
  register: '注册账号',
  bind: '绑定邮箱',
  reset: '重置密码',
};

// 一次 SMTP 会话：严格的请求-应答来回，同一时刻只有一个未决应答。
class SmtpSession {
  constructor(host) {
    this.host = host;
    this.buffer = '';
    this.pending = null;
    this.dead = null;
    this.replyLines = [];
  }
  attach(socket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs);
    socket.on('data', (chunk) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on('timeout', () => this.fail(new Error('SMTP 响应超时')));
    socket.on('error', (error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('SMTP 连接中断')));
  }
  fail(error) {
    if (!this.dead) this.dead = error;
    this.buffer = '';
    if (this.pending) {
      const { reject } = this.pending;
      this.pending = null;
      reject(error);
    }
    this.socket?.destroy();
  }
  // 应答可能多行：`250-续行` 直到 `250 终行`；逐行解析，终行时兑现读取
  flush() {
    while (this.pending) {
      const index = this.buffer.indexOf('\n');
      if (index === -1) return;
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      const match = line.match(/^(\d{3})([- ])/);
      if (!match) continue;
      this.replyLines.push(line.slice(4).trim());
      if (match[2] !== ' ') continue;
      const reply = {
        code: Number(match[1]),
        text: this.replyLines.join(' '),
      };
      this.replyLines = [];
      const { resolve } = this.pending;
      this.pending = null;
      resolve(reply);
    }
  }
  read() {
    if (this.dead) return Promise.reject(this.dead);
    if (this.pending)
      return Promise.reject(new Error('SMTP 会话正忙（并发读取）'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.flush();
    });
  }
  async expect(codes) {
    const reply = await this.read();
    if (!codes.includes(reply.code)) {
      this.socket?.destroy();
      throw new Error(`SMTP ${reply.code} ${reply.text}`);
    }
    return reply;
  }
  async command(line, codes) {
    if (this.dead) throw this.dead;
    this.socket.write(`${line}\r\n`);
    return this.expect(codes);
  }
}

const connect = (host, port) =>
  new Promise((resolve, reject) => {
    const session = new SmtpSession(host);
    if (port === 465) {
      session.attach(
        tls.connect({ host, port, servername: host, rejectUnauthorized: true }),
      );
      resolve(session);
      return;
    }
    const socket = net.connect({ host, port });
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.removeListener('error', reject);
      session.attach(socket);
      resolve(session);
    });
  });

// STARTTLS 升级：TLS 层要接管原始 socket 的数据流，先摘掉我们自己的监听
const upgradeTls = (session) =>
  new Promise((resolve, reject) => {
    const { socket } = session;
    socket.removeAllListeners('data');
    socket.removeAllListeners('timeout');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
    const secure = tls.connect({
      socket,
      servername: session.host,
      rejectUnauthorized: true,
    });
    secure.once('error', reject);
    secure.once('secureConnect', () => {
      session.attach(secure);
      resolve(session);
    });
  });

const ehloName = () => {
  try {
    return process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).hostname
      : 'arenaofbias.local';
  } catch {
    return 'arenaofbias.local';
  }
};

const encodeHeader = (value) =>
  `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const buildMessage = ({ from, fromName, to, subject, text }) => {
  const body = Buffer.from(text, 'utf8')
    .toString('base64')
    .match(/.{1,76}/g)
    .join('\r\n');
  const message = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@${from.split('@')[1] || 'arenaofbias.local'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '',
  ].join('\r\n');
  // 点填充：以 . 开头的行要双写，否则会被当成 DATA 的结束标记
  return message
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
};

export async function sendMail({ to, subject, text }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || 'Arena of Bias';
  const session = await connect(host, port);
  try {
    await session.expect([220]);
    let ehlo = await session.command(`EHLO ${ehloName()}`, [250]);
    if (port !== 465) {
      await session.command('STARTTLS', [220]);
      await upgradeTls(session);
      ehlo = await session.command(`EHLO ${ehloName()}`, [250]);
    }
    const mechanisms = ehlo.text.toUpperCase();
    if (mechanisms.includes('PLAIN')) {
      await session.command(
        `AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`,
        [235],
      );
    } else {
      await session.command('AUTH LOGIN', [334]);
      await session.command(Buffer.from(user).toString('base64'), [334]);
      await session.command(Buffer.from(pass).toString('base64'), [235]);
    }
    await session.command(`MAIL FROM:<${from}>`, [250]);
    await session.command(`RCPT TO:<${to}>`, [250, 251]);
    await session.command('DATA', [354]);
    session.socket.write(`${buildMessage({ from, fromName, to, subject, text })}\r\n.\r\n`);
    await session.expect([250]);
    session.socket.end('QUIT\r\n');
  } catch (error) {
    session.socket?.destroy();
    throw error;
  }
}

export async function sendVerificationEmail({ to, code, purpose }) {
  const action = PURPOSE_TEXT[purpose] || '验证';
  const subject = `Arena of Bias ${action}验证码`;
  const text = [
    `你正在${action}，验证码是：`,
    '',
    `    ${code}`,
    '',
    '验证码 10 分钟内有效，且只能使用一次。',
    '如果这不是你本人的操作，请忽略这封邮件。',
    '',
    '— Arena of Bias 偏见试验场',
  ].join('\n');
  if (mailDevLog()) {
    // 固定格式便于自动化测试解析；仅在 MAIL_DEV_LOG=1 时出现
    console.log(
      `[arenaofbias] 邮件验证码（MAIL_DEV_LOG）purpose=${purpose} email=${to} code=${code}`,
    );
    return { devLogged: true };
  }
  await sendMail({ to, subject, text });
  return { sent: true };
}
