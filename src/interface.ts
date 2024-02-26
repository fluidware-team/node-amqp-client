import * as tls from 'tls';
import { ConsumeMessage, Options, Replies } from 'amqplib/properties';

export interface AmqpConfig {
  clientId?: string;
  brokers: string[];
  ssl?: boolean | tls.ConnectionOptions;
}

export interface PublishOptions {
  exchange: string;
  exchangeType?: 'direct' | 'topic' | 'headers' | 'fanout' | 'match';
  exchangeOptions?: Options.AssertExchange;
  routingKey?: string;
}

export interface Consumer {
  connect(prefetch?: number): Promise<void>;
  disconnect(): Promise<boolean>;
  subscribe(
    queue: string,
    onMessage: (msg: ConsumeMessage | null, ackOrNack: (nack?: boolean, requeue?: boolean) => void) => void,
    autoAck: boolean
  ): Promise<void>;
  subscribeToFanoutExchange(
    exchange: string,
    onMessage: (msg: ConsumeMessage | null, ackOrNack: (nack?: boolean, requeue?: boolean) => void) => void,
    autoAck: boolean
  ): Promise<void>;
}

export interface Producer {
  connect(prefetch?: number): Promise<void>;
  disconnect(): Promise<boolean>;
  assertExchange(
    exchange: string,
    type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
    options?: Options.AssertExchange
  ): Promise<Replies.AssertExchange>;
  assertQueue(queue: string, options?: Options.AssertQueue): Promise<Replies.AssertQueue>;
  publish(to: PublishOptions, content: Buffer, options?: Options.Publish): Promise<boolean>;
  sendToQueue(queue: string, content: Buffer, options?: Options.Publish): Promise<boolean>;
}
