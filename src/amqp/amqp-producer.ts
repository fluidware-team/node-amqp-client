import { AmqpConfig, Producer, PublishOptions } from '../interface';
import { getLogger } from '@fluidware-it/saddlebag';
import { Options } from 'amqplib/properties';
import { AmqpClient } from './amqp-client';

export class AmqpProducer extends AmqpClient implements Producer {
  constructor(config: AmqpConfig) {
    super(config);
    this.logger = getLogger().child({ component: 'amqp-producer' });
  }
  async publish(to: PublishOptions, content: Buffer, options?: Options.Publish) {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    if (!this.knownExchanges.includes(to.exchange)) {
      await this.assertExchange(to.exchange, to.exchangeType || 'direct', to.exchangeOptions);
    }
    return this.channel.publish(to.exchange, to.routingKey ?? '', content, options);
  }

  async sendToQueue(queue: string, content: Buffer, options?: Options.Publish) {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    if (!this.knownQueues.includes(queue)) {
      await this.assertQueue(queue, { durable: true });
    }
    return this.channel.sendToQueue(queue, content, options);
  }
}
