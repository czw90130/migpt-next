import { ChatBot, type IMessage } from '@mi-gpt/chat';
import type { ChatConfig } from '@mi-gpt/chat/config';
import { OpenAI } from '@mi-gpt/openai';
import { deepMerge, sleep } from '@mi-gpt/utils';
import { jsonEncode } from '@mi-gpt/utils/parse';
import { BaseEngine, type IReply } from './base.js';

// @ts-ignore
import { version } from '../package.json';

const kBannerASCII = `

/ $$      /$$ /$$   /$$$$$$  /$$$$$$$ /$$$$$$$$$
| $$$    /$$$|__/ /$$__  $$| $$__  $$|__  $$__/
| $$$$  /$$$$ /$$| $$  \\__/| $$  \\ $$   | $$   
| $$ $$/$$ $$| $$| $$ /$$$$| $$$$$$$/   | $$   
| $$  $$$| $$| $$| $$|_  $$| $$____/    | $$   
| $$\\  $ | $$| $$| $$  \\ $$| $$         | $$   
| $$ \\/  | $$| $$|  $$$$$$/| $$         | $$   
|__/     |__/|__/ \\______/ |__/         |__/                         
                                                                                                                 
    MiGPT-Next v0.0.0  by: https://del.wang

`.replace('0.0.0', version);

export type EngineConfig<E extends BaseEngine> = ChatConfig & {
  debug?: boolean;
  /**
   * 唤醒词
   *
   * 当消息以唤醒词开头时，会调用 AI 来响应用户消息
   *
   * 比如：请，你
   */
  callAIKeywords?: string[];
  /**
   * 自定义消息处理钩子
   */
  onMessage?: (engine: E, msg: IMessage) => Promise<IReply | undefined>;
  /**
   * 是否启用"思考中"即时回复
   *
   * 当检测到 callAIKeywords 时，立即播放一个短语来打断小爱原回复
   *
   * @default true
   */
  enableThinkingResponse?: boolean;
  /**
   * "思考中"回复短语列表（不超过5个字）
   *
   * 会随机选择一个播放
   *
   * @default ['我想想', '思考中', '嗯...']
   */
  thinkingResponses?: string[];
};

const kDefaultConfig: EngineConfig<BaseEngine> = {
  debug: false,
  callAIKeywords: ['请', '你'],
  enableThinkingResponse: true,
  thinkingResponses: ['我想想', '思考中', '嗯...'],
};

export abstract class MiGPTEngine extends BaseEngine {
  config: EngineConfig<this> = {};

  async start(config?: EngineConfig<this>) {
    console.log(kBannerASCII);

    this.status = 'running';
    this.config = deepMerge(kDefaultConfig, config as any);

    if (this.config.debug) {
      console.log('🐛 配置参数：', jsonEncode(config, { prettier: true }));
    }

    ChatBot.init(config);
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    ChatBot.dispose();
  }

  lastMsg?: IMessage;
  async onMessage(msg: IMessage) {
    console.log(`🔥 ${msg.text}`);

    // 打印小爱的原始回复（如果有）
    if (msg.xiaoaiReply) {
      console.log(`🤖 小爱回复：${msg.xiaoaiReply}`);
    }

    OpenAI.cancel(this.lastMsg?.id);

    this.lastMsg = msg;

    let reply = await this.config.onMessage?.(this, msg);

    if (reply?.handled) {
      return;
    }

    if (reply && !reply.default) {
      await this._response(msg, reply);
      return;
    }

    if (this.config.callAIKeywords?.some((k) => msg.text.startsWith(k))) {
      // 打断原来的小爱回复
      await this.speaker.abortXiaoAI();

      // 立即播放"思考中"短语来打断小爱原回复
      if (this.config.enableThinkingResponse && this.config.thinkingResponses?.length) {
        const responses = this.config.thinkingResponses;
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        console.log(`💭 ${randomResponse}`);
        // 不阻塞，立即播放后继续执行
        this.speaker.play({ text: randomResponse, blocking: false });
      }

      // 调用 AI 回答问题
      reply = await this.askAI(msg);

      // 播放回复
      await this._response(msg, reply);
    }
  }

  async askAI(msg: IMessage): Promise<IReply> {
    const stream = await ChatBot.chatWithStream(msg, async () => {
      await this._response(msg, { text: '出错了，请稍后再试吧！' });
    });
    return { stream };
  }

  private async _response(ctx: IMessage, reply?: IReply) {
    const { text, url, stream } = reply ?? {};

    if (!text && !stream && !url) {
      return;
    }

    if (this._hasNewMsg(ctx) || this.status !== 'running') {
      stream?.cancel();
      return;
    }

    if (url || text) {
      console.log(`🔊 ${url || text}`);
      return this.speaker.play({ url, text, blocking: true });
    }

    while (true) {
      const { next, noMore } = stream!.read();
      if (!next && noMore) {
        break;
      }
      if (next) {
        if (this._hasNewMsg(ctx) || this.status !== 'running') {
          stream!.cancel();
          return;
        }
        console.log(`🔊 ${next}`);
        await this.speaker.play({ text: next, blocking: true });
      }
      await sleep(100);
    }
  }

  private _hasNewMsg(ctx: IMessage) {
    return (this.lastMsg?.timestamp ?? 0) > ctx.timestamp;
  }
}
