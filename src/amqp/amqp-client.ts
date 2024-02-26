/*
 * Copyright Fluidware srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AmqpConfig } from '../interface';
import { Channel, connect, Connection } from 'amqplib';
import { Options, Replies } from 'amqplib/properties';
import { getLogger } from '@fluidware-it/saddlebag';

export class AmqpClient {
  protected logger;

  protected readonly config: AmqpConfig;

  protected connection: Connection | undefined;
  protected connected = false;
  protected channel: Channel | undefined;

  protected knownExchanges: string[] = [];
  protected knownQueues: string[] = [];

  private currrentBroker = 0;

  constructor(config: AmqpConfig) {
    this.config = config;
    this.logger = getLogger().child({ component: 'amqp-client' });
  }

  async assertQueue(queue: string, options?: Options.AssertQueue): Promise<Replies.AssertQueue> {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    const ret = await this.channel.assertQueue(queue, options);
    this.knownQueues.push(queue);
    return ret;
  }

  async assertExchange(
    exchange: string,
    type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
    options?: Options.AssertExchange,
    bindTo?: {
      queue: string;
      pattern?: string;
    }
  ): Promise<Replies.AssertExchange> {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    const ret = await this.channel.assertExchange(exchange, type, options);
    this.knownExchanges.push(exchange);
    if (bindTo) {
      await this.channel.bindQueue(bindTo.queue, exchange, bindTo.pattern || '');
    }
    return ret;
  }

  public async connect(prefetch?: number): Promise<void> {
    if (this.connected) return;
    this.connection = await connect(this.config.brokers[this.currrentBroker], {
      clientProperties: { connection_name: this.config.clientId }
    });
    this.connected = true;
    this.connection.on('error', err => {
      if (err) {
        this.logger.error(`Connection error: ${err}`);
      } else {
        this.logger.error('Connection closed');
      }
      this.disconnect().catch(error => {
        this.logger.error(`Error on disconnect due to: ${error.message}`);
      });
      this.currrentBroker = (this.currrentBroker + 1) % this.config.brokers.length;
    });
    this.channel = await this.connection.createChannel();
    if (prefetch && prefetch > 0) {
      await this.channel.prefetch(prefetch);
    }
  }

  public async disconnect(): Promise<boolean> {
    if (!this.connected) return false;
    if (!this.connection) return false;
    try {
      await this.connection.close();
      return true;
    } catch (err) {
      this.logger.error(`Error on disconnect due to: ${err}`);
    } finally {
      this.connected = false;
      this.connection = undefined;
    }
    return false;
  }
}
