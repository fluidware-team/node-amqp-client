import { AmqpConfig, Consumer } from '../interface';
import { getLogger } from '@fluidware-it/saddlebag';
import { AmqpClient } from './amqp-client';
import { ConsumeMessage } from 'amqplib/properties';

export class AmqpConsumer extends AmqpClient implements Consumer {
  constructor(config: AmqpConfig) {
    super(config);
    this.logger = getLogger().child({ component: 'amqp-consumer' });
  }

  async subscribe(
    queue: string,
    onMessage: (msg: ConsumeMessage | null, ackOrNack: (nack?: boolean, requeue?: boolean) => void) => void,
    autoAck: boolean
  ): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    if (!this.knownQueues.includes(queue)) {
      await this.assertQueue(queue, { durable: true });
    }
    await this.channel.consume(
      queue,
      (msg: ConsumeMessage | null) => {
        onMessage(msg, (nack = false, requeue = false) => {
          if (!msg) return;
          if (nack) {
            this.channel?.nack(msg, false, requeue);
          } else {
            this.channel?.ack(msg);
          }
        });
      },
      { noAck: autoAck }
    );
  }

  async subscribeToFanoutExchange(
    exchange: string,
    onMessage: (msg: ConsumeMessage | null, ackOrNack: (nack?: boolean, requeue?: boolean) => void) => void,
    autoAck: boolean
  ): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    if (!this.knownExchanges.includes(exchange)) {
      await this.assertExchange(exchange, 'fanout', { durable: true });
    }
    const queue = await this.channel.assertQueue('', {
      durable: false,
      exclusive: true
    });
    await this.channel.bindQueue(queue.queue, exchange, '');
    await this.channel.consume(
      queue.queue,
      (msg: ConsumeMessage | null) => {
        onMessage(msg, (nack = false, requeue = false) => {
          if (!msg) return;
          if (nack) {
            this.channel?.nack(msg, false, requeue);
          } else {
            this.channel?.ack(msg);
          }
        });
      },
      { noAck: autoAck }
    );
  }
}
